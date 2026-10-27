// ReviewStage：忘却曲線の復習段階（0 未学習、1〜5 は 1/3/7/14/30日、6 習得）
import { cx } from './_util.js'
const STEPS = ['1日', '3日', '7日', '14日', '30日']
export function reviewStage({ stage = 0, kind = '択一' }) {
  const st = Number(stage) || 0
  const label = st === 0 ? '未学習' : st >= 6 ? '' : `段階${st}`
  const pips = STEPS.map((t, i) => {
    const n = i + 1
    return `<span class="${cx('gd-pip', (st >= 6 || n < st) && 'gd-pip-on', n === st && st < 6 && 'gd-pip-now')}">${t}</span>`
  }).join('')
  const tail = st >= 6 ? '<span class="gd-mastered">習得</span>' : `<span class="gd-review-state">${label}</span>`
  return `<div class="gd-review"><span class="gd-review-kind">${kind}</span><div class="gd-pips" aria-label="${st >= 6 ? '習得済み' : label}">${pips}</div>${tail}</div>`
}
