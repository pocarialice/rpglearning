// Amazon Bedrock の Converse API 呼び出し（詳細設計書 3.6 M-A01）。AI_PROVIDER=bedrock のときに使う
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { AppError } from '../util/errors.js'
import { createLogger } from '../util/logger.js'
let client
function getClient() {
  client ??= new BedrockRuntimeClient({ maxAttempts: 2 })
  return client
}
// messages はそのまま渡す（text・image・document のブロックを含められる）
export async function converse({ modelId, system, messages, maxTokens, temperature, timeoutMs = 25000, purpose = 'unknown', logger }) {
  const log = logger ?? createLogger('bedrock')
  const controller = new AbortController()
  const command = new ConverseCommand({
    modelId,
    system: [{ text: system }],
    messages,
    inferenceConfig: { maxTokens, temperature }
  })
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new AppError('AI_TIMEOUT'))
    }, timeoutMs)
  })
  const started = Date.now()
  try {
    const res = await Promise.race([getClient().send(command, { abortSignal: controller.signal }), timeout])
    const text = (res.output?.message?.content ?? []).map((c) => c.text ?? '').join('')
    const usage = { inputTokens: res.usage?.inputTokens ?? 0, outputTokens: res.usage?.outputTokens ?? 0 }
    log.info({ msg: 'bedrock.converse', purpose, modelId, ...usage, stopReason: res.stopReason, durationMs: Date.now() - started })
    return { text, usage, stopReason: res.stopReason }
  } catch (err) {
    if (err instanceof AppError) {
      log.warn({ msg: 'bedrock.timeout', purpose, modelId, code: err.code, timeoutMs })
      throw err
    }
    log.warn({ msg: 'bedrock.error', purpose, modelId, code: 'AI_ERROR', errorName: err?.name })
    throw new AppError('AI_ERROR', undefined, { cause: err?.name })
  } finally {
    clearTimeout(timer)
  }
}
export { getClient as bedrockClient }
