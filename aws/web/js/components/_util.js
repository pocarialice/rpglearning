// 部品の共通処理。アプリ用デザインシステム（components/bundle.js）と同じクラス名でHTMLを組む
export { escapeHtml } from '../logic/format.js'
export const cx = (...names) => names.filter(Boolean).join(' ')
export function pct(v, max) {
  if (!max) return 0
  return Math.max(0, Math.min(100, (v / max) * 100))
}
