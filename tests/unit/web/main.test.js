import { describe, it, expect, beforeAll } from 'vitest'
let navVisible
beforeAll(async () => {
  window.__RPG_NO_BOOT__ = true
  ;({ navVisible } = await import('../../../web/js/main.js'))
})
describe('下部ナビの表示', () => {
  it('冒険中（S-04〜S-06）と初回の流れでは隠す', () => {
    for (const path of ['/quest/choice', '/quest/explain', '/quest/result', '/onboarding']) expect(navVisible(path)).toBe(false)
  })
  it('ホーム・ランキング・プロフィールなどでは出す', () => {
    for (const path of ['/home', '/ranking', '/profile', '/courses']) expect(navVisible(path)).toBe(true)
  })
})
