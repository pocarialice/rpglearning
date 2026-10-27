// ExpBar：レベル紋章と次のレベルまでのEXP
import { escapeHtml, pct } from './_util.js'
import { formatExp } from '../logic/format.js'
export function expBar({ level, exp = 0, next = 1, gain = 0, title = '' }) {
  const right = gain ? `<span class="gd-exp-gain">+${formatExp(gain)} EXP</span>` : title ? `<span>${escapeHtml(title)}</span>` : ''
  return `<div class="gd-exp" role="group" aria-label="レベル${escapeHtml(level)}、EXP ${escapeHtml(exp)} / ${escapeHtml(next)}">
<div class="gd-crest"><small>Lv</small><b>${escapeHtml(level)}</b></div>
<div class="gd-exp-main"><div class="gd-exp-head"><span>EXP ${formatExp(exp)} / ${formatExp(next)}</span>${right}</div>
<div class="gd-track"><div class="gd-fill" style="width:${pct(exp, next)}%"></div></div></div></div>`
}
