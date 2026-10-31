// Ctrl+Enter（Mac は ⌘+Enter）で、入力欄のいちばん近くにある確定ボタンを押す
// 入力欄から外側へたどり、確定ボタンを含む最初の囲みで探す。data-ctrl-enter の付いたボタンを主ボタン（primary）より優先する
// 押せない（disabled・非表示）ときは何もしない。<form> の中で見つからなければ、その form を送信する。<dialog>・<main> の外へは探しに行かない
const FIELD = 'textarea, input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="color"])'
const TARGET = ['[data-ctrl-enter]', '.gd-btn-primary, button[type="submit"]']
const usable = (btn) => (btn.disabled || btn.closest('[hidden]') ? null : btn)
export function findPrimary(field) {
  for (let el = field.parentElement; el; el = el.parentElement) {
    const btn = TARGET.map((s) => el.querySelector(s)).find(Boolean)
    if (btn) return usable(btn)
    if (el.matches('form, dialog, main, body')) return el.matches('form') ? el : null
  }
  return null
}
export function installCtrlEnter(doc = document) {
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return
    const field = e.target
    if (!(field instanceof doc.defaultView.Element) || !field.matches(FIELD)) return
    const target = findPrimary(field)
    if (!target) return
    e.preventDefault()
    if (target.matches('form')) target.requestSubmit()
    else target.click()
  })
}
