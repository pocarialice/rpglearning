// 画面に出す文字の整形（詳細設計書 6.1）。画面に出す文字はすべて escapeHtml を通す
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])
}
const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
const pad = (n) => String(n).padStart(2, '0')
// '2026-10-21T00:30:00+09:00' → '2026/10/21'（日付だけの '2026-10-21' もそのまま扱う）
export function formatDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '/')
  const d = jst(value)
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`
}
export function formatDateTime(value) {
  if (!value) return ''
  const d = jst(value)
  return `${formatDate(value)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function formatExp(n) {
  return Number(n ?? 0).toLocaleString('ja-JP')
}
export function formatPct(n) {
  return n === null || n === undefined ? '-' : `${Number(n).toFixed(1)}%`
}
