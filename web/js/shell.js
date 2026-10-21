// 画面の外枠：学習者エリア（下部ナビ）と管理局（濃い茶のヘッダー・左サイドメニュー）の切り替え（外部設計書 3.3.2・3.4）
import { escapeHtml } from './logic/format.js'
export const LEARNER_NAV = [['/home', 'ホーム'], ['/ranking', 'ランキング'], ['/profile', 'プロフィール']]
const COURSE_ADMINS = ['course_admin', 'system_admin']
export const ADMIN_MENU = [
  ['/admin/dashboard', '学習状況', COURSE_ADMINS],
  ['/admin/import', '問題の取り込み', COURSE_ADMINS],
  ['/admin/users', '利用者・コース', ['system_admin']],
  ['/admin/partners', 'AIパートナー', ['system_admin']]
]
export const ROLE_LABEL = { system_admin: 'システム管理者', course_admin: 'コース管理者' }
const can = (roles, allowed) => allowed.some((r) => roles.includes(r))
export const isAdmin = (roles = []) => can(roles, COURSE_ADMINS)
export const isAdminPath = (path) => path.startsWith('/admin/')
// 管理局で開ける画面（has：登録済みの画面かどうか）
export const adminMenu = (roles = [], has = () => true) => ADMIN_MENU.filter(([path, , allowed]) => can(roles, allowed) && has(path))
// ログイン後の最初の画面：システム管理者は S-13、コース管理者は S-12、学習者は S-02。まだない画面は飛ばす
export function startPath(roles = [], has = () => true) {
  const order = roles.includes('system_admin') ? ['/admin/users', '/admin/dashboard'] : roles.includes('course_admin') ? ['/admin/dashboard'] : []
  return order.find(has) ?? '/home'
}
// 冒険中（S-04〜S-06）と初回の流れでは下部ナビを隠し、操作をその画面の主ボタンに絞る（外部設計書 3.7 S-05）
const HIDE_NAV = [/^\/quest\//, /^\/onboarding$/]
export const navVisible = (path) => !isAdminPath(path) && !HIDE_NAV.some((re) => re.test(path))
const markCurrent = (links, path) => {
  for (const a of links) {
    if (a.getAttribute('href') === `#${path}`) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
}
export function renderShell(doc, { roles = [], has = () => true }) {
  doc.querySelector('.app-nav').innerHTML = LEARNER_NAV.map(([href, label]) => `<a href="#${href}">${label}</a>`).join('')
  doc.querySelector('.app-admin-nav').innerHTML = `<p class="caption app-admin-nav-label">ギルド管理局</p>${adminMenu(roles, has).map(([href, label]) => `<a href="#${href}">${label}</a>`).join('')}`
}
export function updateShell(doc, hash, { roles = [], has = () => true }) {
  const path = (hash.replace(/^#/, '') || '/home').split('?')[0]
  const admin = isAdminPath(path)
  const shell = doc.querySelector('.app-shell')
  const nav = doc.querySelector('.app-nav')
  const side = doc.querySelector('.app-admin-nav')
  shell.classList.toggle('app-admin', admin)
  nav.hidden = !navVisible(path)
  side.hidden = !admin
  shell.classList.toggle('app-no-nav', nav.hidden)
  const role = roles.includes('system_admin') ? 'system_admin' : 'course_admin'
  doc.querySelector('.app-area').innerHTML = admin ? `<span class="app-area-name">ギルド管理局</span><span class="app-area-role">${escapeHtml(ROLE_LABEL[role])}</span>` : ''
  const sw = doc.querySelector('.app-area-link')
  sw.hidden = !isAdmin(roles)
  if (!sw.hidden) {
    sw.setAttribute('href', admin ? '#/home' : `#${startPath(roles, has)}`)
    sw.textContent = admin ? '学習者エリアへ' : '管理局へ'
  }
  markCurrent(nav.querySelectorAll('a'), path)
  markCurrent(side.querySelectorAll('a'), path)
}
