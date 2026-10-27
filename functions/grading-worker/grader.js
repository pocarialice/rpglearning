// 説明の採点（詳細設計書 4.3）。ワーカーがジョブキュー（kind=grading）から取り出して呼ぶ。例外は投げず、失敗は grading_jobs を failed にする（やり直しは0回）
import { AppError } from '../shared/util/errors.js'
import { todayJst, weekStartJst } from '../shared/util/date-jst.js'
import { converse } from '../shared/ai/client.js'
import { extractJson, validateShape, GRADING_SCHEMA } from '../shared/ai/json-guard.js'
import { buildGradingPrompt, RETRY_NOTE } from '../shared/ai/prompts/grading.js'
import { withTx } from '../shared/db/tx.js'
import * as gradings from '../shared/db/repositories/gradings.js'
import * as questions from '../shared/db/repositories/questions.js'
import * as users from '../shared/db/repositories/users.js'
import { loadAnswerContext, computeOutcome, writeOutcome, outcomeView } from '../shared/services/answer-recorder.js'
export const PASS_SCORE = 60
export const AI_TIMEOUT_MS = 25000
// 採点全体の持ち時間（A-10 が30秒で打ち切るため）。やり直しは残りが10秒以上のときだけ
export const BUDGET_MS = 25000
export const RETRY_MIN_REMAINING_MS = 10000
class Superseded extends Error {}
export async function gradeJob(gradingId, { log, now = () => new Date() }) {
  const started = now().getTime()
  const job = await gradings.find(gradingId)
  if (!job || job.status !== 'processing') {
    log.info({ msg: 'grading.skip', gradingId, status: job?.status ?? 'missing' })
    return { status: 'skipped' }
  }
  const [kw, user] = await Promise.all([questions.findKeyword(job.keywordId), users.findById(job.userId)])
  const persona = user.partnerPersona ?? 'encourage'
  const name = user.partnerName ?? ''
  const prompt = buildGradingPrompt({ keyword: kw.keyword, question: kw.body, explanation: kw.explanation, answer: job.explanationText, persona, name })
  let graded
  try {
    graded = await askWithRetry(prompt, { log, started, now })
  } catch (err) {
    const reason = err.code === 'AI_TIMEOUT' ? 'ai_timeout' : 'ai_error'
    await gradings.fail(gradingId, reason)
    log.warn({ msg: 'grading.failed', gradingId, code: err.code ?? 'AI_ERROR', reason })
    return { status: 'failed', reason }
  }
  // 点数はAIの score ではなく3項目の合計を正とする
  const score = graded.accuracy + graded.coverage + graded.concreteness
  const passed = score >= PASS_SCORE
  const today = todayJst(now())
  const a = {
    user, courseId: job.courseId, kind: 'explain', questionId: kw.questionId, keywordId: job.keywordId, adventureId: job.adventureId ?? null,
    today, weekStart: weekStartJst(now()), correct: passed, score, explanationText: job.explanationText
  }
  try {
    const result = await withTx(async (tx) => {
      const c = await loadAnswerContext(tx, a)
      const o = computeOutcome(c, a)
      const result = {
        status: 'done', score, passed, modelAnswer: graded.modelAnswer, missingPoints: graded.missingPoints,
        comment: { partnerName: user.partnerName ?? null, persona, text: graded.comment }, ...outcomeView(o)
      }
      // A-10 が先に時間切れにしていたら（更新0件）、ロールバックしてEXP・段階を変えない
      if (!(await gradings.complete(gradingId, result, tx))) throw new Superseded()
      await writeOutcome(tx, o, c, a)
      return result
    })
    log.info({ msg: 'grading.done', gradingId, score, passed, durationMs: now().getTime() - started })
    return { status: 'done', result }
  } catch (err) {
    if (err instanceof Superseded) {
      log.warn({ msg: 'grading.superseded', gradingId })
      return { status: 'superseded' }
    }
    throw err
  }
}
async function askWithRetry(prompt, { log, started, now }) {
  const messages = [{ role: 'user', content: [{ text: prompt.user }] }]
  for (let attempt = 1; ; attempt++) {
    const res = await converse({
      modelId: process.env.MODEL_HIGH, system: prompt.system, messages, maxTokens: 1500, temperature: 0,
      timeoutMs: AI_TIMEOUT_MS, purpose: 'grading', logger: log
    })
    const obj = extractJson(res.text)
    const shape = validateShape(obj, GRADING_SCHEMA)
    if (shape.ok) return obj
    const remaining = BUDGET_MS - (now().getTime() - started)
    log.warn({ msg: 'grading.bad_json', attempt, errors: shape.errors.map((e) => e.key), remainingMs: remaining })
    if (attempt >= 2 || remaining < RETRY_MIN_REMAINING_MS) throw new AppError('AI_ERROR', '採点結果の形が崩れていました')
    messages.push({ role: 'assistant', content: [{ text: res.text || '（空）' }] }, { role: 'user', content: [{ text: RETRY_NOTE }] })
  }
}
