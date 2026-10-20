import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { CommitTransactionCommand } from '@aws-sdk/client-rds-data'
vi.mock('../../../../functions/shared/db/repositories/imports.js')
import * as imports from '../../../../functions/shared/db/repositories/imports.js'
import { main, handler, importIdFromKey } from '../../../../functions/import-worker/index.mjs'
import { splitPdf, PermanentImportError } from '../../../../functions/import-worker/pdf-splitter.js'
import { splitText, normalizeDraft } from '../../../../functions/import-worker/extractor.js'
import { memoryLogger } from '../../../helpers/logger.js'
import { bedrockMock, s3Mock, rdsMock, routeSql, awsError } from '../../../helpers/aws-mocks.js'
import { converseOutput } from '../../../fixtures/bedrock/grading.js'
import { s3Message } from '../../../fixtures/events/sqs.js'
import { blankPdf } from '../../../fixtures/pdf/make.js'
const br = bedrockMock()
const s3 = s3Mock()
const rds = rdsMock()
let log
const body = (bytes) => ({ Body: { transformToByteArray: async () => bytes } })
const q = (n, patch = {}) => ({ body: `問${n}`, choices: ['ア', 'イ', 'ウ', 'エ'], correct: 1, explanation: '解説', keywords: ['DNS'], ...patch })
const extraction = (...qs) => converseOutput(JSON.stringify({ questions: qs }))
const job = (patch = {}) => ({ importId: 8, courseId: 3, sourceType: 'pdf', fileName: 'sample.pdf', status: 'waiting', ...patch })
const run = (key = 'uploads/8/sample.pdf', opts) => main({ Records: [s3Message(key, opts)] }, { log })
beforeEach(async () => {
  log = memoryLogger()
  br.reset()
  s3.reset()
  rds.reset()
  routeSql(rds, [])
  br.on(ConverseCommand).resolves(extraction(q(1)))
  s3.on(GetObjectCommand).resolves(body(await blankPdf(1)))
  imports.find.mockResolvedValue(job())
  imports.insertDrafts.mockImplementation(async (id, c, drafts) => drafts.length)
})
const saved = () => imports.insertDrafts.mock.calls[0]?.[2]
describe('M-W02 import-worker', () => {
  it('MT-W02-01 キーから取り込みID', async () => {
    expect(importIdFromKey('uploads/8/sample.pdf')).toBe(8)
    expect(importIdFromKey('uploads/8/%E8%A9%A6%E9%A8%93+%E5%95%8F%E9%A1%8C.pdf')).toBe(8)
    expect(importIdFromKey('notify/2026-10-20/0730.json')).toBeNull()
    await run('uploads/8/%E8%A9%A6%E9%A8%93+%E5%95%8F%E9%A1%8C.pdf')
    expect(imports.find).toHaveBeenCalledWith(8)
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({ Bucket: 'rpg-test-import', Key: 'uploads/8/試験 問題.pdf' })
  })
  it('MT-W02-02 処理済みの通知', async () => {
    imports.find.mockResolvedValue(job({ status: 'done' }))
    expect(await run()).toEqual({ batchItemFailures: [] })
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
    expect(await run()).toEqual({ batchItemFailures: [] })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: '50ページ以内に分けて取り込んでください' })
  })
  it('MT-W02-05 画像', async () => {
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'shot.PNG' }))
    s3.on(GetObjectCommand).resolves(body(new Uint8Array([137, 80, 78, 71])))
    await run('uploads/8/shot.PNG')
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
    expect(rds.commandCalls(CommitTransactionCommand)).toHaveLength(1)
  })
  it('MT-W02-11 一部のかたまりで失敗', async () => {
    s3.on(GetObjectCommand).resolves(body(await blankPdf(23)))
    br.on(ConverseCommand).resolvesOnce(extraction(q(1))).rejectsOnce(awsError('ThrottlingException')).resolves(extraction(q(3)))
    await run()
    expect(imports.insertDrafts).not.toHaveBeenCalled()
  })
  it('MT-W02-12 再試行（1・2回目）', async () => {
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    for (const receiveCount of ['1', '2']) {
      expect(await run(undefined, { receiveCount, messageId: `m-${receiveCount}` })).toEqual({ batchItemFailures: [{ itemIdentifier: `m-${receiveCount}` }] })
    }
    expect(imports.setStatus.mock.calls.map((c) => c[1])).toEqual(['extracting', 'extracting'])
  })
  it('MT-W02-13 再試行（3回目）', async () => {
    br.on(ConverseCommand).resolves(converseOutput('JSONではありません'))
    expect(await run(undefined, { receiveCount: '3' })).toEqual({ batchItemFailures: [] })
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: expect.stringContaining('抽出に失敗しました') })
  })
  it('MT-W02-14 壊れたPDF', async () => {
    s3.on(GetObjectCommand).resolves(body(new TextEncoder().encode('これはPDFではありません')))
    expect(await run(undefined, { receiveCount: '1' })).toEqual({ batchItemFailures: [] })
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: 'PDFとして読めませんでした。ファイルを確認してください' })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-W02-15 テキスト・JPEG・対応外の画像・知らないキー・取り込みがない・入口（handler）', async () => {
    imports.find.mockResolvedValue(job({ sourceType: 'text', fileName: 'テキスト' }))
    s3.on(GetObjectCommand).resolves(body(new TextEncoder().encode('問1 …\n\n問2 …')))
    await run('uploads/8/source.txt')
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages[0].content[0].text).toContain('<source>問1 …\n\n問2 …</source>')
    br.resetHistory()
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'a.jpg' }))
    await run('uploads/8/a.jpg')
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages[0].content[0].image.format).toBe('jpeg')
    imports.find.mockResolvedValue(job({ sourceType: 'image', fileName: 'a.gif' }))
    expect(await run('uploads/8/a.gif')).toEqual({ batchItemFailures: [] })
    expect(imports.setStatus).toHaveBeenLastCalledWith(8, 'failed', { errorMessage: expect.stringContaining('PNG・JPEG') })
    imports.find.mockClear()
    expect(await run('other/x.pdf')).toEqual({ batchItemFailures: [] })
    expect(imports.find).not.toHaveBeenCalled()
    imports.find.mockResolvedValue(null)
    expect(await run()).toEqual({ batchItemFailures: [] })
    expect(await main({}, { log })).toEqual({ batchItemFailures: [] })
    expect(await main({ Records: [{ messageId: 'x', body: '{}' }] }, { log })).toEqual({ batchItemFailures: [] })
    imports.setStatus.mockRejectedValue(awsError('BadRequestException'))
    imports.find.mockResolvedValue(job())
    expect(await run(undefined, { receiveCount: '3' })).toEqual({ batchItemFailures: [] })
    expect(log.lines.some((l) => l.msg === 'import.mark_failed_error')).toBe(true)
    imports.setStatus.mockResolvedValue(true)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await handler({ Records: [] }, { awsRequestId: 'r' })).toEqual({ batchItemFailures: [] })
    expect(JSON.parse(spy.mock.calls.at(-1)[0])).toMatchObject({ fn: 'import-worker', failures: 0 })
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
