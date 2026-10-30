// AI につながるか・速さ・答えの形を、本番と同じ指示文と設定で確かめる（構築手順書 3.5・5.5、詳細設計書 12 No.3）
// 使い方：AI_API_KEY=... MODEL_HIGH=... MODEL_LIGHT=... node scripts/check-ai.mjs [--only=comment,grading] [--repeat=3] [--long]
// --long は打ち切り時間を300秒にして、本当にかかる時間を測る。DB・メールにはつながない。送るのは見本の問題だけ（個人情報なし）
import { pathToFileURL } from 'node:url'
import { converse as defaultConverse, provider } from '../functions/shared/ai/client.js'
import { reasoningEffort } from '../functions/shared/ai/sakura.js'
import { extractJson, validateShape, GRADING_SCHEMA, EXTRACTION_SCHEMA } from '../functions/shared/ai/json-guard.js'
import { buildCommentPrompt } from '../functions/shared/ai/prompts/comment.js'
import { buildDailyMessagePrompt } from '../functions/shared/ai/prompts/daily-message.js'
import { buildGradingPrompt } from '../functions/shared/ai/prompts/grading.js'
import { buildExtractionPrompt } from '../functions/shared/ai/prompts/extraction.js'
import { COMMENT_AI } from '../functions/api-handler/routes/answers.js'
import { DAILY_MESSAGE_AI } from '../functions/api-handler/routes/home.js'
import { GRADING_AI } from '../functions/grading-worker/grader.js'
import { EXTRACTION_AI } from '../functions/import-worker/extractor.js'
export const LONG_TIMEOUT_MS = 300000
const SAMPLE = {
  question: 'DNS で、ドメイン名から IP アドレスを調べるときに使うレコードはどれか。',
  choices: ['A レコード', 'MX レコード', 'NS レコード', 'PTR レコード'],
  explanation: 'A レコードはドメイン名に IPv4 アドレスを対応づける。MX はメールサーバー、NS は権威サーバー、PTR は逆引きに使う。',
  answer: 'DNS はドメイン名と IP アドレスを対応づけるしくみ。A レコードを引くと IPv4 アドレスが分かる。'
}
const SOURCE_TEXT = `問1 DNS で、ドメイン名から IP アドレスを調べるときに使うレコードはどれか。
ア A レコード　イ MX レコード　ウ NS レコード　エ PTR レコード
正解：ア　解説：A レコードはドメイン名に IPv4 アドレスを対応づける。

問2 TCP の3ウェイハンドシェイクで、最初に送られるものはどれか。
ア ACK　イ FIN　ウ SYN　エ RST
正解：ウ　解説：SYN → SYN/ACK → ACK の順に送る。`
const text = (system, user) => ({ system, messages: [{ role: 'user', content: [{ text: user }] }] })
const notEmpty = (res) => (res.text.trim() ? { ok: true, note: `${[...res.text.trim()].length}文字` } : { ok: false, note: '答えが空' })
// 用途ごとに、本番の呼び出しと同じ指示文・モデル・設定を作り、答えが使えるかを判定する
export const CHECKS = {
  comment: {
    model: 'MODEL_LIGHT', ai: COMMENT_AI,
    prompt: () => {
      const p = buildCommentPrompt({ persona: 'encourage', name: 'ミナ', question: SAMPLE.question, selected: SAMPLE.choices[1], correctChoice: SAMPLE.choices[0], explanation: SAMPLE.explanation, isCorrect: false })
      return text(p.system, p.user)
    },
    judge: notEmpty
  },
  'daily-message': {
    model: 'MODEL_LIGHT', ai: DAILY_MESSAGE_AI,
    prompt: () => {
      const p = buildDailyMessagePrompt({ persona: 'logic', name: 'セージ', reviewCount: 5, yesterdayAnswers: 12, weeklyExp: 340, level: 4 })
      return text(p.system, p.user)
    },
    judge: notEmpty
  },
  grading: {
    model: 'MODEL_HIGH', ai: GRADING_AI,
    prompt: () => {
      const p = buildGradingPrompt({ keyword: 'DNS', question: SAMPLE.question, explanation: SAMPLE.explanation, answer: SAMPLE.answer, persona: 'rival', name: 'レン' })
      return text(p.system, p.user)
    },
    judge: (res) => {
      const shape = validateShape(extractJson(res.text), GRADING_SCHEMA)
      return shape.ok ? { ok: true, note: 'JSON OK' } : { ok: false, note: `JSON NG（${shape.errors.map((e) => e.key).join(',')}）` }
    }
  },
  extraction: {
    model: 'MODEL_HIGH', ai: EXTRACTION_AI,
    prompt: () => buildExtractionPrompt({ chunkType: 'text', text: SOURCE_TEXT }),
    judge: (res) => {
      const obj = extractJson(res.text)
      if (!validateShape(obj, EXTRACTION_SCHEMA).ok) return { ok: false, note: 'JSON NG' }
      return obj.questions.length === 2 ? { ok: true, note: '2問 OK' } : { ok: false, note: `${obj.questions.length}問（2問のはず）` }
    }
  }
}
// うまくいかなかったときに、まず見るところ
export const HINTS = {
  HTTP_400: 'AI_REASONING_EFFORT= （空）にして送らない形を試す',
  HTTP_401: 'AI_API_KEY（アカウントトークン）を確かめる',
  HTTP_403: 'AI Engine の利用開始・トークンの権限を確かめる',
  HTTP_404: 'AI_BASE_URL とモデル名（MODEL_*）を確かめる',
  HTTP_429: '混んでいるか上限に届いた。時間をおいて試す',
  AI_TIMEOUT: '--long で本当の時間を測り、打ち切り時間を見直す',
  max_tokens: '考える分で上限に届いた。AI_REASONING_EFFORT を下げるか、呼び出し側の maxTokens を広げる'
}
// ai.converse のログから、トークン数（考えた分を含む）を拾う
function recordingLogger() {
  const records = []
  const keep = (fields) => records.push(fields)
  const log = { debug: () => {}, info: keep, warn: keep, error: keep, child: () => log }
  return { log, records }
}
export async function runChecks({ names = Object.keys(CHECKS), repeat = 1, long = false, env = process.env, converse = defaultConverse, now = () => Date.now() } = {}) {
  const rows = []
  for (const name of names) {
    const c = CHECKS[name]
    for (let i = 1; i <= repeat; i++) {
      const { log, records } = recordingLogger()
      const timeoutMs = long ? LONG_TIMEOUT_MS : c.ai.timeoutMs
      const row = { name, attempt: i, modelId: env[c.model], timeoutMs, inputTokens: null, outputTokens: null, reasoningTokens: null, stopReason: null }
      const started = now()
      try {
        const res = await converse({ modelId: env[c.model], ...c.prompt(), ...c.ai, timeoutMs, purpose: `check-${name}`, logger: log })
        const judged = c.judge(res)
        Object.assign(row, res.usage, { stopReason: res.stopReason }, judged, { hint: !judged.ok && res.stopReason === 'max_tokens' ? HINTS.max_tokens : null })
      } catch (err) {
        const key = err.code === 'AI_TIMEOUT' ? 'AI_TIMEOUT' : err.cause
        Object.assign(row, { ok: false, note: [err.code ?? err.name, err.cause].filter(Boolean).join(' '), hint: HINTS[key] ?? null })
      }
      row.durationMs = now() - started
      row.reasoningTokens = records.find((r) => r.msg === 'ai.converse')?.reasoningTokens ?? null
      row.overProd = row.durationMs > c.ai.timeoutMs
      rows.push(row)
    }
  }
  return rows
}
const show = (v) => (v === null || v === undefined ? '-' : String(v))
export function formatTable(rows) {
  const head = '| 用途 | 回 | モデル | 結果 | 時間(ms) | 本番の打ち切り(ms) | 入力 | 出力 | うち考えた分 | 止まった理由 | メモ |'
  const lines = rows.map((r) => `| ${r.name} | ${r.attempt} | ${show(r.modelId)} | ${r.ok ? 'OK' : 'NG'} | ${r.durationMs}${r.overProd ? ' ⚠' : ''} | ${CHECKS[r.name].ai.timeoutMs} | ${show(r.inputTokens)} | ${show(r.outputTokens)} | ${show(r.reasoningTokens)} | ${show(r.stopReason)} | ${show(r.note)} |`)
  const hints = [...new Set(rows.filter((r) => !r.ok && r.hint).map((r) => `- ${r.name}：${r.hint}`))]
  return [head, '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...lines, ...(hints.length ? ['', '見るところ', ...hints] : [])].join('\n')
}
export function parseArgs(argv) {
  const opt = { names: Object.keys(CHECKS), repeat: 1, long: false }
  for (const a of argv) {
    if (a === '--long') opt.long = true
    else if (a.startsWith('--only=')) opt.names = a.slice(7).split(',').filter(Boolean)
    else if (a.startsWith('--repeat=')) opt.repeat = Number(a.slice(9))
    else throw new Error(`知らない指定です: ${a}`)
  }
  const unknown = opt.names.filter((n) => !CHECKS[n])
  if (unknown.length) throw new Error(`--only に使えるのは ${Object.keys(CHECKS).join(',')} です: ${unknown.join(',')}`)
  if (!Number.isInteger(opt.repeat) || opt.repeat < 1 || opt.repeat > 10) throw new Error('--repeat は1〜10にしてください')
  return opt
}
export function missingEnv(names, env = process.env) {
  const need = new Set(names.map((n) => CHECKS[n].model))
  if ((env.AI_PROVIDER || 'sakura') === 'sakura') need.add('AI_API_KEY')
  return [...need].filter((k) => !env[k])
}
async function main() {
  let opt
  try {
    opt = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    process.exit(2)
  }
  const missing = missingEnv(opt.names)
  if (missing.length) {
    console.error(`環境変数が足りません: ${missing.join(', ')}（.env の値を入れてから動かす）`)
    process.exit(2)
  }
  console.log(`AI_PROVIDER=${provider()}${provider() === 'sakura' ? `（reasoning_effort=${reasoningEffort() || '送らない'}）` : ''}`)
  const rows = await runChecks(opt)
  console.log(formatTable(rows))
  if (rows.some((r) => !r.ok)) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
