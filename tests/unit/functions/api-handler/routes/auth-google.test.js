import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../../../../functions/shared/db/repositories/auth.js', async (orig) => ({ ...(await orig()), ...Object.fromEntries(
  ['findByEmail', 'findById', 'findByGoogleSub', 'linkGoogle', 'setGoogleOnly', 'saveRefreshToken'].map((n) => [n, vi.fn()])) }))
vi.mock('../../../../../functions/shared/db/repositories/users.js', async (orig) => ({ ...(await orig()), create: vi.fn() }))
vi.mock('../../../../../functions/shared/auth/google.js', async (orig) => ({ ...(await orig()), verifyGoogleIdToken: vi.fn() }))
import * as auth from '../../../../../functions/shared/db/repositories/auth.js'
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import { verifyGoogleIdToken } from '../../../../../functions/shared/auth/google.js'
import { setPool } from '../../../../../functions/shared/db/client.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { fullNameFrom } from '../../../../../functions/api-handler/routes/auth.js'
import { verifyToken } from '../../../../../functions/shared/auth/token.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { dbMock } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
let log, db
const call = (method, path, body) => main(httpEvent({ method, path, body, auth: false }), { log, now: NOW })
const login = (credential = 'google-id-token') => call('POST', '/api/auth/google', { credential })
const claims = (patch = {}) => ({ sub: 'g-100', email: 'hanako@gmail.com', name: '山田 花子', ...patch })
const user = (patch = {}) => ({ userId: 21, authSub: 'sub-21', email: 'hanako@gmail.com', status: 'active', mustChangePassword: false, roles: ['learner'], ...patch })
beforeEach(() => {
  log = memoryLogger()
  db = dbMock()
  setPool(db)
  process.env.GOOGLE_CLIENT_ID = 'client-123'
  for (const fn of [...Object.values(auth), users.create, verifyGoogleIdToken]) if (vi.isMockFunction(fn)) fn.mockReset()
  verifyGoogleIdToken.mockResolvedValue(claims())
  auth.findByGoogleSub.mockResolvedValue(null)
  auth.findByEmail.mockResolvedValue(null)
  auth.findById.mockResolvedValue(user())
  auth.linkGoogle.mockResolvedValue(true)
  users.create.mockResolvedValue(21)
})
const expectTokens = (res, sub = 'sub-21') => {
  expect(res.statusCode).toBe(200)
  const body = parse(res)
  expect(verifyToken(body.idToken, { now: NOW })).toMatchObject({ sub, groups: ['learner'] })
  expect(body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
}
describe('M-H15 auth Googleでログイン（A-38・A-39）', () => {
  it('MT-H15-19 A-38 クライアントIDを返す（なければ null）', async () => {
    expect(parse(await call('GET', '/api/auth/google/config'))).toEqual({ clientId: 'client-123' })
    delete process.env.GOOGLE_CLIENT_ID
    expect(parse(await call('GET', '/api/auth/google/config'))).toEqual({ clientId: null })
    expect((await login()).statusCode).toBe(404)
  })
  it('MT-H15-20 結びついた利用者ならそのままログイン', async () => {
    auth.findByGoogleSub.mockResolvedValue(user({ authSub: 'sub-9' }))
    expectTokens(await login(), 'sub-9')
    expect(verifyGoogleIdToken).toHaveBeenCalledWith('google-id-token', { clientId: 'client-123', now: NOW })
    expect(auth.findByEmail).not.toHaveBeenCalled()
    expect(users.create).not.toHaveBeenCalled()
    expect(JSON.stringify(log.lines)).not.toContain('google-id-token')
  })
  it('MT-H15-21 同じメールアドレスの利用者に結びつける', async () => {
    auth.findByEmail.mockResolvedValue(user())
    expectTokens(await login())
    expect(auth.linkGoogle).toHaveBeenCalledWith(21, 'g-100')
    expect(users.create).not.toHaveBeenCalled()
    auth.linkGoogle.mockResolvedValue(false)
    expect(parse(await login()).error.code).toBe('CONFLICT')
    auth.findByEmail.mockResolvedValue(user({ status: 'deleted' }))
    expect(parse(await login()).error.code).toBe('LOGIN_FAILED')
  })
  it('MT-H15-22 初めての人は学習者として登録する', async () => {
    expectTokens(await login())
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'hanako@gmail.com', fullName: '山田 花子', roles: ['learner'] }), expect.anything())
    expect(auth.setGoogleOnly).toHaveBeenCalledWith(21, 'g-100', expect.anything())
    expect(db.commits()).toBe(1)
  })
  it('MT-H15-23 検証用アドレスは同じメールの利用者がいても別に登録する', async () => {
    verifyGoogleIdToken.mockResolvedValue(claims({ email: 'PocariAlice7148@gmail.com' }))
    auth.findByEmail.mockResolvedValue(user({ userId: 1 }))
    expectTokens(await login())
    expect(auth.findByEmail).not.toHaveBeenCalled()
    expect(auth.linkGoogle).not.toHaveBeenCalled()
    expect(users.create).toHaveBeenCalledTimes(1)
  })
  it('MT-H15-24 同時に登録したとき（一意制約）は先の利用者を使う', async () => {
    users.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }))
    auth.findByGoogleSub.mockResolvedValueOnce(null).mockResolvedValueOnce(user({ authSub: 'sub-7' }))
    expectTokens(await login(), 'sub-7')
    expect(db.rollbacks()).toBe(1)
    auth.findByGoogleSub.mockResolvedValue(null)
    expect(parse(await login()).error.code).toBe('CONFLICT')
    users.create.mockRejectedValue(new Error('boom'))
    expect((await login()).statusCode).toBe(500)
  })
  it('MT-H15-25 ID トークンが正しくない・削除予定の利用者は失敗', async () => {
    verifyGoogleIdToken.mockResolvedValue(null)
    const res = await login()
    expect(res.statusCode).toBe(401)
    expect(parse(res).error).toEqual({ code: 'LOGIN_FAILED', message: 'Googleでログインできませんでした。もう一度お試しください' })
    expect(parse(await call('POST', '/api/auth/google', {})).error.code).toBe('LOGIN_FAILED')
    verifyGoogleIdToken.mockResolvedValue(claims())
    auth.findByGoogleSub.mockResolvedValue(user({ status: 'deleted' }))
    expect(parse(await login()).error.code).toBe('LOGIN_FAILED')
  })
  it('MT-H15-26 氏名は Google の名前、なければメールの @ より前（50文字まで）', () => {
    expect(fullNameFrom({ name: ' 花子 ', email: 'a@b.jp' })).toBe('花子')
    expect(fullNameFrom({ name: '', email: 'hanako@gmail.com' })).toBe('hanako')
    expect(fullNameFrom({ email: '@x' })).toBe('ゲスト')
    expect([...fullNameFrom({ name: '𠮷'.repeat(60), email: 'a@b' })]).toHaveLength(50)
  })
})
