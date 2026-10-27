// 解答の記録（A-08 の択一と grading-worker の説明で共用）。トランザクションの中で呼ぶ
// buildAnswerOutcome の結果を answer_logs・review_items・exp_logs・users・user_quests・user_badges に書き、
// 画面に返す形（外部設計書 5.3 A-10 の exp・review・quests・badges）を作る
import { buildAnswerOutcome } from '../domain/answer-flow.js'
import * as reviews from '../db/repositories/reviews.js'
import * as answers from '../db/repositories/answers.js'
import * as expRepo from '../db/repositories/exp.js'
import * as usersRepo from '../db/repositories/users.js'
import * as questsRepo from '../db/repositories/quests.js'
import * as badgesRepo from '../db/repositories/badges.js'
export const toDomainQuest = (q) => ({ userQuestId: q.userQuestId, code: q.questCode, target: q.target, progress: q.progress, achieved: !!q.achieved })
export async function loadAnswerContext(tx, { user, kind, questionId, keywordId, today }) {
  const [reviewItem, todayQuests, ownedBadges, masteredCountBefore] = await Promise.all([
    reviews.findItem({ userId: user.userId, kind, questionId, keywordId }, tx),
    questsRepo.listToday(user.userId, today, tx),
    badgesRepo.listOwned(user.userId, tx),
    answers.masteredCount(user.userId, tx)
  ])
  return { reviewItem, todayQuests, ownedBadges, masteredCountBefore }
}
export function computeOutcome(ctx, { user, kind, correct, today }) {
  return buildAnswerOutcome({
    kind, correct, reviewItem: ctx.reviewItem, today, user,
    quests: ctx.todayQuests.map(toDomainQuest), ownedBadges: ctx.ownedBadges, masteredCountBefore: ctx.masteredCountBefore
  })
}
export async function writeOutcome(tx, outcome, ctx, a) {
  const { user, courseId, kind, questionId, keywordId = null, today, weekStart } = a
  const answerId = await answers.insert({
    userId: user.userId, courseId, questionId, keywordId, adventureId: a.adventureId ?? null, kind,
    selectedChoice: a.selectedChoice ?? null, isCorrect: a.correct, score: a.score ?? null,
    explanationText: a.explanationText ?? null, isReview: outcome.review.isReview, isNew: !ctx.reviewItem, answeredOn: today
  }, tx)
  if (outcome.review.changed) {
    await reviews.upsertItem({
      userId: user.userId, courseId, kind, questionId, keywordId, stage: outcome.review.stage,
      nextReviewOn: outcome.review.nextReviewOn, correct: a.correct, today, mastered: outcome.review.mastered
    }, tx)
  }
  if (outcome.exp.gained > 0) {
    await expRepo.insertLog({ userId: user.userId, courseId, reason: kind, refId: answerId, exp: outcome.exp.gained, isReview: outcome.review.isReview, weekStart }, tx)
  }
  const byCode = new Map(ctx.todayQuests.map((q) => [q.questCode, q]))
  for (const done of outcome.achievedNow) {
    await expRepo.insertLog({ userId: user.userId, courseId, reason: 'quest', refId: byCode.get(done.code).userQuestId, exp: done.reward, weekStart }, tx)
  }
  await usersRepo.addExp(user.userId, { exp: outcome.exp.gained + outcome.exp.questExp, level: outcome.exp.level, today }, tx)
  const changed = outcome.quests.filter((q) => {
    const before = byCode.get(q.code)
    return q.progress !== before.progress || q.achieved !== !!before.achieved
  })
  if (changed.length > 0) await questsRepo.saveProgress(changed, tx)
  if (outcome.newBadges.length > 0) await badgesRepo.grant(user.userId, outcome.newBadges, tx)
  return answerId
}
// 画面に返す共通部分（A-08・A-10）
export function outcomeView(outcome) {
  const achieved = new Set(outcome.achievedNow.map((a) => a.code))
  return {
    exp: {
      gained: outcome.exp.gained, reviewBonus: outcome.review.isReview && outcome.exp.gained > 0, questExp: outcome.exp.questExp,
      level: outcome.exp.level, levelUp: outcome.exp.levelUp, expInLevel: outcome.exp.expInLevel, next: outcome.exp.next
    },
    review: { stage: outcome.review.stage, nextDate: outcome.review.nextReviewOn },
    quests: outcome.quests.map((q) => ({
      id: q.code, progress: q.progress, target: q.target, done: q.achieved, achievedNow: achieved.has(q.code),
      reward: outcome.achievedNow.find((a) => a.code === q.code)?.reward ?? 0
    })),
    badges: outcome.newBadges
  }
}
