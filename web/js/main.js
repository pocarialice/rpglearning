// 起動処理（詳細設計書 6.1）：ログイン（S-01） → A-01 → 画面の切り替えを始める
import { CONFIG } from './config.js'
import { createAuth } from './core/auth.js'
import { renderLogin } from './pages/login.js'
import { createApi } from './core/api.js'
import { createRouter } from './core/router.js'
import { getState, setState } from './core/store.js'
import { setContext } from './core/context.js'
import { registerPages, PAGES } from './pages/index.js'
import { renderShell, updateShell, startPath } from './shell.js'
import { errorBand, M02 } from './components/status.js'
import { installCtrlEnter } from './core/keys.js'
export const M01 = 'ギルドの扉を開けています…'
function applyTheme(win) {
  const mq = win.matchMedia?.('(prefers-color-scheme: dark)')
  const set = () => { win.document.documentElement.dataset.theme = mq?.matches ? 'dark' : 'light' }
  set()
  mq?.addEventListener?.('change', set)
}
export async function boot({ win = window, config = CONFIG } = {}) {
  const doc = win.document
  const root = doc.getElementById('app')
  const resuming = doc.getElementById('app-resuming')
  applyTheme(win)
  installCtrlEnter(doc)
  const auth = createAuth({
    config, storage: win.sessionStorage, reload: () => win.location.reload(),
    showLogin: () => renderLogin(root, { auth, win })
  })
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
  // 再設定リンク（#/reset?token=…）はログイン中でも再設定の画面を出す
  if (/^#\/reset\?/.test(win.location.hash)) return renderLogin(root, { auth, win })
  if (!auth.ensureLogin()) return
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
  const shellOpts = { roles: me.roles ?? [], has: (path) => PAGES.some(([p]) => p === path) }
  renderShell(doc, shellOpts)
  // ハッシュなしで開いたときは、ロールで最初の画面を決める（外部設計書 3.3.2）
  if (!win.location.hash) win.history.replaceState(null, '', `#${startPath(shellOpts.roles, shellOpts.has)}`)
  win.addEventListener('hashchange', () => { updateShell(doc, win.location.hash, shellOpts); win.scrollTo?.(0, 0) })
  updateShell(doc, win.location.hash, shellOpts)
  await router.start()
  if ('serviceWorker' in win.navigator && config.env !== 'local') win.navigator.serviceWorker.register('./sw.js').catch(() => {})
}
if (typeof window !== 'undefined' && !window.__RPG_NO_BOOT__) boot()
