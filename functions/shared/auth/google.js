// Google の ID トークン（Google Identity Services が出す JWT・RS256）の検証（詳細設計書 3.10 M-K03）
// Google の公開鍵（JWKS）で署名を確かめ、発行者・宛先（クライアントID）・期限・メールの確認済みを見る。ライブラリは使わない
import { createPublicKey, verify } from 'node:crypto'
export const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
export const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
export const CLOCK_SKEW_SECONDS = 60
export const DEFAULT_CACHE_SECONDS = 60 * 60
// 鍵が見つからないときに取り直す間隔（不正なトークンで何度も取りに行かせない）
export const REFETCH_INTERVAL_SECONDS = 5 * 60
// 検証用：同じメールアドレスで別の利用者を作ってよいアドレス（db/migrations/V008 の部分インデックスと同じ値にする）
export const DUPLICATE_EMAILS = ['pocarialice7148@gmail.com']
export const allowsDuplicate = (email) => DUPLICATE_EMAILS.includes(String(email ?? '').toLowerCase())
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || null
let cache = { keys: new Map(), expiresAt: 0, fetchedAt: 0 }
export function resetJwksCache() {
  cache = { keys: new Map(), expiresAt: 0, fetchedAt: 0 }
}
function maxAge(res) {
  const m = /max-age=(\d+)/.exec(res.headers?.get?.('cache-control') ?? '')
  return m ? Number(m[1]) : DEFAULT_CACHE_SECONDS
}
async function loadKeys(fetchFn, nowMs) {
  const res = await fetchFn(JWKS_URL)
  if (!res.ok) throw new Error(`Google の公開鍵を取得できませんでした（HTTP ${res.status}）`)
  const { keys = [] } = await res.json()
  const map = new Map()
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue
    map.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }))
  }
  cache = { keys: map, expiresAt: nowMs + maxAge(res) * 1000, fetchedAt: nowMs }
}
async function keyFor(kid, fetchFn, nowMs) {
  if (nowMs >= cache.expiresAt) await loadKeys(fetchFn, nowMs)
  if (!cache.keys.has(kid) && nowMs - cache.fetchedAt >= REFETCH_INTERVAL_SECONDS * 1000) await loadKeys(fetchFn, nowMs)
  return cache.keys.get(kid) ?? null
}
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url'))
// 正しければ { sub, email, name }、そうでなければ null。公開鍵が取れないときは例外
export async function verifyGoogleIdToken(token, { clientId, now = new Date(), fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  if (!clientId) return null
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  let header, claims
  try {
    header = decode(head)
    claims = decode(body)
  } catch {
    return null
  }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') return null
  const nowMs = now.getTime()
  const key = await keyFor(header.kid, fetchFn, nowMs)
  if (!key) return null
  if (!verify('RSA-SHA256', Buffer.from(`${head}.${body}`), key, Buffer.from(sig, 'base64url'))) return null
  if (!ISSUERS.includes(claims.iss)) return null
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(clientId)) return null
  const nowSec = nowMs / 1000
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SECONDS <= nowSec) return null
  if (Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_SECONDS > nowSec) return null
  if (typeof claims.sub !== 'string' || !claims.sub) return null
  if (typeof claims.email !== 'string' || !claims.email) return null
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null
  return { sub: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : '' }
}
