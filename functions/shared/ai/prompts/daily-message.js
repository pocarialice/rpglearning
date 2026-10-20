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
// 生成に失敗したときの定型文（persona ごとに3つ。保存しない。詳細設計書 5.2 A-05）
export const FALLBACK_MESSAGES = {
  encourage: [
    (n) => `今日の復習は${n}問だよ。いっしょにいこう！`,
    () => '今日もここまで来てくれてうれしいな。1問ずついこう！',
    () => '少しずつでも続けるのがいちばんだよ。今日もよろしくね！'
  ],
  logic: [
    (n) => `今日の復習は${n}問です。復習から始めるのが効率的です。`,
    () => '短い時間でも毎日解くと記憶に残りやすくなります。始めましょう。',
    () => '今日の目標はクエストの3つです。順に片付けていきましょう。'
  ],
  rival: [
    (n) => `今日の復習は${n}問だな。俺より先に終わらせられるか？`,
    () => '今日も来たか。今週のランキング、負けないぞ。',
    () => '昨日の自分を超えてみせろ。準備はいいか？'
  ]
}
export function fallbackMessage(persona, reviewCount, rand = Math.random) {
  const list = FALLBACK_MESSAGES[persona] ?? FALLBACK_MESSAGES.encourage
  return list[Math.min(Math.floor(rand() * list.length), list.length - 1)](reviewCount)
}
