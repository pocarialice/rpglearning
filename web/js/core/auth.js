// ログインとトークンの管理（詳細設計書 6.1）。アプリの API（A-30〜A-35）を使う。トークンはメモリと sessionStorage だけに置く
export const TOKEN_KEY = 'rpg.auth'
export const REFRESH_BEFORE_MS = 5 * 60 * 1000
export class AuthError extends Error {
  constructor(code, status, message) {
    super(message ?? code)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}
// showLogin：ログイン画面を出す（画面側で用意する）。reload：ログイン・ログアウトのあとに読み込み直す
export function createAuth({
  config, storage = window.sessionStorage, fetchFn = (...a) => globalThis.fetch(...a),
  showLogin = () => {}, reload = () => window.location.reload()
}) {
  let tokens = null
  let timer = null
  const base = config.apiBase ?? '/api'
  function schedule() {
    clearTimeout(timer)
    const wait = Math.max(tokens.expiresAt - REFRESH_BEFORE_MS - Date.now(), 0)
    timer = setTimeout(() => refresh().catch(() => {}), wait)
  }
  function save(data) {
    tokens = { idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + (data.expiresIn ?? 3600) * 1000 }
    storage.setItem(TOKEN_KEY, JSON.stringify(tokens))
    schedule()
  }
  function clear() {
    tokens = null
    clearTimeout(timer)
    storage.removeItem(TOKEN_KEY)
  }
  async function post(path, body) {
    let res
    try {
      res = await fetchFn(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch (err) {
      throw new AuthError('NETWORK', 0, err?.message)
    }
    if (res.status === 204) return null
    let data = null
    try {
      data = await res.json()
    } catch {
      // JSONでない応答
    }
    if (!res.ok) throw new AuthError(data?.error?.code ?? `HTTP_${res.status}`, res.status, data?.error?.message)
    return data
  }
  // ログイン済みなら true。そうでなければログイン画面を出して false
  function ensureLogin() {
    const stored = JSON.parse(storage.getItem(TOKEN_KEY) ?? 'null')
    if (stored?.idToken) {
      tokens = stored
      schedule()
      return true
    }
    showLogin()
    return false
  }
  // A-30。仮パスワードのときは { challenge, session } を返す（画面で新しいパスワードを聞く）
  async function signIn(email, password) {
    const data = await post('/auth/login', { email, password })
    if (data.challenge) return { challenge: data.challenge, session: data.session }
    save(data)
    return { done: true }
  }
  // A-31
  async function completeNewPassword(session, newPassword) {
    save(await post('/auth/new-password', { session, newPassword }))
  }
  // A-32。失敗したら sessionStorage を消してログイン画面へ
  async function refresh() {
    try {
      if (!tokens?.refreshToken) throw new Error('no refresh token')
      save(await post('/auth/refresh', { refreshToken: tokens.refreshToken }))
    } catch (err) {
      clear()
      reload()
      throw err
    }
  }
  // トークンが切れたときなどに、ログイン画面からやり直す
  function login() {
    clear()
    reload()
  }
  const getIdToken = async () => tokens?.idToken ?? null
  // A-33
  async function logout() {
    const refreshToken = tokens?.refreshToken
    clear()
    if (refreshToken) await post('/auth/logout', { refreshToken }).catch(() => {})
    reload()
  }
  const forgot = (email) => post('/auth/forgot', { email })
  const resetPassword = (token, newPassword) => post('/auth/reset', { token, newPassword })
  return { ensureLogin, signIn, completeNewPassword, refresh, login, getIdToken, logout, forgot, resetPassword }
}
