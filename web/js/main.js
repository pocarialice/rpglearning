// 起動処理（詳細設計書 6.1）：ログイン → A-01 → 画面の切り替えを始める
import { CONFIG } from './config.js'
import { createAuth } from './core/auth.js'
import { createApi } from './core/api.js'
import { createRouter } from './core/router.js'
import { getState, setState } from './core/store.js'
import { setContext } from './core/context.js'
import { registerPages } from './pages/index.js'
import { errorBand, M02 } from './components/status.js'
export const M01 = 'ギルドの扉を開けています…'
const NAV = [['/home', 'ホーム'], ['/ranking', 'ランキング'], ['/profile', 'プロフィール']]
function applyTheme(win) {
  const mq = win.matchMedia?.('(prefers-color-scheme: dark)')
  const set = () => { win.document.documentElement.dataset.theme = mq?.matches ? 'dark' : 'light' }
  set()
  mq?.addEventListener?.('change', set)
}
// 冒険中（S-04〜S-06）と初回の流れでは下部ナビを隠し、操作をその画面の主ボタンに絞る（外部設計書 3.7 S-05）
const HIDE_NAV = [/^\/quest\//, /^\/onboarding$/]
export const navVisible = (path) => !HIDE_NAV.some((re) => re.test(path))
function markNav(doc, hash) {
  const path = (hash.replace(/^#/, '') || '/home').split('?')[0]
  const nav = doc.querySelector('.app-nav')
  nav.hidden = !navVisible(path)
  doc.querySelector('.app-shell').classList.toggle('app-no-nav', nav.hidden)
  for (const a of nav.querySelectorAll('a')) {
    if (a.getAttribute('href') === `#${path}`) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
}
export async function boot({ win = window, config = CONFIG } = {}) {
  const doc = win.document
  const root = doc.getElementById('app')
  const resuming = doc.getElementById('app-resuming')
  applyTheme(win)
  doc.querySelector('.app-nav').innerHTML = NAV.map(([href, label]) => `<a href="#${href}">${label}</a>`).join('')
  const auth = createAuth({ config, win, onError: (m) => { root.innerHTML = errorBand(m) } })
  const raw = createApi({ auth, base: config.apiBase, onResuming: () => { resuming.hidden = false } })
  // DBの起動待ち（M-01）の表示は、応答が返ったら消す
  const settle = (fn) => async (...args) => {
    try {
      return await fn(...args)
    } finally {
      resuming.hidden = true
    }
  }
  const api = { apiGet: settle(raw.apiGet), apiPost: settle(raw.apiPost), apiPut: settle(raw.apiPut), apiDelete: settle(raw.apiDelete) }
  if (!(await auth.ensureLogin())) return
  let me
  try {
    me = await api.apiGet('/me')
  } catch {
    root.innerHTML = errorBand(M02)
    return
  }
  setState({ user: me, onboarding: me.onboarding })
  const router = createRouter({ root, getState, win })
  setContext({ api, getState, setState, go: router.go, config, auth })
  registerPages(router)
  win.addEventListener('hashchange', () => { markNav(doc, win.location.hash); win.scrollTo?.(0, 0) })
  markNav(doc, win.location.hash)
  await router.start()
  if ('serviceWorker' in win.navigator && config.env !== 'local') win.navigator.serviceWorker.register('./sw.js').catch(() => {})
}
if (typeof window !== 'undefined' && !window.__RPG_NO_BOOT__) boot()
