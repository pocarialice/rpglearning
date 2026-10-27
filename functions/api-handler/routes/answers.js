// A-08 四肢択一の解答と結果
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, PREFIX } from '../../shared/util/ids.js'
import { withTx } from '../../shared/db/tx.js'
import { converse } from '../../shared/ai/client.js'
import { buildCommentPrompt } from '../../shared/ai/prompts/comment.js'
import * as questions from '../../shared/db/repositories/questions.js'
import * as adventures from '../../shared/db/repositories/adventures.js'
import { loadAnswerContext, computeOutcome, writeOutcome, outcomeView } from '../../shared/services/answer-recorder.js'
export async function choice(ctx) {
  const { user, today, weekStart, log } = ctx
  const body = ctx.body()
  if (!Number.isInteger(body.choiceNo) || body.choiceNo < 1 || body.choiceNo > 4) {
    throw new AppError('VALIDATION_ERROR', undefined, { details: [{ field: 'choiceNo', code: 'INVALID' }] })
  }
  const questionId = decodeId(PREFIX.question, body.questionId)
  let adventureId = null
  if (body.adventureId) {
    adventureId = decodeId(PREFIX.adventure, body.adventureId)
    if (!(await adventures.find(adventureId, user.userId))) throw new AppError('NOT_FOUND', '冒険が見つかりません')
  }
  const q = await questions.findForLearner(questionId, user.currentCourseId)
  if (!q) throw new AppError('NOT_FOUND', '問題が見つかりません')
  const correct = body.choiceNo === q.correctChoice
  const outcome = await withTx(async (tx) => {
    const a = { user, courseId: user.currentCourseId, kind: 'choice', questionId, today, weekStart, correct, selectedChoice: body.choiceNo, adventureId }
    const c = await loadAnswerContext(tx, a)
    const o = computeOutcome(c, a)
    await writeOutcome(tx, o, c, a)
    return o
  })
  const persona = user.partnerPersona ?? 'encourage'
  let text = q.explanation
  try {
    const p = buildCommentPrompt({
      persona, name: user.partnerName ?? '', question: q.body, selected: q.choices[body.choiceNo - 1],
      correctChoice: q.choices[q.correctChoice - 1], explanation: q.explanation, isCorrect: correct
    })
    const res = await converse({
      modelId: process.env.MODEL_LIGHT, system: p.system, messages: [{ role: 'user', content: [{ text: p.user }] }],
      maxTokens: 300, temperature: 0.7, timeoutMs: 5000, purpose: 'comment', logger: log
    })
    if (res.text.trim()) text = res.text.trim()
  } catch (err) {
    log.warn({ msg: 'comment.fallback', code: err.code ?? 'AI_ERROR' })
  }
  return ok({
    correct, correctChoice: q.correctChoice, explanation: q.explanation,
    comment: { partnerName: user.partnerName ?? null, persona, text },
    ...outcomeView(outcome)
  })
}
