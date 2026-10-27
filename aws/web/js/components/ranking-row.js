// RankingRow：週間ランキングの1行。自分の行は「あなた」を付けて目立たせる
import { escapeHtml, cx } from './_util.js'
import { formatExp } from '../logic/format.js'
export function rankingRow({ rank, name, exp, level, isMe = false }) {
  const r = Number(rank)
  const sub = isMe ? '<small>あなた</small>' : level ? `<small>Lv.${Number(level)}</small>` : ''
  return `<div class="${cx('gd-rank', isMe && 'gd-rank-me')}"${isMe ? ' aria-current="true"' : ''}>
<span class="${cx('gd-rank-pos', r <= 3 && `gd-rank-${r}`)}">${r}</span><span class="gd-rank-name">${escapeHtml(name)}${sub}</span>
<span class="gd-rank-exp">${formatExp(exp)}<small>EXP</small></span></div>`
}
