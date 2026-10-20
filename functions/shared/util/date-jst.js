// JST日付の計算（詳細設計書 2.4.3）。now は Date で受け取る
import { AppError } from './errors.js'
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
function shift(now) {
  return new Date(now.getTime() + JST_OFFSET_MS)
}
export function todayJst(now = new Date()) {
  return shift(now).toISOString().slice(0, 10)
}
function parseDate(dateStr) {
  const m = typeof dateStr === 'string' ? DATE_RE.exec(dateStr) : null
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (new Date(t).toISOString().slice(0, 10) === dateStr) return t
  }
  throw new AppError('VALIDATION_ERROR', '日付の形式が正しくありません', { details: [{ field: 'date', value: String(dateStr) }] })
}
export function addDays(dateStr, n) {
  return new Date(parseDate(dateStr) + n * DAY_MS).toISOString().slice(0, 10)
}
export function weekStartJst(now = new Date()) {
  const today = todayJst(now)
  const dow = new Date(parseDate(today)).getUTCDay() // 0=日
  return addDays(today, -((dow + 6) % 7))
}
export function jstSlot(now = new Date()) {
  const d = shift(now)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  return hh + (d.getUTCMinutes() < 30 ? '00' : '30')
}
export function toIsoJst(date, { ms = false } = {}) {
  const iso = shift(date).toISOString()
  return (ms ? iso.slice(0, 23) : iso.slice(0, 19)) + '+09:00'
}
export function diffDays(fromDate, toDate) {
  return Math.round((parseDate(toDate) - parseDate(fromDate)) / DAY_MS)
}
