// Celebration：クエスト達成・レベルアップのお祝い。暗転して光の柱が立ち、紙吹雪が下から舞い上がり続ける
// items を1枚ずつ見せ、タップで次へ、最後の1枚のタップか Esc で閉じる（とじるボタンは Tab で選べる）
// 視差効果を減らす設定でも紙吹雪は止めない（利用者の希望）
import { escapeHtml } from './_util.js'
export const CONFETTI_COUNT = 55
const COLORS = ['--crimson', '--teal', '--gold', '--gold-ink', '--correct', '--bronze', '--ink']
const SHAPES = ['', 'app-confetti-dot', 'app-confetti-strip']
let seq = 0
function launch(fx, random) {
  const pick = (list) => list[Math.floor(random() * list.length)]
  const between = (a, b) => a + random() * (b - a)
  for (let k = 0; k < CONFETTI_COUNT; k++) {
    const i = fx.ownerDocument.createElement('i')
    i.className = `app-confetti ${pick(SHAPES)}`.trim()
    i.style.left = `${between(0, 100)}%`
    i.style.background = `var(${pick(COLORS)})`
    fx.append(i)
    if (typeof i.animate !== 'function') continue
    const sway = between(20, 50)
    i.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
      { transform: `translate(${sway}px, -30vh) rotate(120deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${-sway}px, -60vh) rotate(240deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${sway}px, calc(-100vh - 40px)) rotate(400deg)`, opacity: 0 }
    ], { duration: between(3500, 6000), delay: between(0, 3000), iterations: Infinity, easing: 'ease-out', fill: 'both' })
  }
}
// クエストは「達成」の判子、レベルアップは新しいレベルの数字
function slide(item, id) {
  if (item.kind === 'quest') {
    return `<p class="app-levelup-lv">DAILY QUEST</p><h2 id="${id}" class="app-celebrate-stamp">達成</h2>
<p class="app-celebrate-quest">${escapeHtml(item.title)}</p><p class="app-celebrate-reward">報酬 +${escapeHtml(item.reward)} EXP</p>`
  }
  return `<p class="app-levelup-lv">Lv</p><p class="app-levelup-no">${escapeHtml(item.level)}</p><h2 id="${id}" class="app-levelup-title">LEVEL UP!</h2>`
}
// items：{ kind: 'quest', title, reward } または { kind: 'level', level } の並び
export function showCelebration({ items, doc = document, random = Math.random, onClose }) {
  const id = `celebrate-title-${++seq}`
  const d = doc.createElement('dialog')
  d.className = 'app-levelup-overlay'
  d.dataset.theme = 'dark'
  d.setAttribute('aria-labelledby', id)
  // 開いた直後に「とじる」へフォーカスの枠を出さないよう、ダイアログ自体にフォーカスを置く
  d.tabIndex = -1
  d.innerHTML = `<div class="app-levelup-beam" aria-hidden="true"></div><div class="app-levelup-fx" aria-hidden="true"></div>
<p class="app-celebrate-step" aria-hidden="true"></p><div class="app-levelup-text" aria-live="polite"></div>
<button type="button" class="app-levelup-close"></button>`
  doc.body.append(d)
  let index = 0
  const show = () => {
    const last = index === items.length - 1
    // 文字を差し替えるたびに出てくる動きをやり直す
    const text = d.querySelector('.app-levelup-text')
    const fresh = text.cloneNode(false)
    fresh.innerHTML = slide(items[index], id)
    text.replaceWith(fresh)
    d.querySelector('.app-celebrate-step').textContent = items.length > 1 ? `${index + 1} / ${items.length}` : ''
    d.querySelector('.app-levelup-close').textContent = last ? 'タップしてとじる' : 'タップしてつぎへ'
  }
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    if (typeof d.close === 'function' && d.open) d.close()
    d.remove()
    onClose?.()
  }
  d.addEventListener('cancel', (e) => { e.preventDefault(); close() })
  d.addEventListener('click', () => {
    if (index >= items.length - 1) return close()
    index += 1
    show()
  })
  show()
  launch(d.querySelector('.app-levelup-fx'), random)
  if (typeof d.showModal === 'function') d.showModal()
  else d.setAttribute('open', '')
  d.focus()
  return { el: d, close }
}
