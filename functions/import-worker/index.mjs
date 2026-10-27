// 問題の取り込み（詳細設計書 4.4）。ワーカーがジョブキュー（kind=import）から取り出して呼ぶ
import { getBytes } from '../shared/storage/object-storage.js'
import { supportsDocuments } from '../shared/ai/client.js'
import { withTx } from '../shared/db/tx.js'
import * as imports from '../shared/db/repositories/imports.js'
import { splitPdf, PermanentImportError } from './pdf-splitter.js'
import { pdfTextChunks } from './pdf-text.js'
import { splitText, normalizeDraft, extractChunk } from './extractor.js'
export const RETRY_DELAY_SECONDS = 60
export const FAILED_MESSAGE = '問題の抽出に失敗しました。時間をおいてもう一度取り込んでください'
function imageFormat(job) {
  const ext = job.fileName.toLowerCase().split('.').pop()
  if (ext === 'png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  throw new PermanentImportError('対応していない画像の形式です（PNG・JPEGのみ）')
}
// AI が PDF・画像を読めるとき（Bedrock）はそのまま渡し、読めないとき（さくらのAI Engine）は PDF を文字にする
export async function buildChunks(job, bytes, { documents = supportsDocuments() } = {}) {
  if (job.sourceType === 'pdf') {
    if (documents) return (await splitPdf(bytes)).map((c) => ({ chunkType: 'pdf', name: c.name, bytes: c.bytes }))
    return (await pdfTextChunks(bytes)).flatMap((t) => splitText(t)).map((text) => ({ chunkType: 'text', text }))
  }
  if (job.sourceType === 'image') {
    if (!documents) throw new PermanentImportError('画像の取り込みは、いまのAIでは使えません。テキストかPDFで取り込んでください')
    return [{ chunkType: 'image', format: imageFormat(job), bytes }]
  }
  return splitText(new TextDecoder().decode(bytes)).map((text) => ({ chunkType: 'text', text }))
}
export async function processImport(importId, { log }) {
  const job = await imports.find(importId)
  if (!job || job.status === 'done' || job.status === 'failed') {
    log.info({ msg: 'import.skip', importId, status: job?.status ?? 'missing' })
    return { status: 'skipped' }
  }
  await imports.setStatus(importId, 'extracting')
  const bytes = await getBytes(process.env.IMPORT_BUCKET, job.s3Key)
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
  return { status: 'done', extracted: drafts.length }
}
// ジョブ1件の処理。やり直しても結果が変わらない失敗と、回数を使い切った失敗は取り込みを failed にする
export async function runImportJob(job, { log }) {
  const importId = Number(job.payload.importId)
  try {
    const res = await processImport(importId, { log })
    return { outcome: 'done', ...res }
  } catch (err) {
    if (err instanceof PermanentImportError) {
      log.warn({ msg: 'import.failed_permanent', importId, reason: err.message })
      await imports.setStatus(importId, 'failed', { errorMessage: err.message })
      return { outcome: 'failed', error: err.message }
    }
    if (job.attempts >= job.maxAttempts) {
      log.error({ msg: 'import.failed', importId, attempts: job.attempts, code: err.code ?? 'INTERNAL_ERROR', err })
      await imports.setStatus(importId, 'failed', { errorMessage: FAILED_MESSAGE })
      return { outcome: 'failed', error: err.message }
    }
    log.warn({ msg: 'import.retry', importId, attempts: job.attempts, code: err.code ?? 'INTERNAL_ERROR' })
    await imports.setStatus(importId, 'waiting')
    return { outcome: 'retry', error: err.message, delaySeconds: RETRY_DELAY_SECONDS }
  }
}
