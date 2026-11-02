import { describe, it, expect, beforeAll } from 'vitest'
import { blockPinchZoom } from '../../../../web/js/core/zoom.js'
beforeAll(() => blockPinchZoom(document))
const fire = (type, props = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, props)
  document.body.dispatchEvent(e)
  return e
}
describe('M-F28 core/zoom.js ピンチでの拡大を止める', () => {
  it('MT-F28-01 iOS のピンチ（gesturestart）を打ち消す', () => {
    expect(fire('gesturestart').defaultPrevented).toBe(true)
  })
  it('MT-F28-02 2本指の touchmove は打ち消し、1本指のスクロールは止めない', () => {
    expect(fire('touchmove', { touches: [{}, {}] }).defaultPrevented).toBe(true)
    expect(fire('touchmove', { touches: [{}] }).defaultPrevented).toBe(false)
    expect(fire('touchmove').defaultPrevented).toBe(false)
  })
})
