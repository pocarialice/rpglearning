// 確認・編集用のダイアログ（外部設計書 3.5）。<dialog> の showModal でフォーカスを閉じ込め、Esc で閉じる
import { escapeHtml } from './_util.js'
let seq = 0
// mount(body, close) で中身を組み立てる。close() で閉じて要素を取り除く
export function openDialog({ title, mount, doc = document }) {
  const id = `dialog-title-${++seq}`
  const d = doc.createElement('dialog')
  d.className = 'gd-card app-dialog'
  d.setAttribute('aria-labelledby', id)
  d.innerHTML = `<h2 id="${id}" class="title">${escapeHtml(title)}</h2><div class="app-dialog-body"></div>`
  doc.body.append(d)
  const close = () => {
    if (typeof d.close === 'function' && d.open) d.close()
    d.remove()
  }
  d.addEventListener('cancel', (e) => { e.preventDefault(); close() })
  mount(d.querySelector('.app-dialog-body'), close)
  if (typeof d.showModal === 'function') d.showModal()
  else d.setAttribute('open', '')
  return { el: d, close }
}
