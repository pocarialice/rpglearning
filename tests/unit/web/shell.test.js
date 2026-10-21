import { describe, it, expect, beforeEach } from 'vitest'
import { navVisible, startPath, adminMenu, isAdmin, renderShell, updateShell } from '../../../web/js/shell.js'
const SYS = ['system_admin', 'learner']
const CA = ['course_admin', 'learner']
beforeEach(() => {
  document.body.innerHTML = `<div class="app-shell"><header class="app-header"><a class="app-name" href="#/home">RPG学習アプリ</a><span class="app-area"></span><a class="app-area-link" hidden></a></header>
<main id="app"></main><nav class="app-nav"></nav><nav class="app-admin-nav" hidden></nav></div>`
})
const q = (sel) => document.querySelector(sel)
describe('M-F08 shell 下部ナビ', () => {
  it('MT-F08-01 冒険中（S-04〜S-06）・初回の流れ・管理局では隠す', () => {
    for (const path of ['/quest/choice', '/quest/explain', '/quest/result', '/onboarding', '/admin/dashboard']) expect(navVisible(path)).toBe(false)
  })
  it('MT-F08-02 ホーム・ランキング・プロフィールなどでは出す', () => {
    for (const path of ['/home', '/ranking', '/profile', '/courses']) expect(navVisible(path)).toBe(true)
  })
})
describe('M-F08 shell ロールと管理局', () => {
  it('MT-F08-03 最初の画面：システム管理者は S-13、コース管理者は S-12、学習者は S-02。まだない画面は飛ばす', () => {
    expect(startPath(SYS)).toBe('/admin/users')
    expect(startPath(SYS, (p) => p !== '/admin/users')).toBe('/admin/dashboard')
    expect(startPath(CA)).toBe('/admin/dashboard')
    expect(startPath(['learner'])).toBe('/home')
    expect(startPath()).toBe('/home')
  })
  it('MT-F08-04 サイドメニューはロールで絞る', () => {
    expect(adminMenu(CA).map(([p]) => p)).toEqual(['/admin/dashboard', '/admin/import'])
    expect(adminMenu(SYS).map(([p]) => p)).toEqual(['/admin/dashboard', '/admin/import', '/admin/users', '/admin/partners'])
    expect(adminMenu(SYS, (p) => !p.includes('partners')).map(([p]) => p)).not.toContain('/admin/partners')
    expect(isAdmin(['learner'])).toBe(false)
  })
  it('MT-F08-05 管理局では濃い茶のヘッダーにロール名、サイドメニュー、学習者エリアへの切り替え', () => {
    renderShell(document, { roles: CA })
    updateShell(document, '#/admin/dashboard?course=c_3', { roles: CA })
    expect(q('.app-shell').classList.contains('app-admin')).toBe(true)
    expect(q('.app-area').textContent).toBe('ギルド管理局コース管理者')
    expect(q('.app-admin-nav').hidden).toBe(false)
    expect(q('.app-nav').hidden).toBe(true)
    expect(q('.app-admin-nav [aria-current="page"]').textContent).toBe('学習状況')
    expect(q('.app-area-link').hidden).toBe(false)
    expect(q('.app-area-link').getAttribute('href')).toBe('#/home')
    expect(q('.app-area-link').textContent).toBe('学習者エリアへ')
  })
  it('MT-F08-06 学習者エリアでは管理者にだけ「管理局へ」を出す', () => {
    renderShell(document, { roles: SYS })
    updateShell(document, '#/home', { roles: SYS })
    expect(q('.app-shell').classList.contains('app-admin')).toBe(false)
    expect(q('.app-admin-nav').hidden).toBe(true)
    expect(q('.app-area').textContent).toBe('')
    expect(q('.app-area-link').getAttribute('href')).toBe('#/admin/users')
    expect(q('.app-nav [aria-current="page"]').textContent).toBe('ホーム')
    updateShell(document, '#/home', { roles: ['learner'] })
    expect(q('.app-area-link').hidden).toBe(true)
  })
})
