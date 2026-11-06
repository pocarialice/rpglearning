// ホームのひとことの指示文（詳細設計書 7.5）。個人を特定する情報は受け付けない
import { AppError } from '../../util/errors.js'
import { getPersona } from '../persona.js'
// 時間帯（JST）。この区切りが変わったらひとことを作り直す（詳細設計書 5.2 A-05）
export const TIME_SLOTS = {
  morning: { label: '朝', from: 5, hint: 'これから一日を始める人への声かけにする' },
  day: { label: '昼', from: 11, hint: '一日の途中でひと息ついている人への声かけにする' },
  night: { label: '夜', from: 17, hint: '一日をしめくくる人をねぎらう声かけにする' }
}
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
export function timeSlotOf(now = new Date()) {
  const hour = new Date(now.getTime() + JST_OFFSET_MS).getUTCHours()
  if (hour >= TIME_SLOTS.night.from || hour < TIME_SLOTS.morning.from) return 'night'
  return hour >= TIME_SLOTS.day.from ? 'day' : 'morning'
}
// 0:00〜4:59 は前日の夜の続きとして扱う（同じ夜に2回作らない）。on は保存する日付
export function messageSlotOf(now = new Date()) {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  const before = jst.getUTCHours() < TIME_SLOTS.morning.from ? 24 * 60 * 60 * 1000 : 0
  return { slot: timeSlotOf(now), on: new Date(jst.getTime() - before).toISOString().slice(0, 10) }
}
// 伝える数字は「今日の解答数 → 昨日の解答数 → 今週のEXP → レベル」の順に、あるものを1つ選ぶ
export function pickHighlight({ todayAnswers = 0, yesterdayAnswers = 0, weeklyExp = 0, level = 1 }) {
  if (todayAnswers > 0) return { label: '今日の解答数', value: todayAnswers, unit: '問' }
  if (yesterdayAnswers > 0) return { label: '昨日の解答数', value: yesterdayAnswers, unit: '問' }
  if (weeklyExp > 0) return { label: '今週のEXP', value: weeklyExp, unit: '' }
  return { label: 'レベル', value: level, unit: '' }
}
const ALLOWED = ['persona', 'name', 'timeSlot', 'todayAnswers', 'yesterdayAnswers', 'weeklyExp', 'level']
export function buildDailyMessagePrompt(input) {
  const extra = Object.keys(input).filter((k) => !ALLOWED.includes(k))
  if (extra.length > 0) throw new AppError('VALIDATION_ERROR', `ひとことの入力に使えない項目があります: ${extra.join(',')}`)
  const { persona, name, timeSlot = 'morning', todayAnswers = 0, yesterdayAnswers = 0, weeklyExp = 0, level = 1 } = input
  const p = getPersona(persona)
  const slot = TIME_SLOTS[timeSlot]
  if (!slot) throw new AppError('VALIDATION_ERROR', `不明な時間帯です: ${timeSlot}`)
  const h = pickHighlight({ todayAnswers, yesterdayAnswers, weeklyExp, level })
  const system = `あなたは${name}（${p.label}。口調：${p.tone}）として、${slot.label}にホームを開いた学習者に1〜2文で声をかける。${slot.hint}。` +
    '「伝える数字」を必ず1つだけ入れ、ほかの数字は入れない。復習の話はしない。説教しない。'
  const user = `時間帯：${slot.label}\n伝える数字：${h.label} ${h.value}${h.unit}\n今日の解答数：${todayAnswers}\n昨日の解答数：${yesterdayAnswers}\n今週のEXP：${weeklyExp}\nレベル：${level}`
  return { system, user }
}
// 生成に失敗したときの定型文（persona ごとに3つ。保存しない。詳細設計書 5.2 A-05）。h は pickHighlight の結果
export const FALLBACK_MESSAGES = {
  encourage: [
    (h) => `${h.label}は${h.value}${h.unit}だね。この調子でいこう！`,
    () => 'ここまで来てくれてうれしいな。1問ずついこう！',
    () => '少しずつでも続けるのがいちばんだよ。よろしくね！'
  ],
  logic: [
    (h) => `${h.label}は${h.value}${h.unit}です。この積み重ねが力になります。`,
    () => '短い時間でも毎日解くと記憶に残りやすくなります。始めましょう。',
    () => '今日の目標はクエストの3つです。順に片付けていきましょう。'
  ],
  rival: [
    (h) => `${h.label}は${h.value}${h.unit}か。まだまだいけるだろ？`,
    () => '来たか。今週のランキング、負けないぞ。',
    () => '昨日の自分を超えてみせろ。準備はいいか？'
  ]
}
export function fallbackMessage(persona, highlight, rand = Math.random) {
  const list = FALLBACK_MESSAGES[persona] ?? FALLBACK_MESSAGES.encourage
  return list[Math.min(Math.floor(rand() * list.length), list.length - 1)](highlight)
}
