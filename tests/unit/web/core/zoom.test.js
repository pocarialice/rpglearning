import { describe, it, expect, beforeAll } from 'vitest'
import { blockPinchZoom } from '../../../../web/js/core/zoom.js'
beforeAll(() => blockPinchZoom(document))
const fire = (type, props = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, props)
  document.body.dispatchEvent(e)
  return e
}
describe('core/zoom ピンチでの拡大を止める', () => {
  it('iOS のピンチ（gesturestart）を打ち消す', () => {
    expect(fire('gesturestart').defaultPrevented).toBe(true)
  })
  it('2本指の touchmove は打ち消し、1本指のスクロールは止めない', () => {
    expect(fire('touchmove', { touches: [{}, {}] }).defaultPrevented).toBe(true)
    expect(fire('touchmove', { touches: [{}] }).defaultPrevented).toBe(false)
    expect(fire('touchmove').defaultPrevented).toBe(false)
  })
})
