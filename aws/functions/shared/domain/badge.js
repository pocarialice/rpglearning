// バッジ判定（詳細設計書 3.5 M-G04。Phase 1 は習得と継続）
const TIERS = [['bronze', 0], ['silver', 1], ['gold', 2]]
export const MASTERY_THRESHOLDS = [10, 50, 100]
export const STREAK_THRESHOLDS = [7, 30, 100]
function judge(category, thresholds, value, owned) {
  return TIERS
    .filter(([, i]) => value >= thresholds[i])
    .map(([tier]) => `${category}_${tier}`)
    .filter((code) => !owned.includes(code))
}
export function judgeMasteryBadges(masteredCount, owned = []) {
  return judge('mastery', MASTERY_THRESHOLDS, masteredCount, owned)
}
export function judgeStreakBadges(streakDays, owned = []) {
  return judge('streak', STREAK_THRESHOLDS, streakDays, owned)
}
