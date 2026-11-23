// 解答後の更新内容（詳細設計書 3.5 M-G07）。DBに書く前の結果を純粋関数でまとめる
import { nextReview } from './review.js'
import { calcAnswerExp, levelInfo } from './exp.js'
import { applyQuestEvent } from './quest.js'
import { judgeMasteryBadges } from './badge.js'
// score は説明の点数、adventureCompleted はこの解答で冒険の5問を答え終えたか
// 前にまちがえたことのある問題に、今回正解（説明は合格）したか
export function retried(reviewItem, correct) {
  return !!correct && !!reviewItem && Number(reviewItem.correctCount) < Number(reviewItem.answerCount)
}
export function buildAnswerOutcome({ kind, correct, reviewItem, today, user, quests, ownedBadges, masteredCountBefore, score = null, adventureCompleted = false }) {
  const review = nextReview(reviewItem, correct, today)
  const gained = calcAnswerExp(kind, correct, review.isReview)
  const before = levelInfo(user.totalExp)
  const q = applyQuestEvent(quests, {
    kind, correct, passed: kind === 'explain' && correct, isNew: !reviewItem, isReview: review.isReview,
    score, adventureCompleted, retryCorrect: retried(reviewItem, correct)
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
