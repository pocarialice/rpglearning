import { describe, it, expect, beforeEach, vi } from 'vitest'
import { converse, toChatMessages, requestBody, reasoningEffort, DEFAULT_BASE_URL, DEFAULT_REASONING_EFFORT } from '../../../../../functions/shared/ai/sakura.js'
import * as client from '../../../../../functions/shared/ai/client.js'
const messages = [{ role: 'user', content: [{ text: '秘密の説明文' }, { text: '2行目' }] }]
const args = { modelId: 'gpt-oss-120b', system: 's-秘密の指示', messages, maxTokens: 300, temperature: 0.7, timeoutMs: 5000, purpose: 'comment' }
const reply = (body, { status = 200 } = {}) => ({ ok: status < 400, status, json: async () => body })
const answer = (content, extra = {}) => reply({ choices: [{ message: { content }, finish_reason: 'stop', ...extra }], usage: { prompt_tokens: 12, completion_tokens: 5 } })
describe('M-A05 sakura', () => {
  let logSpy
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  it('MT-A05-01 リクエストの中身', async () => {
    const fetchFn = vi.fn(async () => answer('こんにちは'))
    await converse({ ...args, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://ai.test/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer test-ai-key' })
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-oss-120b', max_tokens: 300, temperature: 0.7, reasoning_effort: 'low',
      messages: [{ role: 'system', content: 's-秘密の指示' }, { role: 'user', content: '秘密の説明文\n2行目' }]
    })
    delete process.env.AI_BASE_URL
    await converse({ ...args, fetchFn })
    expect(fetchFn.mock.calls[1][0]).toBe(`${DEFAULT_BASE_URL}/chat/completions`)
  })
  it('MT-A05-02 応答の取り出し', async () => {
    expect(await converse({ ...args, fetchFn: async () => answer('こんにちは') })).toEqual({ text: 'こんにちは', usage: { inputTokens: 12, outputTokens: 5 }, stopReason: 'end_turn' })
    expect((await converse({ ...args, fetchFn: async () => answer('途中', { finish_reason: 'length' }) })).stopReason).toBe('max_tokens')
    expect(await converse({ ...args, fetchFn: async () => reply({}) })).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, stopReason: null })
    expect((await converse({ ...args, fetchFn: async () => answer(null, { finish_reason: 'tool_calls' }) })).stopReason).toBe('tool_calls')
  })
  it('MT-A05-03 ログに本文を出さない', async () => {
    await converse({ ...args, fetchFn: async () => answer('こんにちは') })
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(out).toContain('"msg":"ai.converse"')
    expect(out).toContain('"provider":"sakura"')
    expect(out).not.toContain('秘密')
    expect(out).not.toContain('test-ai-key')
  })
  it('MT-A05-04 HTTP のエラーは AI_ERROR', async () => {
    await expect(converse({ ...args, fetchFn: async () => reply({}, { status: 429 }) })).rejects.toMatchObject({ code: 'AI_ERROR', cause: 'HTTP_429' })
    await expect(converse({ ...args, fetchFn: async () => { throw new TypeError('fetch failed') } })).rejects.toMatchObject({ code: 'AI_ERROR', cause: 'TypeError' })
  })
  it('MT-A05-05 時間切れは AI_TIMEOUT', async () => {
    vi.useFakeTimers()
    const fetchFn = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const p = converse({ ...args, timeoutMs: 1000, fetchFn })
    const check = expect(p).rejects.toMatchObject({ code: 'AI_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1000)
    await check
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).toContain('"msg":"ai.timeout"')
  })
  it('MT-A05-06 文書・画像のブロックは送らない', async () => {
    const fetchFn = vi.fn()
    const doc = [{ role: 'user', content: [{ document: { format: 'pdf', source: { bytes: new Uint8Array(1) } } }, { text: '抽出して' }] }]
    await expect(converse({ ...args, messages: doc, fetchFn })).rejects.toMatchObject({ code: 'AI_ERROR', message: 'このAIは文書・画像を読めません' })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(toChatMessages('s', [{ role: 'assistant', content: '文字のまま' }])).toEqual([{ role: 'system', content: 's' }, { role: 'assistant', content: '文字のまま' }])
    expect(toChatMessages('s', [{ role: 'user' }])[1]).toEqual({ role: 'user', content: '' })
  })
  it('MT-A05-07 既定の fetch を使う', async () => {
    globalThis.fetch = vi.fn(async () => answer('ok'))
    expect((await converse(args)).text).toBe('ok')
  })
  it('MT-A05-08 考える深さ（reasoning_effort）を変える・送らない', async () => {
    expect(reasoningEffort({})).toBe(DEFAULT_REASONING_EFFORT)
    expect(requestBody(args, { AI_REASONING_EFFORT: 'medium' }).reasoning_effort).toBe('medium')
    expect(requestBody(args, { AI_REASONING_EFFORT: '' })).not.toHaveProperty('reasoning_effort')
    process.env.AI_REASONING_EFFORT = ''
    const fetchFn = vi.fn(async () => answer('ok'))
    await converse({ ...args, fetchFn })
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).not.toHaveProperty('reasoning_effort')
  })
  it('MT-A05-09 考えた分のトークン数と、上限で答えが空になったことをログに出す', async () => {
    const usage = { prompt_tokens: 12, completion_tokens: 300, completion_tokens_details: { reasoning_tokens: 300 } }
    const res = await converse({ ...args, fetchFn: async () => reply({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage }) })
    expect(res).toEqual({ text: '', usage: { inputTokens: 12, outputTokens: 300 }, stopReason: 'max_tokens' })
    const lines = logSpy.mock.calls.map((c) => JSON.parse(c[0]))
    expect(lines.find((l) => l.msg === 'ai.converse')).toMatchObject({ reasoningTokens: 300 })
    expect(lines.find((l) => l.msg === 'ai.empty_answer')).toMatchObject({ level: 'WARN', purpose: 'comment', maxTokens: 300, reasoningTokens: 300 })
    logSpy.mockClear()
    await converse({ ...args, fetchFn: async () => answer('途中まで', { finish_reason: 'length' }) })
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).not.toContain('ai.empty_answer')
  })
})
describe('M-A06 ai/client（差し替え口）', () => {
  it('MT-A06-01 既定はさくらのAI Engine', async () => {
    delete process.env.AI_PROVIDER
    expect(client.provider()).toBe('sakura')
    expect(client.supportsDocuments()).toBe(false)
    globalThis.fetch = vi.fn(async () => answer('さくら'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await client.converse(args)).text).toBe('さくら')
  })
  it('MT-A06-02 bedrock に切り替える', () => {
    process.env.AI_PROVIDER = 'bedrock'
    expect(client.provider()).toBe('bedrock')
    expect(client.supportsDocuments()).toBe(true)
  })
  it('MT-A06-03 知らない名前は例外', () => {
    process.env.AI_PROVIDER = 'openai'
    expect(() => client.converse(args)).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }))
  })
})
