// 忘却曲線（詳細設計書 3.5 M-G01）。段階は1〜5、6＝習得済み
import { addDays } from '../util/date-jst.js'
export const STAGE_DAYS = [1, 3, 7, 14, 30]
export const MASTERED_STAGE = 6
export function nextReview(item, correct, today) {
  if (!item) {
    return { stage: 1, nextReviewOn: addDays(today, 1), isReview: false, mastered: false, changed: true }
  }
  const keep = { stage: item.stage, nextReviewOn: item.nextReviewOn, isReview: false, mastered: false, changed: false }
  if (item.stage === MASTERED_STAGE) return { ...keep, nextReviewOn: null }
  if (today < item.nextReviewOn) return keep
  if (!correct) {
    return { stage: 1, nextReviewOn: addDays(today, 1), isReview: true, mastered: false, changed: true }
  }
  const stage = item.stage + 1
  if (stage === MASTERED_STAGE) {
    return { stage, nextReviewOn: null, isReview: true, mastered: true, changed: true }
  }
  return { stage, nextReviewOn: addDays(today, STAGE_DAYS[stage - 1]), isReview: true, mastered: false, changed: true }
}
