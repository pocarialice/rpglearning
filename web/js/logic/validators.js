// 入力チェック（画面とLambdaで共用。詳細設計書 3.2 M-U07）
// 戻り値は { ok: true } または { ok: false, code, field, params }
const OK = Object.freeze({ ok: true })
const ng = (code, field, params = {}) => ({ ok: false, code, field, params })
const WHITESPACE_RE = /[\s　]/gu
const HEADING_RE = /^[ \t　]*【[^】\n]+】/m
const NICKNAME_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ーA-Za-z0-9_-]+$/u
const PARTNER_NAME_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ーA-Za-z0-9]+$/u
const TIME_RE = /^([01][0-9]|2[0-3]):(00|30)$/
export const EXPLANATION_MIN = 50
export const EXPLANATION_MAX = 400
export const EXPLANATION_HEADING_OVER = 200
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024
export const IMPORT_TEXT_MAX = 20000
export const IMPORT_CONTENT_TYPES = { pdf: ['application/pdf'], image: ['image/png', 'image/jpeg'] }
export function countChars(text) {
  if (typeof text !== 'string') return 0
  return [...text.replace(WHITESPACE_RE, '')].length
}
export function validateExplanation(text) {
  const count = countChars(text)
  if (count < EXPLANATION_MIN) return ng('M-03', 'text', { count })
  if (count > EXPLANATION_MAX) return ng('M-04', 'text', { count })
  if (count > EXPLANATION_HEADING_OVER && !HEADING_RE.test(text)) return ng('M-05', 'text', { count })
  return OK
}
export function validateNickname(s) {
  const v = typeof s === 'string' ? s.trim() : ''
  const len = [...v].length
  if (len < 2 || len > 12) return ng('INVALID', 'nickname', { min: 2, max: 12, count: len })
  if (!NICKNAME_RE.test(v)) return ng('INVALID', 'nickname', { reason: 'chars' })
  return OK
}
export function validatePartnerName(s) {
  if (s === '' || s === null || s === undefined) return OK // 初期名を使う
  if (typeof s !== 'string') return ng('INVALID', 'partnerName', { reason: 'type' })
  const len = [...s].length
  if (len < 1 || len > 10) return ng('INVALID', 'partnerName', { min: 1, max: 10, count: len })
  if (!PARTNER_NAME_RE.test(s)) return ng('INVALID', 'partnerName', { reason: 'chars' })
  return OK
}
export function validateNotifyTime(hhmm) {
  if (typeof hhmm !== 'string' || !TIME_RE.test(hhmm)) return ng('INVALID', 'sendTime', { reason: 'format' })
  if (hhmm < '06:00' || hhmm > '22:00') return ng('INVALID', 'sendTime', { min: '06:00', max: '22:00' })
  return OK
}
export function validateImportRequest(r) {
  const req = r ?? {}
  if (req.sourceType === 'text') {
    const len = typeof req.text === 'string' ? [...req.text].length : 0
    if (len < 1 || len > IMPORT_TEXT_MAX) return ng('INVALID', 'text', { min: 1, max: IMPORT_TEXT_MAX, count: len })
    return OK
  }
  const types = IMPORT_CONTENT_TYPES[req.sourceType]
  if (!types) return ng('INVALID', 'sourceType', { allowed: ['pdf', 'image', 'text'] })
  if (typeof req.fileName !== 'string' || req.fileName.trim() === '' || req.fileName.length > 255) {
    return ng('INVALID', 'fileName', {})
  }
  if (!types.includes(req.contentType)) return ng('INVALID', 'contentType', { allowed: types })
  if (!Number.isInteger(req.size) || req.size < 1 || req.size > IMPORT_MAX_BYTES) {
    return ng('INVALID', 'size', { max: IMPORT_MAX_BYTES })
  }
  return OK
}
const filled = (s) => typeof s === 'string' && s.trim() !== ''
export function validateQuestionDraft(q) {
  const d = q ?? {}
  if (!filled(d.body)) return ng('M-12', 'body')
  if (!Array.isArray(d.choices) || d.choices.length !== 4 || !d.choices.every(filled)) return ng('M-12', 'choices')
  if (!Number.isInteger(d.correct) || d.correct < 1 || d.correct > 4) return ng('M-12', 'correct')
  if (!filled(d.explanation)) return ng('M-12', 'explanation')
  const kws = d.keywords ?? []
  if (!Array.isArray(kws) || kws.length > 3) return ng('M-12', 'keywords', { max: 3 })
  if (!kws.every((k) => filled(k) && [...k].length <= 50)) return ng('M-12', 'keywords', { maxLength: 50 })
  return OK
}
