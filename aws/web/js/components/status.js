// 読み込み中・エラーの表示（外部設計書 3.5）
import { escapeHtml } from './_util.js'
export const M02 = '通信できませんでした。もう一度お試しください'
export const loading = (label = '読み込み中') => `<div class="gd-card app-loading"><div class="gd-dots" role="status" aria-label="${escapeHtml(label)}"><i></i><i></i><i></i></div></div>`
export const errorBand = (message) => `<div class="app-error" role="alert">${escapeHtml(message)}</div>`
// ApiError を画面の文言にする。API の message があればそれを、なければ「〜できませんでした」の形
export function errorMessage(err, fallback = M02) {
  if (!err || err.code === 'NETWORK') return M02
  if (err.status >= 500 || !err.message || err.message === err.code) return fallback
  return err.message
}
