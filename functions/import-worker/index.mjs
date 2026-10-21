// import-worker の入口（詳細設計書 4.1・4.4）。SQS（本文はS3のイベント通知）から起動される
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { createLogger } from '../shared/util/logger.js'
import { requireEnv } from '../shared/util/env.js'
import { setDefaultResumeRetries } from '../shared/db/data-api.js'
import { withTx } from '../shared/db/tx.js'
import * as imports from '../shared/db/repositories/imports.js'
import { splitPdf, PermanentImportError } from './pdf-splitter.js'
import { splitText, normalizeDraft, extractChunk } from './extractor.js'
export const ENV = requireEnv(['APP_ENV', 'DB_CLUSTER_ARN', 'DB_SECRET_ARN', 'DB_NAME', 'MODEL_HIGH', 'IMPORT_BUCKET'])
export const MAX_RECEIVE = 3
setDefaultResumeRetries(6)
let s3
const s3Client = () => (s3 ??= new S3Client({}))
// S3 のキー（URLエンコード、空白は +）から取り込みIDを取り出す
export function importIdFromKey(rawKey) {
  const key = decodeURIComponent(String(rawKey).replace(/\+/g, ' '))
  const m = /^uploads\/(\d+)\//.exec(key)
  return m ? Number(m[1]) : null
}
async function readObject(key) {
  const res = await s3Client().send(new GetObjectCommand({ Bucket: process.env.IMPORT_BUCKET, Key: key }))
  return new Uint8Array(await res.Body.transformToByteArray())
}
function imageFormat(job) {
  const ext = job.fileName.toLowerCase().split('.').pop()
  if (ext === 'png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  throw new PermanentImportError('対応していない画像の形式です（PNG・JPEGのみ）')
}
async function buildChunks(job, bytes) {
  if (job.sourceType === 'pdf') return (await splitPdf(bytes)).map((c) => ({ chunkType: 'pdf', name: c.name, bytes: c.bytes }))
  if (job.sourceType === 'image') return [{ chunkType: 'image', format: imageFormat(job), bytes }]
  return splitText(new TextDecoder().decode(bytes)).map((text) => ({ chunkType: 'text', text }))
}
export async function processRecord(record, { log }) {
  const event = JSON.parse(record.body)
  for (const s3rec of event.Records ?? []) {
    const rawKey = s3rec.s3.object.key
    const importId = importIdFromKey(rawKey)
    if (!importId) {
      log.warn({ msg: 'import.unknown_key' })
      continue
    }
    const job = await imports.find(importId)
    if (!job || job.status === 'done' || job.status === 'failed') {
      log.info({ msg: 'import.skip', importId, status: job?.status ?? 'missing' })
      continue
    }
    await imports.setStatus(importId, 'extracting')
    const bytes = await readObject(decodeURIComponent(String(rawKey).replace(/\+/g, ' ')))
    const chunks = await buildChunks(job, bytes)
    // かたまりごとの抽出がすべてそろってから1つのトランザクションで保存する（途中で失敗したら何も保存しない）
    const drafts = []
    for (const chunk of chunks) {
      for (const q of await extractChunk(chunk, { log })) {
        const d = normalizeDraft(q)
        if (d) drafts.push(d)
      }
    }
    await withTx(async (tx) => {
      await imports.insertDrafts(importId, job.courseId, drafts, tx)
      await imports.setStatus(importId, 'done', { extractedCount: drafts.length }, tx)
    })
    log.info({ msg: 'import.done', importId, chunks: chunks.length, extracted: drafts.length })
  }
}
async function markFailed(record, message, log) {
  try {
    const event = JSON.parse(record.body)
    for (const s3rec of event.Records ?? []) {
      const importId = importIdFromKey(s3rec.s3.object.key)
      if (importId) await imports.setStatus(importId, 'failed', { errorMessage: message })
    }
  } catch (err) {
    log.error({ msg: 'import.mark_failed_error', err })
  }
}
export async function main(event, { log }) {
  const batchItemFailures = []
  for (const record of event.Records ?? []) {
    try {
      await processRecord(record, { log })
    } catch (err) {
      const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? '1')
      if (err instanceof PermanentImportError) {
        log.warn({ msg: 'import.failed_permanent', reason: err.message })
        await markFailed(record, err.message, log)
      } else if (receiveCount >= MAX_RECEIVE) {
        log.error({ msg: 'import.failed', receiveCount, code: err.code ?? 'INTERNAL_ERROR', err })
        await markFailed(record, '問題の抽出に失敗しました。時間をおいてもう一度取り込んでください', log)
      } else {
        log.warn({ msg: 'import.retry', receiveCount, code: err.code ?? 'INTERNAL_ERROR' })
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
  }
  return { batchItemFailures }
}
export const handler = async (event, context) => {
  const log = createLogger('import-worker', { requestId: context?.awsRequestId })
  const started = Date.now()
  const res = await main(event, { log })
  log.info({ durationMs: Date.now() - started, failures: res.batchItemFailures.length })
  return res
}
