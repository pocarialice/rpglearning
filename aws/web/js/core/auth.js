// 認可コード＋PKCE とトークンの管理（詳細設計書 6.1）。トークンはメモリと sessionStorage だけに置く
const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
// 256 は 66 の倍数でないため、偏りが出ないよう 198（66×3）未満のバイトだけを使う
const ACCEPT_BELOW = Math.floor(256 / VERIFIER_CHARS.length) * VERIFIER_CHARS.length
export const TOKEN_KEY = 'rpg.auth'
export const PKCE_KEY = 'rpg.pkce'
export const REFRESH_BEFORE_MS = 5 * 60 * 1000
function randomString(length) {
  let out = ''
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length))) {
      if (b < ACCEPT_BELOW && out.length < length) out += VERIFIER_CHARS[b % VERIFIER_CHARS.length]
    }
  }
  return out
}
export function createVerifier() {
  return randomString(64)
}
export function base64Url(bytes) {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function challengeFor(verifier) {
  return base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}
function jwtExpMs(idToken) {
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}
// config：{ cognitoDomain, clientId, redirectUri }。navigate（画面の移動）はテストで差し替える
export function createAuth({
  config, navigate = (url) => window.location.assign(url), storage = window.sessionStorage,
  fetchFn = (...a) => globalThis.fetch(...a), win = window, onError = () => {}
}) {
  let tokens = null
  let timer = null
  function schedule() {
    clearTimeout(timer)
    const wait = Math.max(tokens.expiresAt - REFRESH_BEFORE_MS - Date.now(), 0)
    timer = setTimeout(() => refresh().catch(() => {}), wait)
  }
  function save(t) {
    tokens = t
    storage.setItem(TOKEN_KEY, JSON.stringify(t))
    schedule()
  }
  function clear() {
    tokens = null
    clearTimeout(timer)
    storage.removeItem(TOKEN_KEY)
    storage.removeItem(PKCE_KEY)
  }
  async function tokenRequest(params) {
    const res = await fetchFn(`${config.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...params }).toString()
    })
    if (!res.ok) throw new Error(`token request failed: ${res.status}`)
    return res.json()
  }
  const toTokens = (data, refreshToken) => ({
    idToken: data.id_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: jwtExpMs(data.id_token) ?? Date.now() + (data.expires_in ?? 3600) * 1000
  })
  async function login() {
    const verifier = createVerifier()
    const state = randomString(32)
    storage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }))
    const q = new URLSearchParams({
      response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: 'openid email profile',
      code_challenge_method: 'S256', code_challenge: await challengeFor(verifier), state, lang: 'ja'
    })
    navigate(`${config.cognitoDomain}/oauth2/authorize?${q}`)
  }
  // ログイン済みなら true。Cognito からの戻りならトークンを取る。どちらでもなければログイン画面へ移動して false
  async function ensureLogin() {
    const url = new URL(win.location.href)
    const code = url.searchParams.get('code')
    if (code) {
      const returnedState = url.searchParams.get('state')
      const saved = JSON.parse(storage.getItem(PKCE_KEY) ?? 'null')
      storage.removeItem(PKCE_KEY)
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      win.history.replaceState(null, '', url.pathname + url.search + url.hash)
      if (!saved || saved.state !== returnedState) {
        onError('ログインの確認に失敗しました。もう一度ログインしてください')
        return false
      }
      const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: saved.verifier })
      save(toTokens(data))
      return true
    }
    const stored = JSON.parse(storage.getItem(TOKEN_KEY) ?? 'null')
    if (stored?.idToken) {
      tokens = stored
      schedule()
      return true
    }
    await login()
    return false
  }
  // 失敗したら sessionStorage を消してログイン画面へ
  async function refresh() {
    try {
      if (!tokens?.refreshToken) throw new Error('no refresh token')
      const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
      save(toTokens(data, tokens.refreshToken))
    } catch (err) {
      clear()
      await login()
      throw err
    }
  }
  const getIdToken = async () => tokens?.idToken ?? null
  function logout() {
    clear()
    const q = new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirectUri })
    navigate(`${config.cognitoDomain}/logout?${q}`)
  }
  return { ensureLogin, login, refresh, getIdToken, logout }
}
