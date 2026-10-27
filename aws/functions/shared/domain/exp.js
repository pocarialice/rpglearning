// EXPとレベル（詳細設計書 3.5 M-G02）
import { AppError } from '../util/errors.js'
export const BASE_EXP = { choice: 10, explain: 30 }
export const REVIEW_MULTIPLIER = 1.5
export function calcAnswerExp(kind, correct, isReview) {
  const base = BASE_EXP[kind]
  if (base === undefined) throw new AppError('VALIDATION_ERROR', `不明な形式です: ${kind}`)
  if (!correct) return 0
  return isReview ? base * REVIEW_MULTIPLIER : base
}
// 浮動小数の誤差に備え、小数第6位で丸めてから切り上げる
export function requiredExp(lv) {
  return Math.ceil(Math.round(100 * lv ** 1.2 * 1e6) / 1e6)
}
export function levelInfo(totalExp) {
  let level = 1
  let rest = totalExp
  let next = requiredExp(level)
  while (rest >= next) {
    rest -= next
    level += 1
    next = requiredExp(level)
  }
  return { level, expInLevel: rest, next }
}
