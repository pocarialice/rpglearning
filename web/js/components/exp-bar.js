// ExpBar：レベル紋章と次のレベルまでのEXP
import { escapeHtml, pct } from './_util.js'
import { formatExp } from '../logic/format.js'
import { expSegments } from '../logic/exp-gain.js'
export function expBar({ level, exp = 0, next = 1, gain = 0, title = '' }) {
  const right = gain ? `<span class="gd-exp-gain">+${formatExp(gain)} EXP</span>` : title ? `<span>${escapeHtml(title)}</span>` : ''
  return `<div class="gd-exp" role="group" aria-label="レベル${escapeHtml(level)}、EXP ${escapeHtml(exp)} / ${escapeHtml(next)}">
<div class="gd-crest"><small>Lv</small><b>${escapeHtml(level)}</b></div>
<div class="gd-exp-main"><div class="gd-exp-head"><span class="gd-exp-count">EXP ${formatExp(exp)} / ${formatExp(next)}</span>${right}</div>
<div class="gd-track"><div class="gd-fill" style="width:${pct(exp, next)}%"></div></div></div></div>`
}
// 獲得EXPの演出（案B）。バーが伸びて数字がカウントアップし、最後に光が1回走る。レベルが上がるときは紋章が1回弾む
// 視差効果を減らす設定でも動かす（利用者の希望）。root は expBar を含む要素、levelNote はレベルアップの一文（あれば）
export const EXP_ANIM_MS = 800
export const EXP_DELAY_MS = 250
const easeOut = (t) => 1 - (1 - t) ** 3
export function primeExpBar(root, exp) {
  const segments = expSegments(exp)
  if (segments.length === 0) return null
  const view = parts(root)
  if (!view) return null
  draw(view, segments[0], segments[0].from)
  view.gain?.classList.add('is-pending')
  if (segments.length > 1 && view.levelNote) view.levelNote.hidden = true
  return { view, segments }
}
function parts(root) {
  const fill = root.querySelector('.gd-fill')
  const count = root.querySelector('.gd-exp-count')
  const crest = root.querySelector('.gd-crest')
  if (!fill || !count || !crest) return null
  return { fill, count, crest, crestNo: crest.querySelector('b'), gain: root.querySelector('.gd-exp-gain'), levelNote: root.querySelector('[data-levelup]') }
}
function draw(view, seg, value) {
  view.fill.style.width = `${pct(value, seg.next)}%`
  view.count.textContent = `EXP ${formatExp(Math.round(value))} / ${formatExp(seg.next)}`
  if (view.crestNo) view.crestNo.textContent = String(seg.level)
}
const restart = (el, name) => {
  el.classList.remove(name)
  void el.offsetWidth
  el.classList.add(name)
}
// primed は primeExpBar の戻り値。win は requestAnimationFrame・performance・setTimeout を持つもの（テストで差し替える）
export function playExpBar(primed, { win = globalThis } = {}) {
  if (!primed) return Promise.resolve()
  const { view, segments } = primed
  const total = segments.reduce((s, seg) => s + (seg.to - seg.from), 0)
  const raf = win.requestAnimationFrame?.bind(win)
  const now = () => win.performance?.now?.() ?? Date.now()
  const finish = () => {
    const last = segments[segments.length - 1]
    draw(view, last, last.to)
    if (view.levelNote) view.levelNote.hidden = false
    restart(view.fill, 'is-glint')
  }
  view.gain?.classList.remove('is-pending')
  if (view.gain) restart(view.gain, 'is-in')
  if (!raf) {
    finish()
    return Promise.resolve()
  }
  const tween = (seg, ms) => new Promise((resolve) => {
    const t0 = now()
    const step = () => {
      const t = Math.min(1, (now() - t0) / ms)
      draw(view, seg, seg.from + (seg.to - seg.from) * easeOut(t))
      if (t < 1) raf(step)
      else resolve()
    }
    raf(step)
  })
  return (async () => {
    for (const [i, seg] of segments.entries()) {
      if (i > 0) {
        draw(view, seg, seg.from)
        restart(view.crest, 'is-pop')
        if (view.levelNote) {
          view.levelNote.hidden = false
          restart(view.levelNote, 'is-in')
        }
      }
      await tween(seg, Math.max(250, EXP_ANIM_MS * ((seg.to - seg.from) / total)))
    }
    finish()
  })()
}
