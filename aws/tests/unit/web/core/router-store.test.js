import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, parseHash, M11 } from '../../../../web/js/core/router.js'
import { createStore, getState, setState, subscribe } from '../../../../web/js/core/store.js'
let root
let state
const page = () => ({ render: vi.fn() })
beforeEach(() => {
  root = document.createElement('div')
  state = { user: { roles: ['learner'] }, onboarding: { needNickname: false, needCourse: false, needPartner: false } }
  window.location.hash = ''
})
function setup() {
  const pages = { home: page(), ranking: page(), users: page(), onboarding: page() }
  const loads = { home: vi.fn(async () => pages.home), ranking: vi.fn(async () => pages.ranking), users: vi.fn(async () => pages.users), onboarding: vi.fn(async () => pages.onboarding) }
  const router = createRouter({ root, getState: () => state })
  router.register('/home', loads.home)
  router.register('/ranking', loads.ranking, ['learner'])
  router.register('/admin/users', loads.users, ['system_admin'])
  router.register('/onboarding', loads.onboarding)
  return { router, pages, loads }
}
describe('M-F03 core/router', () => {
  it('MT-F03-01 画面の切り替え', async () => {
    const { router, pages } = setup()
    window.location.hash = '#/ranking?week=2026-10-12'
    await router.render()
    expect(pages.ranking.render).toHaveBeenCalledWith(root, { week: '2026-10-12' })
  })
  it('MT-F03-02 知らないハッシュ', async () => {
    const { router } = setup()
    window.location.hash = '#/unknown'
    await router.render()
    expect(window.location.hash).toBe('#/home')
  })
  it('MT-F03-03 ロール不足', async () => {
    const { router, loads } = setup()
    window.location.hash = '#/admin/users'
    await router.render()
    expect(root.textContent).toBe(M11)
    expect(loads.users).not.toHaveBeenCalled()
  })
  it('MT-F03-04 初回の流れ', async () => {
    const { router, loads } = setup()
    state.onboarding.needNickname = true
    window.location.hash = '#/home'
    await router.render()
    expect(window.location.hash).toBe('#/onboarding')
    expect(loads.home).not.toHaveBeenCalled()
  })
  it('MT-F03-06 管理局は初回の流れの前でも開ける', async () => {
    const { router, pages } = setup()
    state.user.roles = ['system_admin', 'learner']
    state.onboarding.needNickname = true
    window.location.hash = '#/admin/users'
    await router.render()
    expect(window.location.hash).toBe('#/admin/users')
    expect(pages.users.render).toHaveBeenCalledWith(root, {})
  })
  it('MT-F03-05 ハッシュの解釈・start で hashchange を聞く・ロールのない状態', async () => {
    expect(parseHash('')).toEqual({ path: '/home', params: {} })
    expect(parseHash(undefined)).toEqual({ path: '/home', params: {} })
    const { router, pages } = setup()
    state = { user: null, onboarding: null }
    window.location.hash = '#/home'
    await router.start()
    expect(pages.home.render).toHaveBeenCalledTimes(1)
    window.location.hash = '#/ranking'
    await vi.waitFor(() => expect(root.textContent).toBe(M11))
    state.onboarding = { needNickname: false, needCourse: false, needPartner: true }
    router.go('/home')
    await vi.waitFor(() => expect(window.location.hash).toBe('#/onboarding'))
  })
})
describe('M-F04 core/store', () => {
  it('MT-F04-01 状態の通知', () => {
    const store = createStore({ level: 3 })
    const fn = vi.fn()
    const off = store.subscribe(fn)
    store.setState({ level: 4 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith({ level: 4 })
    off()
    store.setState({ level: 5 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(store.getState()).toEqual({ level: 5 })
  })
  it('MT-F04-02 既定のストア', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    setState({ adventureId: 'adv_90' })
    expect(getState()).toMatchObject({ user: null, adventureId: 'adv_90' })
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    expect(createStore().getState()).toEqual({})
  })
})
