import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { hashPassword, verifyPassword, passwordProblems, generateTempPassword, SCRYPT } from '../../../../../functions/shared/auth/password.js'
import { signToken, verifyToken, newOpaqueToken, sha256, ISSUER, ACCESS_TTL_SECONDS } from '../../../../../functions/shared/auth/token.js'
import { NOW } from '../../../../helpers/clock.js'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
describe('M-K01 auth/password', () => {
  it('MT-K01-01 ハッシュと照合', async () => {
    const h = await hashPassword('Guild2026')
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(h).not.toContain('Guild2026')
    expect(await verifyPassword('Guild2026', h)).toBe(true)
    expect(await verifyPassword('Guild2027', h)).toBe(false)
    expect(await hashPassword('Guild2026')).not.toBe(h) // salt が毎回違う
    expect(SCRYPT.keylen).toBe(32)
  })
  it('MT-K01-02 形の崩れたハッシュ・パスワード以外', async () => {
    expect(await verifyPassword('x', null)).toBe(false)
    expect(await verifyPassword('x', 'bcrypt$...')).toBe(false)
    expect(await verifyPassword(undefined, await hashPassword('x'))).toBe(false)
  })
  it('MT-K01-03 パスワードの決まり', () => {
    expect(passwordProblems('Guild2026')).toEqual([])
    expect(passwordProblems('Gu1')).toEqual(['TOO_SHORT'])
    expect(passwordProblems(`A1${'a'.repeat(127)}`)).toEqual(['TOO_LONG'])
    expect(passwordProblems('guildguild')).toEqual(['NO_DIGIT', 'NO_UPPER'])
    expect(passwordProblems('GUILD2026')).toEqual(['NO_LOWER'])
    expect(passwordProblems(null)).toEqual(['REQUIRED'])
  })
  it('MT-K01-04 仮パスワード', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword()
      expect(p).toHaveLength(12)
      expect(passwordProblems(p)).toEqual([])
      expect(p).not.toMatch(/[0O1lI]/)
      seen.add(p)
    }
    expect(seen.size).toBe(200)
    expect(generateTempPassword(16)).toHaveLength(16)
  })
})
describe('M-K02 auth/token', () => {
  it('MT-K02-01 署名と確認', () => {
    const t = signToken({ sub: 's1', groups: ['learner'] }, { now: NOW })
    const claims = verifyToken(t, { now: NOW })
    expect(claims).toMatchObject({ sub: 's1', groups: ['learner'], iss: ISSUER })
    expect(claims.exp - claims.iat).toBe(ACCESS_TTL_SECONDS)
    expect(verifyToken(t)).toBeNull() // NOW から60分以上たった実際の時刻
  })
  it('MT-K02-02 期限・用途・発行者・改ざん', () => {
    const t = signToken({ sub: 's1' }, { now: NOW, ttlSeconds: 60 })
    expect(verifyToken(t, { now: new Date(NOW.getTime() + 59 * 1000) })).not.toBeNull()
    expect(verifyToken(t, { now: new Date(NOW.getTime() + 60 * 1000) })).toBeNull()
    const challenge = signToken({ sub: 's1', purpose: 'new_password' }, { now: NOW })
    expect(verifyToken(challenge, { now: NOW })).toBeNull()
    expect(verifyToken(challenge, { now: NOW, purpose: 'new_password' })).toMatchObject({ purpose: 'new_password' })
    const [h, b, sig] = t.split('.')
    expect(verifyToken(`${h}.${b64({ ...JSON.parse(Buffer.from(b, 'base64url')), sub: 'admin' })}.${sig}`, { now: NOW })).toBeNull()
    expect(verifyToken(`${b64({ alg: 'none' })}.${b}.`, { now: NOW })).toBeNull()
    expect(verifyToken(`${h}.${b}.${sig.slice(0, -2)}`, { now: NOW })).toBeNull()
    expect(verifyToken('abc', { now: NOW })).toBeNull()
    expect(verifyToken('a.b.c', { now: NOW })).toBeNull()
    expect(verifyToken(undefined)).toBeNull()
  })
  it('MT-K02-03 正しい署名でも発行者・期限が違えば通さない', () => {
    // テスト用の AUTH_SECRET で署名し、署名以外の確認だけで落ちることを確かめる
    const sign = (claims) => {
      const head = b64({ alg: 'HS256', typ: 'JWT' })
      const body = b64(claims)
      return `${head}.${body}.${createHmac('sha256', process.env.AUTH_SECRET).update(`${head}.${body}`).digest('base64url')}`
    }
    const exp = Math.floor(NOW.getTime() / 1000) + 60
    expect(verifyToken(sign({ sub: 's1', iss: ISSUER, exp }), { now: NOW })).toMatchObject({ sub: 's1' })
    expect(verifyToken(sign({ sub: 's1', iss: 'other', exp }), { now: NOW })).toBeNull()
    expect(verifyToken(sign({ sub: 's1', iss: ISSUER }), { now: NOW })).toBeNull()
    expect(verifyToken(sign({ sub: 's1', iss: ISSUER, exp, purpose: 'reset' }), { now: NOW })).toBeNull()
  })
  it('MT-K02-04 AUTH_SECRET が短い', () => {
    process.env.AUTH_SECRET = 'short'
    expect(() => signToken({ sub: 's' })).toThrow('AUTH_SECRET は32文字以上')
    delete process.env.AUTH_SECRET
    expect(() => signToken({ sub: 's' })).toThrow('AUTH_SECRET は32文字以上')
  })
  it('MT-K02-05 使い捨ての値とハッシュ', () => {
    const a = newOpaqueToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newOpaqueToken()).not.toBe(a)
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
