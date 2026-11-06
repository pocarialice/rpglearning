import { describe, it, expect, beforeEach } from 'vitest'
import { verifyGoogleIdToken, resetJwksCache, allowsDuplicate, googleClientId, DUPLICATE_EMAILS } from '../../../../../functions/shared/auth/google.js'
import { CLIENT_ID, googleToken, jwksFetch, jwk } from '../../../../helpers/google.js'
import { NOW } from '../../../../helpers/clock.js'
const at = (sec) => new Date(NOW.getTime() + sec * 1000)
const check = (token, opts = {}) => verifyGoogleIdToken(token, { clientId: CLIENT_ID, now: NOW, fetchFn: jwksFetch(), ...opts })
beforeEach(() => resetJwksCache())
describe('M-K03 auth/google', () => {
  it('MT-K03-01 正しい ID トークンなら sub・email・name を返す', async () => {
    expect(await check(googleToken())).toEqual({ sub: 'g-100', email: 'hanako@gmail.com', name: '山田 花子' })
    expect(await check(googleToken({ iss: 'accounts.google.com', aud: [CLIENT_ID, 'x'], email_verified: 'true', name: 1 }))).toMatchObject({ name: '' })
  })
  it('MT-K03-02 署名・形式・アルゴリズム・鍵が違えば null', async () => {
    for (const t of [googleToken({}, { wrongKey: true }), googleToken({}, { alg: 'HS256' }), googleToken({}, { kid: 'unknown' }), 'a.b', 'x.y.z', '', null]) {
      expect(await check(t)).toBeNull()
    }
    expect(await verifyGoogleIdToken(googleToken(), { clientId: null, now: NOW, fetchFn: jwksFetch() })).toBeNull()
  })
  it('MT-K03-03 発行者・宛先・期限・メール確認を確かめる', async () => {
    for (const patch of [{ iss: 'https://evil.example' }, { aud: 'other-client' }, { exp: Math.floor(NOW / 1000) - 61 }, { exp: 'x' },
      { iat: Math.floor(NOW / 1000) + 120 }, { sub: '' }, { email: undefined }, { email_verified: false }]) {
      expect(await check(googleToken(patch))).toBeNull()
    }
    // 60秒までの時計のずれは許す
    expect(await check(googleToken({ exp: Math.floor(NOW / 1000) - 30 }))).not.toBeNull()
  })
  it('MT-K03-04 公開鍵はキャッシュし、期限が切れたら取り直す', async () => {
    const fetchFn = jwksFetch([jwk()], { cacheControl: 'max-age=100' })
    await check(googleToken(), { fetchFn })
    await check(googleToken(), { fetchFn, now: at(50) })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await check(googleToken({}, { now: at(200) }), { fetchFn, now: at(200) })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('MT-K03-05 知らない鍵は5分以上たってから取り直す（鍵の入れ替え）', async () => {
    const fetchFn = jwksFetch([jwk('kid-1')])
    expect(await check(googleToken({}, { kid: 'kid-2' }), { fetchFn })).toBeNull()
    expect(await check(googleToken({}, { kid: 'kid-2' }), { fetchFn, now: at(60) })).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const rotated = jwksFetch([jwk('kid-1'), jwk('kid-2'), { kty: 'EC', kid: 'ec' }, { kty: 'RSA' }], { cacheControl: '' })
    expect(await check(googleToken({}, { kid: 'kid-2', now: at(400) }), { fetchFn: rotated, now: at(400) })).not.toBeNull()
  })
  it('MT-K03-06 公開鍵を取れないときは例外', async () => {
    await expect(check(googleToken(), { fetchFn: jwksFetch([], { status: 500 }) })).rejects.toThrow('HTTP 500')
  })
  it('MT-K03-07 検証用の重複可アドレスとクライアントID', () => {
    expect(DUPLICATE_EMAILS).toEqual(['pocarialice7148@gmail.com'])
    expect(allowsDuplicate('PocariAlice7148@gmail.com')).toBe(true)
    expect(allowsDuplicate('hanako@gmail.com')).toBe(false)
    expect(allowsDuplicate(undefined)).toBe(false)
    delete process.env.GOOGLE_CLIENT_ID
    expect(googleClientId()).toBeNull()
    process.env.GOOGLE_CLIENT_ID = ' cid '
    expect(googleClientId()).toBe('cid')
    delete process.env.GOOGLE_CLIENT_ID
  })
})
