// #/home などのハッシュで画面を切り替える（詳細設計書 6.1）
import { escapeHtml } from '../logic/format.js'
export const M11 = 'この画面を開く権限がありません'
export const ONBOARDING_PATH = '/onboarding'
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '') || '/home'
  const [path, qs = ''] = raw.split('?')
  return { path, params: Object.fromEntries(new URLSearchParams(qs)) }
}
// pages：{ path: { load: () => import('...'), roles } }。読み込みは必要になってから行う
export function createRouter({ root, getState, win = window }) {
  const routes = new Map()
  const go = (path) => {
    win.location.hash = `#${path}`
  }
  function register(path, load, roles = null) {
    routes.set(path, { load, roles })
  }
  async function render() {
    const { path, params } = parseHash(win.location.hash)
    const route = routes.get(path)
    if (!route) return go('/home')
    const state = getState()
    const ob = state.onboarding
    if (ob && (ob.needNickname || ob.needCourse || ob.needPartner) && path !== ONBOARDING_PATH) return go(ONBOARDING_PATH)
    const roles = state.user?.roles ?? []
    if (route.roles && !route.roles.some((r) => roles.includes(r))) {
      root.innerHTML = `<p class="error" role="alert">${escapeHtml(M11)}</p>`
      return
    }
    const page = await route.load()
    await page.render(root, params)
  }
  function start() {
    win.addEventListener('hashchange', render)
    return render()
  }
  return { register, start, go, render }
}
