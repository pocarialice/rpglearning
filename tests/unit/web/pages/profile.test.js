import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setContext } from '../../../../web/js/core/context.js'
import { createStore } from '../../../../web/js/core/store.js'
import { ApiError } from '../../../../web/js/core/api.js'
import * as profile from '../../../../web/js/pages/learner/s08-profile.js'
import * as courses from '../../../../web/js/pages/learner/s03-courses.js'
import * as partnerPage from '../../../../web/js/pages/learner/s09-partner.js'
const STATS = { courseId: 'c_3', coveragePct: 40, correctPct: null, answerCount: 0, mastered: 2, streakDays: 7, level: 3, expInLevel: 30, next: 240, totalExp: 330 }
const BADGES = { badges: [
  { code: 'streak_bronze', category: 'streak', tier: 'bronze', name: '継続の証（銅）', condition: '7日連続で1問以上解答', earnedAt: '2026-10-20T00:00:00+09:00' },
  { code: 'mastery_bronze', category: 'mastery', tier: 'bronze', name: '習得の証（銅）', condition: '習得済みの問題が10問', earnedAt: null }
] }
const COURSES = { courses: [{ id: 'c_3', name: '基本情報', certification: '基本情報技術者', questionCount: 80, coveragePct: 40, enrolled: true, current: true }, { id: 'c_4', name: 'AWS SAA', certification: 'AWS', questionCount: 120, coveragePct: 0, enrolled: false, current: false }] }
let root, store, api, go, auth
function setup(user = {}) {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  store = createStore({ user: { roles: ['learner'], nickname: 'たろう', currentCourseId: 'c_3', partner: { persona: 'encourage', name: 'ルナ', imageUrl: null }, ...user }, adventureId: 'adv_1' })
  api = { apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn() }
  go = vi.fn()
  auth = { logout: vi.fn() }
  setContext({ api, getState: store.getState, setState: store.setState, go, auth, config: { release: '20261105-01' } })
}
const q = (sel) => document.querySelector(sel)
const click = (sel) => q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const type = (sel, v) => { q(sel).value = v; q(sel).dispatchEvent(new Event('input')) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const mockProfile = () => api.apiGet.mockImplementation(async (p) => (p === '/me/stats' ? STATS : BADGES))
beforeEach(() => setup())
describe('S-08 プロフィール', () => {
  it('レベル・学習記録・バッジ・メニューを表示する', async () => {
    mockProfile()
    await profile.render(root)
    expect(api.apiGet).toHaveBeenCalledWith('/me/stats')
    expect(api.apiGet).toHaveBeenCalledWith('/me/badges')
    expect(q('.app-nickname').textContent).toBe('たろう')
    expect(q('.gd-crest b').textContent).toBe('3')
    expect(root.textContent).toContain('累計 330 EXP')
    const stats = [...root.querySelectorAll('.app-stat')].map((s) => s.textContent)
    expect(stats).toEqual(['網羅率40.0%', '正答率-', '連続学習7 日', '習得済み2 問'])
    const [earned, locked] = root.querySelectorAll('.app-badge-item')
    expect(earned.querySelector('.gd-badge-date').textContent).toBe('2026/10/20')
    expect(locked.querySelector('.gd-emblem-locked')).not.toBeNull()
    expect(locked.querySelector('.app-badge-cond').textContent).toBe('習得済みの問題が10問')
    expect(root.textContent).toContain('リリース 20261105-01')
  })
  it('メニューから各画面へ移り、ログアウトできる', async () => {
    mockProfile()
    await profile.render(root)
    click('[data-go="/courses"]')
    click('[data-go="/partner"]')
    click('[data-go="/settings/notify"]')
    expect(go.mock.calls.map((c) => c[0])).toEqual(['/courses', '/partner', '/settings/notify'])
    click('[data-action="logout"]')
    expect(auth.logout).toHaveBeenCalled()
  })
  it('ニックネームをダイアログで変える', async () => {
    mockProfile()
    await profile.render(root)
    click('[data-action="edit-nickname"]')
    expect(q('dialog .title').textContent).toBe('ニックネームを変える')
    expect(q('dialog #nickname').value).toBe('たろう')
    type('dialog #nickname', 'じろう')
    api.apiPut.mockResolvedValue({ nickname: 'じろう' })
    click('dialog [data-action="nickname"]')
    await flush()
    expect(api.apiPut).toHaveBeenCalledWith('/me/profile', { nickname: 'じろう' })
    expect(q('dialog')).toBeNull()
    expect(q('.app-nickname').textContent).toBe('じろう')
    expect(store.getState().user.nickname).toBe('じろう')
  })
  it('「やめる」で閉じ、?edit=nickname で開いた状態にする', async () => {
    mockProfile()
    await profile.render(root, { edit: 'nickname' })
    expect(q('dialog')).not.toBeNull()
    click('dialog [data-action="cancel"]')
    expect(q('dialog')).toBeNull()
    expect(api.apiPut).not.toHaveBeenCalled()
  })
  it('読み込めないときは再読み込みできる', async () => {
    api.apiGet.mockRejectedValueOnce(new ApiError('NETWORK', 0))
    await profile.render(root)
    expect(q('[role="alert"]')).not.toBeNull()
    mockProfile()
    click('[data-action="reload"]')
    await flush()
    expect(q('.app-nickname')).not.toBeNull()
  })
})
describe('S-03 コース選択', () => {
  it('受講中の印。選び直すと冒険を空にしてホームへ', async () => {
    api.apiGet.mockResolvedValue(COURSES)
    await courses.render(root)
    expect(root.querySelectorAll('.app-course')[0].textContent).toContain('受講中')
    api.apiPost.mockResolvedValue({ courseId: 'c_4', enrolled: true })
    click('[data-course="c_4"]')
    await flush()
    expect(store.getState().user.currentCourseId).toBe('c_4')
    expect(store.getState().adventureId).toBeNull()
    expect(go).toHaveBeenCalledWith('/home')
  })
  it('ニックネームの重複（M-08）はニックネームの変更へ案内する', async () => {
    api.apiGet.mockResolvedValue(COURSES)
    await courses.render(root)
    api.apiPost.mockRejectedValue(new ApiError('CONFLICT', 409))
    click('[data-course="c_4"]')
    await flush()
    expect(q('[role="alert"]').textContent).toContain('このニックネームはすでに使われています')
    click('[data-action="nickname"]')
    expect(go).toHaveBeenCalledWith('/profile?edit=nickname')
    expect(store.getState().user.currentCourseId).toBe('c_3')
  })
  it('「プロフィールへ戻る」', async () => {
    api.apiGet.mockResolvedValue(COURSES)
    await courses.render(root)
    click('[data-action="back"]')
    expect(go).toHaveBeenCalledWith('/profile')
  })
})
describe('S-09 AIパートナー選択', () => {
  it('今の仲間と名前が選ばれた状態で開く', async () => {
    await partnerPage.render(root)
    expect(q('[data-persona="encourage"]').getAttribute('aria-checked')).toBe('true')
    expect(q('#partner-name').value).toBe('ルナ')
    expect(q('[data-action="partner"]').disabled).toBe(false)
  })
  it('キャラクターを変えると名前は空（初期名）に戻り、決めるとプロフィールへ', async () => {
    await partnerPage.render(root)
    click('[data-persona="rival"]')
    expect(q('#partner-name').value).toBe('')
    expect(q('#partner-name').placeholder).toBe('レン（初期名）')
    api.apiPut.mockResolvedValue({ persona: 'rival', name: 'レン' })
    click('[data-action="partner"]')
    await flush()
    expect(api.apiPut).toHaveBeenCalledWith('/me/partner', { persona: 'rival', name: '' })
    expect(store.getState().user.partner).toEqual({ persona: 'rival', name: 'レン', imageUrl: null })
    expect(go).toHaveBeenCalledWith('/profile')
  })
  it('「やめる」は保存せずプロフィールへ', async () => {
    await partnerPage.render(root)
    click('[data-action="back"]')
    expect(api.apiPut).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith('/profile')
  })
})
