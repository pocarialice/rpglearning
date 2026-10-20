// 公開ID（q_42 など）と内部IDの変換（詳細設計書 2.4.2）
import { AppError } from './errors.js'
export const PREFIX = {
  user: 'u_', course: 'c_', question: 'q_', keyword: 'kw_',
  grading: 'gr_', import: 'imp_', adventure: 'adv_', answer: 'ans_'
}
export function encodeId(prefix, n) {
  return prefix + n
}
export function decodeId(prefix, s) {
  if (typeof s !== 'string' || !s.startsWith(prefix)) throw invalid(prefix, s)
  const digits = s.slice(prefix.length)
  if (!/^[1-9][0-9]*$/.test(digits)) throw invalid(prefix, s)
  const n = Number(digits)
  if (!Number.isSafeInteger(n)) throw invalid(prefix, s)
  return n
}
function invalid(prefix, s) {
  return new AppError('VALIDATION_ERROR', 'IDの形式が正しくありません', {
    details: [{ field: 'id', prefix, value: typeof s === 'string' ? s : String(s) }]
  })
}
