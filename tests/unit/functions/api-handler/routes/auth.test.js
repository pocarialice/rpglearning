import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
vi.mock('../../../../../functions/shared/db/repositories/auth.js', async (orig) => ({ ...(await orig()), ...Object.fromEntries(
  ['findByEmail', 'findById', 'recordFailure', 'recordSuccess', 'setPassword', 'tempPasswordExpired', 'saveRefreshToken', 'consumeRefreshToken',
    'revokeRefreshToken', 'revokeAllForUser', 'recentResetExists', 'saveReset', 'consumeReset'].map((n) => [n, vi.fn()])) }))
import * as auth from '../../../../../functions/shared/db/repositories/auth.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { hashPassword, verifyPassword } from '../../../../../functions/shared/auth/password.js'
import { verifyToken, signToken, sha256 } from '../../../../../functions/shared/auth/token.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { mailMock } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
const mail = mailMock()
let log, hash
const post = (path, body) => main(httpEvent({ method: 'POST', path: `/api/auth/${path}`, body, auth: false }), { log, now: NOW })
const user = (patch = {}) => ({ userId: 15, authSub: 'sub-15', email: 'taro@example.co.jp', status: 'active', passwordHash: hash, mustChangePassword: false, locked: false, roles: ['learner'], ...patch })
beforeAll(async () => { hash = await hashPassword('Guild2026') })
beforeEach(() => {
  log = memoryLogger()
  mail.reset()
  for (const fn of Object.values(auth)) if (vi.isMockFunction(fn)) fn.mockReset()
  auth.findByEmail.mockImplementation(async (email) => (email.toLowerCase() === 'taro@example.co.jp' ? user() : null))
  auth.findById.mockResolvedValue(user())
  auth.tempPasswordExpired.mockResolvedValue(false)
  auth.recentResetExists.mockResolvedValue(false)
})
describe('M-H15 auth（A-30〜A-35）', () => {
  it('MT-H15-01 ログイン（A-30）でトークンを出す', async () => {
    const res = await post('login', { email: ' TARO@example.co.jp ', password: 'Guild2026' })
    expect(res.statusCode).toBe(200)
    const body = parse(res)
    expect(body.expiresIn).toBe(3600)
    expect(verifyToken(body.idToken, { now: NOW })).toMatchObject({ sub: 'sub-15', groups: ['learner'] })
    expect(body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // DB にはリフレッシュトークンのハッシュだけを置く
    expect(auth.saveRefreshToken).toHaveBeenCalledWith(sha256(body.refreshToken), 15, 7)
    expect(auth.recordSuccess).toHaveBeenCalledWith(15)
    expect(JSON.stringify(log.lines)).not.toContain('Guild2026')
  })
  it('MT-H15-02 失敗（同じ応答）と回数の記録', async () => {
    for (const body of [{ email: 'taro@example.co.jp', password: 'Wrong2026' }, { email: 'nobody@example.co.jp', password: 'Guild2026' }, {}, { email: 1, password: 2 }]) {
      const res = await post('login', body)
      expect(res.statusCode).toBe(401)
      expect(parse(res).error).toEqual({ code: 'LOGIN_FAILED', message: 'メールアドレスかパスワードが正しくありません' })
    }
    expect(auth.recordFailure).toHaveBeenCalledTimes(1)
    expect(auth.saveRefreshToken).not.toHaveBeenCalled()
  })
  it('MT-H15-03 削除予定・パスワード未設定・ロック中', async () => {
    auth.findByEmail.mockResolvedValue(user({ status: 'deleted' }))
    expect(parse(await post('login', { email: 'taro@example.co.jp', password: 'Guild2026' })).error.code).toBe('LOGIN_FAILED')
    auth.findByEmail.mockResolvedValue(user({ passwordHash: null }))
    expect(parse(await post('login', { email: 'taro@example.co.jp', password: 'Guild2026' })).error.code).toBe('LOGIN_FAILED')
    auth.findByEmail.mockResolvedValue(user({ locked: true }))
    const locked = await post('login', { email: 'taro@example.co.jp', password: 'Guild2026' })
    expect(locked.statusCode).toBe(423)
    expect(parse(locked).error.code).toBe('ACCOUNT_LOCKED')
    expect(auth.recordSuccess).not.toHaveBeenCalled()
  })
  it('MT-H15-04 仮パスワードは新しいパスワードを求める', async () => {
    auth.findByEmail.mockResolvedValue(user({ mustChangePassword: true, status: 'invited' }))
    const res = await post('login', { email: 'taro@example.co.jp', password: 'Guild2026' })
    const body = parse(res)
    expect(body.challenge).toBe('NEW_PASSWORD_REQUIRED')
    expect(verifyToken(body.session, { now: NOW, purpose: 'new_password' })).toMatchObject({ sub: 'sub-15', uid: 15 })
    expect(verifyToken(body.session, { now: NOW })).toBeNull()
    expect(body.idToken).toBeUndefined()
    auth.tempPasswordExpired.mockResolvedValue(true)
    const expired = await post('login', { email: 'taro@example.co.jp', password: 'Guild2026' })
    expect(expired.statusCode).toBe(401)
    expect(parse(expired).error.code).toBe('PASSWORD_EXPIRED')
  })
  it('MT-H15-05 新しいパスワード（A-31）', async () => {
    auth.findById.mockResolvedValue(user({ mustChangePassword: true, status: 'invited' }))
    const session = signToken({ sub: 'sub-15', uid: 15, purpose: 'new_password' }, { now: NOW, ttlSeconds: 600 })
    const weak = await post('new-password', { session, newPassword: 'guild' })
    expect(weak.statusCode).toBe(400)
    expect(parse(weak).error.details.map((d) => d.code)).toEqual(['TOO_SHORT', 'NO_DIGIT', 'NO_UPPER'])
    const res = await post('new-password', { session, newPassword: 'Guild2027' })
    expect(res.statusCode).toBe(200)
    expect(parse(res).idToken).toBeDefined()
    const [userId, newHash, opts] = auth.setPassword.mock.calls[0]
    expect(userId).toBe(15)
    expect(opts).toEqual({ mustChange: false })
    expect(await verifyPassword('Guild2027', newHash)).toBe(true)
  })
  it('MT-H15-06 新しいパスワードを受け付けない', async () => {
    const session = signToken({ sub: 'sub-15', uid: 15, purpose: 'new_password' }, { now: NOW, ttlSeconds: 600 })
    expect((await post('new-password', { session: 'x', newPassword: 'Guild2027' })).statusCode).toBe(401)
    expect((await post('new-password', { session: signToken({ sub: 'sub-15', uid: 15 }, { now: NOW }), newPassword: 'Guild2027' })).statusCode).toBe(401)
    for (const u of [null, user({ authSub: 'other', mustChangePassword: true }), user({ status: 'deleted', mustChangePassword: true }), user({ mustChangePassword: false })]) {
      auth.findById.mockResolvedValue(u)
      expect((await post('new-password', { session, newPassword: 'Guild2027' })).statusCode).toBe(401)
    }
    expect(auth.setPassword).not.toHaveBeenCalled()
  })
  it('MT-H15-07 トークンの更新（A-32、使い捨て）', async () => {
    auth.consumeRefreshToken.mockResolvedValue(15)
    const res = await post('refresh', { refreshToken: 'old' })
    expect(res.statusCode).toBe(200)
    expect(auth.consumeRefreshToken).toHaveBeenCalledWith(sha256('old'))
    expect(parse(res).refreshToken).not.toBe('old')
    auth.consumeRefreshToken.mockResolvedValue(null)
    expect((await post('refresh', { refreshToken: 'used' })).statusCode).toBe(401)
    expect((await post('refresh', {})).statusCode).toBe(401)
    auth.consumeRefreshToken.mockResolvedValue(15)
    for (const u of [null, user({ status: 'deleted' }), user({ mustChangePassword: true })]) {
      auth.findById.mockResolvedValue(u)
      expect((await post('refresh', { refreshToken: 'r' })).statusCode).toBe(401)
    }
  })
  it('MT-H15-08 ログアウト（A-33）', async () => {
    const res = await post('logout', { refreshToken: 'r' })
    expect(res.statusCode).toBe(204)
    expect(auth.revokeRefreshToken).toHaveBeenCalledWith(sha256('r'))
    expect((await post('logout', {})).statusCode).toBe(204)
    expect(auth.revokeRefreshToken).toHaveBeenCalledTimes(1)
  })
  it('MT-H15-09 パスワードを忘れたとき（A-34）', async () => {
    const res = await post('forgot', { email: 'taro@example.co.jp' })
    expect(res.statusCode).toBe(202)
    expect(mail.sent()).toHaveLength(1)
    const token = decodeURIComponent(/token=(\S+)/.exec(mail.sent()[0].text)[1])
    expect(auth.saveReset).toHaveBeenCalledWith(sha256(token), 15, 60)
    // 登録の有無・連打・削除予定・パスワード未設定でも同じ応答
    for (const [setup, email] of [[() => {}, 'nobody@example.co.jp'], [() => auth.recentResetExists.mockResolvedValue(true), 'taro@example.co.jp'],
      [() => auth.findByEmail.mockResolvedValue(user({ status: 'deleted' })), 'taro@example.co.jp'], [() => auth.findByEmail.mockResolvedValue(user({ passwordHash: null })), 'taro@example.co.jp'], [() => {}, '']]) {
      setup()
      const r = await post('forgot', { email })
      expect(r.statusCode).toBe(202)
      expect(parse(r)).toEqual({ status: 'accepted' })
    }
    expect(mail.sent()).toHaveLength(1)
  })
  it('MT-H15-10 再設定メールを送れない', async () => {
    mail.fail(1)
    expect((await post('forgot', { email: 'taro@example.co.jp' })).statusCode).toBe(202)
    expect(log.lines.some((l) => l.msg === 'auth.reset_mail_failed')).toBe(true)
  })
  it('MT-H15-11 再設定（A-35）でほかの端末のログインも切る', async () => {
    auth.consumeReset.mockResolvedValue(15)
    const res = await post('reset', { token: 't', newPassword: 'Guild2028' })
    expect(res.statusCode).toBe(204)
    expect(auth.consumeReset).toHaveBeenCalledWith(sha256('t'))
    expect(auth.setPassword.mock.calls[0][2]).toEqual({ mustChange: false })
    expect(auth.revokeAllForUser).toHaveBeenCalledWith(15)
  })
  it('MT-H15-12 再設定を受け付けない', async () => {
    expect((await post('reset', { token: 't', newPassword: 'weak' })).statusCode).toBe(400)
    expect(auth.consumeReset).not.toHaveBeenCalled()
    auth.consumeReset.mockResolvedValue(null)
    const used = await post('reset', { token: 't', newPassword: 'Guild2028' })
    expect(used.statusCode).toBe(400)
    expect(parse(used).error.details).toEqual([{ field: 'token', code: 'INVALID' }])
    expect((await post('reset', { newPassword: 'Guild2028' })).statusCode).toBe(400)
    auth.consumeReset.mockResolvedValue(15)
    auth.findById.mockResolvedValue(user({ status: 'deleted' }))
    expect((await post('reset', { token: 't', newPassword: 'Guild2028' })).statusCode).toBe(400)
    expect(auth.setPassword).not.toHaveBeenCalled()
  })
})
