import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { installCtrlEnter, findPrimary } from '../../../../web/js/core/keys.js'
beforeAll(() => installCtrlEnter(document))
beforeEach(() => { document.body.innerHTML = '' })
const press = (el, opts = {}) => {
  const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...opts })
  el.dispatchEvent(e)
  return e
}
function form(html) {
  document.body.innerHTML = `<main><section>${html}</section></main>`
  const btn = document.querySelector('.gd-btn-primary')
  const click = vi.fn()
  btn?.addEventListener('click', click)
  return { field: document.querySelector('textarea, input'), btn, click }
}
describe('core/keys Ctrl+Enter', () => {
  it('textarea で Ctrl+Enter を押すと主ボタンを押す', () => {
    const { field, click } = form('<div><textarea></textarea></div><button class="gd-btn gd-btn-primary">送る</button>')
    const e = press(field, { ctrlKey: true })
    expect(click).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })
  it('⌘+Enter でも押す', () => {
    const { field, click } = form('<input><button class="gd-btn gd-btn-primary">送る</button>')
    press(field, { metaKey: true })
    expect(click).toHaveBeenCalledTimes(1)
  })
  it('Enter だけ・変換中・修飾キー違いでは押さない', () => {
    const { field, click } = form('<textarea></textarea><button class="gd-btn gd-btn-primary">送る</button>')
    press(field)
    press(field, { ctrlKey: true, isComposing: true })
    press(field, { shiftKey: true })
    expect(click).not.toHaveBeenCalled()
  })
  it('主ボタンが押せない（disabled・非表示）ときは何もしない', () => {
    const a = form('<textarea></textarea><button class="gd-btn gd-btn-primary" disabled>送る</button>')
    expect(press(a.field, { ctrlKey: true }).defaultPrevented).toBe(false)
    const b = form('<textarea></textarea><div hidden><button class="gd-btn gd-btn-primary">送る</button></div>')
    press(b.field, { ctrlKey: true })
    expect(b.click).not.toHaveBeenCalled()
  })
  it('入力欄以外や、囲みに主ボタンがないときは何もしない', () => {
    const { btn, click } = form('<button class="gd-btn gd-btn-primary">送る</button>')
    press(btn, { ctrlKey: true })
    expect(click).not.toHaveBeenCalled()
    document.body.innerHTML = '<main><textarea></textarea></main><button class="gd-btn gd-btn-primary">外</button>'
    expect(findPrimary(document.querySelector('textarea'))).toBeNull()
  })
  it('ダイアログの中ではダイアログの主ボタンだけを探す', () => {
    document.body.innerHTML = '<button class="gd-btn gd-btn-primary">外</button><dialog open><div><input></div></dialog>'
    expect(findPrimary(document.querySelector('input'))).toBeNull()
    document.body.innerHTML = '<dialog open><form><input><button type="submit">保存</button></form></dialog>'
    expect(findPrimary(document.querySelector('input'))?.textContent).toBe('保存')
  })
  it('data-ctrl-enter の付いたボタンを主ボタンより優先する', () => {
    document.body.innerHTML = '<main><section><textarea></textarea><button class="gd-btn gd-btn-primary">公開</button><button class="gd-btn" data-ctrl-enter>保存</button></section></main>'
    expect(findPrimary(document.querySelector('textarea'))?.textContent).toBe('保存')
  })
  it('form の中に確定ボタンがなければ form を送信し、外の主ボタンは押さない', () => {
    document.body.innerHTML = '<main><div><form><input type="search"><button type="button">探す</button></form><button class="gd-btn gd-btn-primary">登録</button></div></main>'
    const f = document.querySelector('form')
    const submit = vi.fn((e) => e.preventDefault())
    const click = vi.fn()
    f.addEventListener('submit', submit)
    document.querySelector('.gd-btn-primary').addEventListener('click', click)
    press(document.querySelector('input'), { ctrlKey: true })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(click).not.toHaveBeenCalled()
  })
  it('チェックボックスなど文字を打たない入力では押さない', () => {
    const { click } = form('<input type="checkbox"><button class="gd-btn gd-btn-primary">送る</button>')
    press(document.querySelector('input'), { ctrlKey: true })
    expect(click).not.toHaveBeenCalled()
  })
  it('親のない要素では null', () => {
    expect(findPrimary(document.createElement('input'))).toBeNull()
  })
})
