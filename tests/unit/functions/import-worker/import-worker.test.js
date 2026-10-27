import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { GetObjectCommand } from '@aws-sdk/client-s3'
vi.mock('../../../../functions/shared/db/repositories/imports.js')
import * as imports from '../../../../functions/shared/db/repositories/imports.js'
import { runImportJob, processImport, buildChunks, FAILED_MESSAGE, RETRY_DELAY_SECONDS } from '../../../../functions/import-worker/index.mjs'
import { pdfTextChunks } from '../../../../functions/import-worker/pdf-text.js'
import { splitPdf, PermanentImportError } from '../../../../functions/import-worker/pdf-splitter.js'
import { splitText, normalizeDraft } from '../../../../functions/import-worker/extractor.js'
import { memoryLogger } from '../../../helpers/logger.js'
import { bedrockMock, s3Mock, dbMock, awsError } from '../../../helpers/mocks.js'
import { converseOutput } from '../../../fixtures/bedrock/grading.js'
import { blankPdf, textPdf } from '../../../fixtures/pdf/make.js'
const br = bedrockMock()
const s3 = s3Mock()
const db = dbMock()
let log
const body = (bytes) => ({ Body: { transformToByteArray: async () => bytes } })
const q = (n, patch = {}) => ({ body: `問${n}`, choices: ['ア', 'イ', 'ウ', 'エ'], correct: 1, explanation: '解説', keywords: ['DNS'], ...patch })
const extraction = (...qs) => converseOutput(JSON.stringify({ questions: qs }))
const job = (patch = {}) => ({ importId: 8, courseId: 3, sourceType: 'pdf', fileName: 'sample.pdf', s3Key: 'uploads/8/sample.pdf', status: 'waiting', ...patch })
// ワーカーがジョブキューから取り出した1件（attempts は何回目か）
const run = (attempts = 1) => runImportJob({ jobId: 1, payload: { importId: 8 }, attempts, maxAttempts: 3 }, { log })
beforeEach(async () => {
  log = memoryLogger()
  br.reset()
  s3.reset()
  db.reset()
  br.on(ConverseCommand).resolves(extraction(q(1)))
  s3.on(GetObjectCommand).resolves(body(await blankPdf(1)))
  imports.find.mockResolvedValue(job())
  imports.insertDrafts.mockImplementation(async (id, c, drafts) => drafts.length)
})
const saved = () => imports.insertDrafts.mock.calls[0]?.[2]
describe('M-W02 import-worker', () => {
  it('MT-W02-01 取り込みのキーで原本を読む', async () => {
    imports.find.mockResolvedValue(job({ s3Key: 'uploads/8/試験 問題.pdf' }))
    expect(await run()).toMatchObject({ outcome: 'done', status: 'done', extracted: 1 })
    expect(imports.find).toHaveBeenCalledWith(8)
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({ Bucket: 'rpg-test-import', Key: 'uploads/8/試験 問題.pdf' })
    expect(imports.setStatus.mock.calls[0]).toEqual([8, 'extracting'])
  })
  it('MT-W02-02 処理済み・取り込みがない', async () => {
    imports.find.mockResolvedValue(job({ status: 'done' }))
    expect(await run()).toEqual({ outcome: 'done', status: 'skipped' })
    imports.find.mockResolvedValue(null)
    expect(await run()).toEqual({ outcome: 'done', status: 'skipped' })
    expect(imports.setStatus).not.toHaveBeenCalled()
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it.each([[1, [1]], [10, [10]], [11, [10, 1]], [23, [10, 10, 3]]])('MT-W02-03 PDFの分割（%iページ）', async (pages, expected) => {
    const chunks = await splitPdf(await blankPdf(pages))
    expect(chunks.map((c) => c.pages)).toEqual(expected)
    expect(chunks[0].bytes).toBeInstanceOf(Uint8Array)
  })
  it('MT-W02-04 ページ数の上限', async () => {
    s3.on(GetObjectCommand).resolves(body(await blankPdf(50)))
    await run()
    expect(br.commandCalls(ConverseCommand)).toHaveLength(5)
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'done', { extractedCount: 5 }, expect.anything())
    br.reset()
    imports.setStatus.mockClear()
    s3.on(GetObjectCommand).resolves(body(await blankPdf(51)))
    expect(await run()).toEqual({ outcome: 'failed', error: '50ページ以内に分けて取り込んでください' })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: '50ページ以内に分けて取り込んでください' })
  })
  it('MT-W02-05 画像', async () => {
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'shot.PNG' }))
    s3.on(GetObjectCommand).resolves(body(new Uint8Array([137, 80, 78, 71])))
    await run()
    const calls = br.commandCalls(ConverseCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0].args[0].input.messages[0].content[0]).toEqual({ image: { format: 'png', source: { bytes: new Uint8Array([137, 80, 78, 71]) } } })
    expect(calls[0].args[0].input).toMatchObject({ modelId: 'model-high', inferenceConfig: { maxTokens: 8000, temperature: 0 } })
  })
  it('MT-W02-06 テキストの分割', () => {
    const para = (i) => `${i}`.padEnd(998, 'あ')
    const text = Array.from({ length: 20 }, (_, i) => para(i)).join('\n\n')
    expect(text.length).toBe(20 * 998 + 19 * 2)
    const chunks = splitText(text)
    expect(chunks).toHaveLength(3)
    expect(chunks.every((c) => c.length <= 8000)).toBe(true)
    const rejoined = chunks.join('\n\n').split('\n\n')
    expect(rejoined).toEqual(Array.from({ length: 20 }, (_, i) => para(i)))
  })
  it('MT-W02-07 正規化（選択肢の数）', () => {
    expect(normalizeDraft(q(1, { choices: ['ア', 'イ', 'ウ'] }))).toMatchObject({ status: 'needs_review', choices: ['ア', 'イ', 'ウ'] })
    expect(normalizeDraft(q(1))).toMatchObject({ status: 'draft', correct: 1 })
  })
  it.each([null, 5])('MT-W02-08 正規化（正解なし %s）', (correct) => {
    expect(normalizeDraft(q(1, { correct }))).toMatchObject({ correct: null, status: 'needs_review' })
  })
  it('MT-W02-09 正規化（キーワード）', () => {
    expect(normalizeDraft(q(1, { keywords: ['DNS', 'dns ', 'DNS', 'A', 'B'] })).keywords).toEqual(['DNS', 'A', 'B'])
  })
  it('MT-W02-10 正規化（問題文が空）', async () => {
    br.on(ConverseCommand).resolves(extraction(q(1), q(2, { body: '' }), q(3), q(4), q(5)))
    await run()
    expect(saved()).toHaveLength(4)
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'done', { extractedCount: 4 }, expect.anything())
    expect(db.commits()).toBe(1)
  })
  it('MT-W02-11 一部のかたまりで失敗', async () => {
    s3.on(GetObjectCommand).resolves(body(await blankPdf(23)))
    br.on(ConverseCommand).resolvesOnce(extraction(q(1))).rejectsOnce(awsError('ThrottlingException')).resolves(extraction(q(3)))
    await run()
    expect(imports.insertDrafts).not.toHaveBeenCalled()
  })
  it('MT-W02-12 やり直し（1・2回目）は待ち状態に戻す', async () => {
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    for (const attempts of [1, 2]) {
      expect(await run(attempts)).toEqual({ outcome: 'retry', error: expect.any(String), delaySeconds: RETRY_DELAY_SECONDS })
    }
    expect(imports.setStatus.mock.calls.map((c) => c[1])).toEqual(['extracting', 'waiting', 'extracting', 'waiting'])
    expect(log.lines.filter((l) => l.msg === 'import.retry')).toHaveLength(2)
  })
  it('MT-W02-13 やり直し（3回目）は失敗にする', async () => {
    br.on(ConverseCommand).resolves(converseOutput('JSONではありません'))
    expect((await run(3)).outcome).toBe('failed')
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: FAILED_MESSAGE })
    expect(log.lines.some((l) => l.msg === 'import.failed')).toBe(true)
  })
  it('MT-W02-14 壊れたPDF', async () => {
    s3.on(GetObjectCommand).resolves(body(new TextEncoder().encode('これはPDFではありません')))
    expect((await run()).outcome).toBe('failed')
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: 'PDFとして読めませんでした。ファイルを確認してください' })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-W02-15 テキスト・JPEG・対応外の画像・失敗の記録が書けない', async () => {
    imports.find.mockResolvedValue(job({ sourceType: 'text', fileName: 'テキスト', s3Key: 'uploads/8/source.txt' }))
    s3.on(GetObjectCommand).resolves(body(new TextEncoder().encode('問1 …\n\n問2 …')))
    await run()
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages[0].content[0].text).toContain('<source>問1 …\n\n問2 …</source>')
    br.resetHistory()
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'a.jpg' }))
    await run()
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages[0].content[0].image.format).toBe('jpeg')
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'a.gif' }))
    expect((await run()).outcome).toBe('failed')
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: expect.stringContaining('PNG・JPEG') })
    // 失敗の記録も書けないときは、ワーカーに例外を返す（ジョブを failed にする）
    imports.find.mockResolvedValue(job())
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    imports.setStatus.mockImplementation(async (id, status) => { if (status !== 'extracting') throw new Error('db down') })
    await expect(run(3)).rejects.toThrow('db down')
  })
  it('MT-W02-16 正規化の細部（空白・長さ・選択肢の上限・形の崩れ）', () => {
    expect(normalizeDraft(null)).toBeNull()
    expect(normalizeDraft({ body: '  ' })).toBeNull()
    const d = normalizeDraft({ body: ' 問 ', choices: Array.from({ length: 12 }, (_, i) => ` 選択肢${i} `), correct: 2, explanation: null, keywords: 'DNS' })
    expect(d).toMatchObject({ body: '問', explanation: '', keywords: [], status: 'needs_review', correct: 2 })
    expect(d.choices).toHaveLength(10)
    expect(normalizeDraft(q(1, { keywords: ['a'.repeat(51), 'b'] })).keywords).toEqual(['b'])
    expect(normalizeDraft(q(1, { choices: ['ア', 'イ'], correct: 3 })).correct).toBeNull()
    expect(normalizeDraft(q(1, { choices: undefined })).choices).toEqual([])
    expect(splitText('a'.repeat(9000))).toEqual(['a'.repeat(8000), 'a'.repeat(1000)])
    expect(splitText('')).toEqual([])
    expect(new PermanentImportError('x').name).toBe('PermanentImportError')
  })
})
describe('M-W02 import-worker（さくらのAI Engine：PDF・画像を読めないAI）', () => {
  beforeEach(() => {
    delete process.env.AI_PROVIDER
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [q(1)] }) }, finish_reason: 'stop' }] }) }))
  })
  it('MT-W02-17 PDFは文字を取り出してから渡す', async () => {
    s3.on(GetObjectCommand).resolves(body(await textPdf(['Question 1 DNS', 'Question 2 TTL'])))
    expect(await run()).toMatchObject({ outcome: 'done', extracted: 1 })
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(sent.messages[1].content).toContain('Question 1 DNS')
    expect(sent.messages[1].content).toContain('Question 2 TTL')
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-W02-18 文字のないPDF・画像は取り込めない', async () => {
    s3.on(GetObjectCommand).resolves(body(await blankPdf(2)))
    expect(await run()).toEqual({ outcome: 'failed', error: expect.stringContaining('PDFから文字を読み取れませんでした') })
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'a.png' }))
    expect(await run()).toEqual({ outcome: 'failed', error: expect.stringContaining('画像の取り込みは、いまのAIでは使えません') })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  it('MT-W02-19 文字のかたまり（10ページずつ・上限・読めない）', async () => {
    const pages = Array.from({ length: 23 }, (_, i) => `p${i + 1}`)
    const chunks = await pdfTextChunks(new Uint8Array(1), { extract: async () => pages })
    expect(chunks).toHaveLength(3)
    expect(chunks[2]).toBe('p21\n\np22\n\np23')
    await expect(pdfTextChunks(new Uint8Array(1), { extract: async () => Array(51).fill('x') })).rejects.toThrow('50ページ以内')
    await expect(pdfTextChunks(new Uint8Array(1), { extract: async () => { throw new Error('bad') } })).rejects.toThrow('PDFとして読めませんでした')
    await expect(pdfTextChunks(new TextEncoder().encode('not pdf'))).rejects.toThrow('PDFとして読めませんでした')
    // Bedrock のときは PDF のまま渡す
    const asPdf = await buildChunks(job(), await blankPdf(1), { documents: true })
    expect(asPdf[0]).toMatchObject({ chunkType: 'pdf', name: 'p1-1' })
  })
  it('MT-W02-20 processImport を直接呼ぶ', async () => {
    imports.find.mockResolvedValue(job({ sourceType: 'text', s3Key: 'uploads/8/source.txt' }))
    s3.on(GetObjectCommand).resolves(body(new TextEncoder().encode('問1')))
    expect(await processImport(8, { log })).toEqual({ status: 'done', extracted: 1 })
  })
})
