// ログインとトークンの管理（詳細設計書 6.1）。アプリの API（A-30〜A-39）を使う。トークンはメモリと sessionStorage だけに置く
export const TOKEN_KEY = 'rpg.auth'
export const REFRESH_BEFORE_MS = 5 * 60 * 1000
// dev のサーバーが止まっていて起こしているとき（SERVER_WAKING。構築手順書 3.14）は、5秒ごとに4分まで待ってやり直す
export const WAKE_RETRY_MS = 5000
export const WAKE_RETRIES = 48
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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
    return send(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }
  async function send(path, init) {
    for (let waking = 0; ; waking++) {
      try {
        return await sendOnce(path, init)
      } catch (err) {
        if (err.code !== 'SERVER_WAKING' || waking >= WAKE_RETRIES) throw err
        await sleep(WAKE_RETRY_MS)
      }
    }
  }
  async function sendOnce(path, init) {
    let res
    try {
      res = await fetchFn(`${base}${path}`, init)
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
  // A-38。Googleでログインが使えないときは clientId が null
  async function googleConfig() {
    const data = await send('/auth/google/config', { method: 'GET' })
    return { clientId: data?.clientId ?? null }
  }
  // A-39。Google が出した ID トークン（credential）を渡してログインする
  async function signInWithGoogle(credential) {
    save(await post('/auth/google', { credential }))
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
  // A-36 アカウント作成の受付（確認メールが届く）
  const signUp = (email, fullName, password) => post('/auth/signup', { email, fullName, password })
  // A-37 確認リンクからの登録。そのままログインした状態になる
  async function verifySignup(token) {
    save(await post('/auth/signup/verify', { token }))
  }
  return { ensureLogin, signIn, completeNewPassword, refresh, login, getIdToken, logout, forgot, resetPassword, signUp, verifySignup, googleConfig, signInWithGoogle }
}
