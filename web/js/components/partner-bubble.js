// PartnerBubble：AIパートナーの発言。thinking は採点待ちの演出
import { escapeHtml, cx } from './_util.js'
export const PERSONA_LABEL = { encourage: '励まし型', logic: '論理型', rival: 'ライバル型' }
export const DEFAULT_NAME = { encourage: 'ミナ', logic: 'セージ', rival: 'レン' }
export function partnerName(partner) {
  const persona = PERSONA_LABEL[partner?.persona] ? partner.persona : 'encourage'
  return partner?.partnerName || partner?.name || DEFAULT_NAME[persona]
}
// text はエスケープして改行を <br> にする。html を渡すとそのまま入れる（呼び出し側でエスケープ済みのもの）
export function partnerBubble({ name, persona = 'encourage', thinking = false, text = '', html = null }) {
  const p = PERSONA_LABEL[persona] ? persona : 'encourage'
  const n = name || DEFAULT_NAME[p]
  const inner = thinking
    ? '<div class="gd-dots" role="status" aria-label="採点中"><i></i><i></i><i></i></div>'
    : `<div>${html ?? escapeHtml(text).replace(/\n/g, '<br>')}</div>`
  return `<div class="gd-partner"><div class="${cx('gd-sigil', `gd-sigil-${p}`)}" aria-hidden="true">${escapeHtml([...n][0] ?? '?')}</div>
<div class="gd-bubble" aria-live="polite"><div class="gd-bubble-name">${escapeHtml(n)}<span>${PERSONA_LABEL[p]}</span></div>${inner}</div></div>`
}
