// 解答後の更新内容（詳細設計書 3.5 M-G07）。DBに書く前の結果を純粋関数でまとめる
import { nextReview } from './review.js'
import { calcAnswerExp, levelInfo } from './exp.js'
import { applyQuestEvent } from './quest.js'
import { judgeMasteryBadges } from './badge.js'
export function buildAnswerOutcome({ kind, correct, reviewItem, today, user, quests, ownedBadges, masteredCountBefore }) {
  const review = nextReview(reviewItem, correct, today)
  const gained = calcAnswerExp(kind, correct, review.isReview)
  const before = levelInfo(user.totalExp)
  const q = applyQuestEvent(quests, {
    kind, correct, passed: kind === 'explain' && correct, isNew: !reviewItem, isReview: review.isReview
  })
  const totalExp = user.totalExp + gained + q.questExp
  const after = levelInfo(totalExp)
  const mastered = masteredCountBefore + (review.mastered ? 1 : 0)
  return {
    review,
    exp: { gained, questExp: q.questExp, totalExp, levelUp: after.level > before.level, ...after },
    quests: q.quests,
    achievedNow: q.achievedNow,
    newBadges: judgeMasteryBadges(mastered, ownedBadges)
  }
}
