// さくらのAI Engine（OpenAI 互換の Chat Completions API）の呼び出し（詳細設計書 3.6 M-A05）
import { AppError } from '../util/errors.js'
import { createLogger } from '../util/logger.js'
export const DEFAULT_BASE_URL = 'https://api.ai.sakura.ad.jp/v1'
const STOP_REASON = { stop: 'end_turn', length: 'max_tokens' }
// gpt-oss は答える前に考える（推論）。考えた分も max_tokens に入るため、既定は low にして短い用途でも答えが残るようにする。空文字なら送らない
export const DEFAULT_REASONING_EFFORT = 'low'
export function reasoningEffort(env = process.env) {
  return env.AI_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT
}
// Bedrock の Converse の形（content はブロックの配列）を、文字列の content に変える。文書・画像のブロックは扱えない
export function toChatMessages(system, messages) {
  const out = [{ role: 'system', content: system }]
  for (const m of messages) {
    const blocks = Array.isArray(m.content) ? m.content : [{ text: String(m.content ?? '') }]
    if (blocks.some((b) => b.text === undefined)) throw new AppError('AI_ERROR', 'このAIは文書・画像を読めません')
    out.push({ role: m.role, content: blocks.map((b) => b.text).join('\n') })
  }
  return out
}
export function requestBody({ modelId, system, messages, maxTokens, temperature }, env = process.env) {
  const body = { model: modelId, messages: toChatMessages(system, messages), max_tokens: maxTokens, temperature }
  const effort = reasoningEffort(env)
  if (effort) body.reasoning_effort = effort
  return body
}
export async function converse({ modelId, system, messages, maxTokens, temperature, timeoutMs = 25000, purpose = 'unknown', logger, fetchFn = globalThis.fetch }) {
  const log = logger ?? createLogger('ai')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetchFn(`${process.env.AI_BASE_URL ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify(requestBody({ modelId, system, messages, maxTokens, temperature })),
      signal: controller.signal
    })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { name: `HTTP_${res.status}` })
    const data = await res.json()
    const choice = data.choices?.[0] ?? {}
    const text = typeof choice.message?.content === 'string' ? choice.message.content : ''
    const usage = { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 }
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null
    const stopReason = STOP_REASON[choice.finish_reason] ?? choice.finish_reason ?? null
    log.info({ msg: 'ai.converse', provider: 'sakura', purpose, modelId, ...usage, reasoningTokens, stopReason, durationMs: Date.now() - started })
    // 考えているうちに上限に届くと、答えが空のまま返る。呼び出し側は定型文・失敗に切り替えるので、気づけるようにログだけ出す
    if (!text.trim() && stopReason === 'max_tokens') log.warn({ msg: 'ai.empty_answer', provider: 'sakura', purpose, modelId, maxTokens, ...usage, reasoningTokens })
    return { text, usage, stopReason }
  } catch (err) {
    if (err instanceof AppError) throw err
    if (controller.signal.aborted) {
      log.warn({ msg: 'ai.timeout', provider: 'sakura', purpose, modelId, code: 'AI_TIMEOUT', timeoutMs })
      throw new AppError('AI_TIMEOUT')
    }
    log.warn({ msg: 'ai.error', provider: 'sakura', purpose, modelId, code: 'AI_ERROR', errorName: err?.name })
    throw new AppError('AI_ERROR', undefined, { cause: err?.name })
  } finally {
    clearTimeout(timer)
  }
}
