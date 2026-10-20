// ホームのひとことの指示文（詳細設計書 7.5）。個人を特定する情報は受け付けない
import { AppError } from '../../util/errors.js'
import { getPersona } from '../persona.js'
const ALLOWED = ['persona', 'name', 'reviewCount', 'yesterdayAnswers', 'weeklyExp', 'level']
export function buildDailyMessagePrompt(input) {
  const extra = Object.keys(input).filter((k) => !ALLOWED.includes(k))
  if (extra.length > 0) throw new AppError('VALIDATION_ERROR', `ひとことの入力に使えない項目があります: ${extra.join(',')}`)
  const { persona, name, reviewCount, yesterdayAnswers, weeklyExp, level } = input
  const p = getPersona(persona)
  const system = `あなたは${name}（${p.label}。口調：${p.tone}）として、今日の学習を始める学習者に1〜2文で声をかける。数字を1つ入れる。説教しない。`
  const user = `今日の復習数：${reviewCount}\n昨日の解答数：${yesterdayAnswers}\n今週のEXP：${weeklyExp}\nレベル：${level}`
  return { system, user }
}
// 生成に失敗したときの定型文（保存しない）
export const FALLBACK_MESSAGES = {
  encourage: (n) => `今日の復習は${n}問だよ。いっしょにいこう！`,
  logic: (n) => `今日の復習は${n}問です。復習から始めるのが効率的です。`,
  rival: (n) => `今日の復習は${n}問だな。俺より先に終わらせられるか？`
}
