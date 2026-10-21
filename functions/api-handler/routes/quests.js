// A-07 次の問題（10問の冒険の中の1問）
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { pickNext, servedKey } from '../../shared/domain/picker.js'
import * as adventures from '../../shared/db/repositories/adventures.js'
import * as reviews from '../../shared/db/repositories/reviews.js'
import * as questions from '../../shared/db/repositories/questions.js'
const KINDS = ['choice', 'explain']
const entryKey = (e) => (e.k === 'choice' ? servedKey('choice', { questionId: e.q }) : servedKey('explain', { keywordId: e.kw }))
export async function next(ctx) {
  const { user, today, query } = ctx
  const courseId = user.currentCourseId
  let adv
  if (query.adventureId) {
    adv = await adventures.find(decodeId(PREFIX.adventure, query.adventureId), user.userId)
    if (!adv) throw new AppError('NOT_FOUND', '冒険が見つかりません')
  } else {
    adv = await adventures.start(user.userId, courseId)
  }
  const adventureId = encodeId(PREFIX.adventure, adv.adventureId)
  if (adv.servedCount >= adventures.ADVENTURE_SIZE) {
    await adventures.finish(adv.adventureId)
    return ok({ adventureId, done: true })
  }
  const candidates = { due: {}, unlearned: {}, learned: {} }
  await Promise.all(KINDS.map(async (kind) => {
    const [due, unlearned, learned] = await Promise.all([
      reviews.listDue(user.userId, courseId, kind, today),
      reviews.listUnlearned(user.userId, courseId, kind),
      reviews.listLearned(user.userId, courseId, kind)
    ])
    candidates.due[kind] = due
    candidates.unlearned[kind] = unlearned
    candidates.learned[kind] = learned
  }))
  const pick = pickNext(candidates, { lastKind: adv.lastKind ?? null, servedIds: (adv.served ?? []).map(entryKey) })
  if (!pick) {
    await adventures.finish(adv.adventureId)
    return ok({ adventureId, done: true, reason: 'NO_QUESTION' })
  }
  const q = await questions.findForLearner(pick.questionId, courseId)
  if (!q) throw new AppError('NOT_FOUND', '問題が見つかりません')
  const entry = pick.kind === 'choice' ? { k: 'choice', q: pick.questionId } : { k: 'explain', q: pick.questionId, kw: pick.keywordId }
  await adventures.incrementServed(adv.adventureId, entry)
  const base = { adventureId, index: adv.servedCount + 1, total: adventures.ADVENTURE_SIZE, kind: pick.kind, isReview: pick.source === 'due' }
  const qid = encodeId(PREFIX.question, q.questionId)
  if (pick.kind === 'choice') {
    // 正解と解説は返さない
    return ok({ ...base, question: { id: qid, body: q.body, choices: q.choices.map((body, i) => ({ no: i + 1, body })) } })
  }
  const kw = q.keywords.find((k) => k.keywordId === pick.keywordId)
  return ok({ ...base, keyword: { id: encodeId(PREFIX.keyword, pick.keywordId), text: kw?.keyword ?? '' }, question: { id: qid, body: q.body } })
}
