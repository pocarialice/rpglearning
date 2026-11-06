// Googleの ID トークンをテスト用の RSA 鍵で作る（本物の Google には接続しない）
import { vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { JWKS_URL } from '../../functions/shared/auth/google.js'
export const CLIENT_ID = 'client-123.apps.googleusercontent.com'
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
export const jwk = (kid = 'kid-1', key = pair.publicKey) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' })
// claims は既定の値に上書きする。now は秒
export function googleToken(patch = {}, { kid = 'kid-1', alg = 'RS256', now, wrongKey = false } = {}) {
  const iat = Math.floor((now ?? new Date('2026-10-20T01:00:00Z')).getTime() / 1000)
  const head = b64({ alg, kid, typ: 'JWT' })
  const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-100', email: 'hanako@gmail.com', email_verified: true, name: '山田 花子', iat, exp: iat + 3600, ...patch })
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), (wrongKey ? other : pair).privateKey).toString('base64url')
  return `${head}.${body}.${sig}`
}
// fetch の代わり。JWKS_URL だけに答える
export function jwksFetch(keys = [jwk()], { status = 200, cacheControl = 'public, max-age=3600' } = {}) {
  return vi.fn(async (url) => {
    if (url !== JWKS_URL) throw new Error(`unexpected ${url}`)
    return { ok: status < 400, status, headers: new Headers({ 'cache-control': cacheControl }), json: async () => ({ keys }) }
  })
}
