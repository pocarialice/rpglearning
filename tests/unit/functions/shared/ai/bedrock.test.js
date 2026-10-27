import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { converse, bedrockClient } from '../../../../../functions/shared/ai/bedrock.js'
import { bedrockMock, awsError } from '../../../../helpers/mocks.js'
import { converseOutput } from '../../../../fixtures/bedrock/grading.js'
const br = bedrockMock()
const messages = [{ role: 'user', content: [{ text: '秘密の説明文' }] }]
const args = { modelId: 'm', system: 's-秘密の指示', messages, maxTokens: 300, temperature: 0.7, timeoutMs: 5000, purpose: 'comment' }
describe('M-A01 bedrock', () => {
  let logSpy
  beforeEach(() => {
    br.reset()
    br.on(ConverseCommand).resolves(converseOutput('こんにちは', { inputTokens: 12, outputTokens: 5 }))
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.useRealTimers())
  it('MT-A01-01 コマンドの中身', async () => {
    await converse({ ...args, system: 's' })
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input).toEqual({ modelId: 'm', system: [{ text: 's' }], messages, inferenceConfig: { maxTokens: 300, temperature: 0.7 } })
  })
  it('MT-A01-02 応答の取り出し', async () => {
    expect(await converse(args)).toEqual({ text: 'こんにちは', usage: { inputTokens: 12, outputTokens: 5 }, stopReason: 'end_turn' })
    br.on(ConverseCommand).resolves({})
    expect(await converse(args)).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, stopReason: undefined })
    br.on(ConverseCommand).resolves({ output: { message: { content: [{ text: 'a' }, { toolUse: {} }, { text: 'b' }] } } })
    expect((await converse(args)).text).toBe('ab')
  })
  it('MT-A01-03 打ち切り', async () => {
    vi.useFakeTimers()
    let signal
    const send = vi.spyOn(bedrockClient(), 'send').mockImplementation((_cmd, opts) => {
      signal = opts.abortSignal
      return new Promise(() => {})
    })
    const p = converse(args)
    const check = expect(p).rejects.toMatchObject({ code: 'AI_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(5000)
    await check
    expect(signal.aborted).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('MT-A01-04 打ち切り前に返る', async () => {
    vi.useFakeTimers()
    vi.spyOn(bedrockClient(), 'send').mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(converseOutput('間に合った')), 4900)))
    const p = converse(args)
    await vi.advanceTimersByTimeAsync(4900)
    await expect(p).resolves.toMatchObject({ text: '間に合った' })
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['ThrottlingException', 'ValidationException'])('MT-A01-05 SDKのエラー（%s）', async (name) => {
    br.on(ConverseCommand).rejects(awsError(name))
    await expect(converse(args)).rejects.toMatchObject({ code: 'AI_ERROR', cause: name })
  })
  it('MT-A01-06 PDF・画像の入力', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const rich = [{ role: 'user', content: [
      { document: { format: 'pdf', name: 'source', source: { bytes } } },
      { image: { format: 'png', source: { bytes } } },
      { text: 'この資料から問題を抽出してください' }
    ] }]
    await converse({ ...args, messages: rich })
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages).toBe(rich)
  })
  it('MT-A01-07 ログ', async () => {
    await converse(args)
    const raw = logSpy.mock.calls.map((c) => c[0]).join('\n')
    const line = JSON.parse(logSpy.mock.calls[0][0])
    expect(line).toMatchObject({ purpose: 'comment', modelId: 'm', inputTokens: 12, outputTokens: 5 })
    expect(raw).not.toContain('秘密の説明文')
    expect(raw).not.toContain('秘密の指示')
    expect(raw).not.toContain('こんにちは')
  })
})
