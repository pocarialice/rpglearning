// ScoreMeter：説明の点数と合格ライン（既定60点）。foot は不足観点などの補足（エスケープ済みのHTML）
import { cx } from './_util.js'
export function scoreMeter({ score, pass = 60, foot = '' }) {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)))
  const ok = s >= pass
  return `<div class="gd-score"><div class="gd-score-head"><span class="gd-score-num">${s}<small>点</small></span>
<span class="${cx('gd-verdict', ok ? 'gd-verdict-pass' : 'gd-verdict-near')}">${ok ? '○ 合格' : `あと${pass - s}点`}</span></div>
<div class="gd-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s}" aria-label="点数">
<div class="${cx('gd-fill', ok ? 'gd-score-fill-pass' : 'gd-score-fill-near')}" style="width:${s}%"></div>
<span class="gd-tick" style="left:calc(${pass}% - 1px)"></span><span class="gd-tick-label" style="left:${pass}%">合格 ${pass}</span></div>
${foot ? `<div class="gd-score-foot">${foot}</div>` : ''}</div>`
}
