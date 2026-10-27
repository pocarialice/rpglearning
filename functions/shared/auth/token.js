// アクセストークン（JWT・HS256）と、リフレッシュトークンなどの使い捨ての値（詳細設計書 3.10 M-K02）
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
export const ISSUER = 'rpg-learning'
export const ACCESS_TTL_SECONDS = 60 * 60
const b64url = (buf) => Buffer.from(buf).toString('base64url')
const json64 = (obj) => b64url(JSON.stringify(obj))
function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET は32文字以上にしてください')
  return s
}
const sign = (data) => createHmac('sha256', secret()).update(data).digest()
// claims に sub・groups・purpose などを入れる。exp は now からの秒数
export function signToken(claims, { ttlSeconds = ACCESS_TTL_SECONDS, now = new Date() } = {}) {
  const iat = Math.floor(now.getTime() / 1000)
  const head = json64({ alg: 'HS256', typ: 'JWT' })
  const body = json64({ ...claims, iss: ISSUER, iat, exp: iat + ttlSeconds })
  return `${head}.${body}.${b64url(sign(`${head}.${body}`))}`
}
// 正しければ claims、そうでなければ null（署名・形式・期限・発行者・用途を確かめる）
export function verifyToken(token, { purpose = 'access', now = new Date() } = {}) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  let header, claims
  try {
    header = JSON.parse(Buffer.from(head, 'base64url'))
    claims = JSON.parse(Buffer.from(body, 'base64url'))
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null
  const expected = sign(`${head}.${body}`)
  const actual = Buffer.from(sig, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  if (claims.iss !== ISSUER || (claims.purpose ?? 'access') !== purpose) return null
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now.getTime()) return null
  return claims
}
// リフレッシュトークン・再設定リンクの値。DBには SHA-256 だけを保存する
export const newOpaqueToken = () => randomBytes(32).toString('base64url')
export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex')
