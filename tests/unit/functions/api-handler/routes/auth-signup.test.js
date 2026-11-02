import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../../../../functions/shared/db/repositories/auth.js', async (orig) => ({ ...(await orig()), ...Object.fromEntries(
  ['findByEmail', 'setPassword', 'saveRefreshToken', 'recentSignupExists', 'saveSignup', 'consumeSignup'].map((n) => [n, vi.fn()])) }))
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/audit.js')
import * as auth from '../../../../../functions/shared/db/repositories/auth.js'
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as audit from '../../../../../functions/shared/db/repositories/audit.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { SIGNUP_HOURS, SIGNUP_INTERVAL_SECONDS } from '../../../../../functions/api-handler/routes/auth.js'
import { verifyPassword } from '../../../../../functions/shared/auth/password.js'
import { verifyToken, sha256 } from '../../../../../functions/shared/auth/token.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { dbMock, mailMock, pgError } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
const db = dbMock()
const mail = mailMock()
let log
const post = (path, body) => main(httpEvent({ method: 'POST', path: `/api/auth/${path}`, body, auth: false }), { log, now: NOW })
const input = (patch = {}) => ({ email: ' hana@example.co.jp ', fullName: ' 山田 花子 ', password: 'Guild2026', ...patch })
beforeEach(() => {
  log = memoryLogger()
  db.reset()
  mail.reset()
  vi.clearAllMocks()
  for (const fn of Object.values(auth)) if (vi.isMockFunction(fn)) fn.mockReset()
  auth.findByEmail.mockResolvedValue(null)
  auth.recentSignupExists.mockResolvedValue(false)
  users.create.mockResolvedValue(42)
})
describe('M-H15 auth のアカウント作成（A-36・A-37）', () => {
  it('MT-H15-13 アカウント作成の受付（A-36）で確認メールを送る', async () => {
    const res = await post('signup', input())
    expect(res.statusCode).toBe(202)
    expect(parse(res)).toEqual({ status: 'accepted' })
    expect(auth.recentSignupExists).toHaveBeenCalledWith('hana@example.co.jp', SIGNUP_INTERVAL_SECONDS)
    expect(mail.sent()).toHaveLength(1)
    const m = mail.sent()[0]
    expect(m.to).toBe('hana@example.co.jp')
    expect(m.text).toContain('山田 花子さん')
    const token = decodeURIComponent(/signup\?token=(\S+)/.exec(m.text)[1])
    const saved = auth.saveSignup.mock.calls[0][0]
    expect(saved).toMatchObject({ tokenHash: sha256(token), email: 'hana@example.co.jp', fullName: '山田 花子', hours: SIGNUP_HOURS })
    // パスワードはハッシュだけを置き、ログにも出さない
    expect(await verifyPassword('Guild2026', saved.passwordHash)).toBe(true)
    expect(JSON.stringify(log.lines)).not.toContain('Guild2026')
    expect(JSON.stringify(log.lines)).not.toContain('hana@example.co.jp')
  })
  it('MT-H15-14 登録済みのメールアドレスは同じ応答で、案内のメールだけを送る', async () => {
    auth.findByEmail.mockResolvedValue({ userId: 15, email: 'hana@example.co.jp', status: 'active' })
    const res = await post('signup', input())
    expect(res.statusCode).toBe(202)
    expect(parse(res)).toEqual({ status: 'accepted' })
    expect(auth.saveSignup.mock.calls[0][0].passwordHash).toBeNull()
    expect(mail.sent()[0].subject).toContain('アカウント作成の受付')
    expect(mail.sent()[0].text).not.toContain('token=')
    expect(mail.sent()[0].text).toContain('パスワードを忘れたとき')
  })
  it('MT-H15-15 連打・メールを送れないときも同じ応答', async () => {
    auth.recentSignupExists.mockResolvedValue(true)
    expect((await post('signup', input())).statusCode).toBe(202)
    expect(auth.saveSignup).not.toHaveBeenCalled()
    expect(mail.sent()).toHaveLength(0)
    auth.recentSignupExists.mockResolvedValue(false)
    mail.fail(1)
    expect((await post('signup', input())).statusCode).toBe(202)
    expect(log.lines.some((l) => l.msg === 'auth.signup_mail_failed')).toBe(true)
  })
  it('MT-H15-16 入力の誤り', async () => {
    for (const [patch, field] of [[{ email: 'x' }, 'email'], [{ email: `${'a'.repeat(250)}@x.jp` }, 'email'], [{ email: 1 }, 'email'],
      [{ fullName: '  ' }, 'fullName'], [{ fullName: 'あ'.repeat(51) }, 'fullName'], [{ password: 'guild' }, 'password']]) {
      const res = await post('signup', input(patch))
      expect(res.statusCode).toBe(400)
      expect(parse(res).error.details[0].field).toBe(field)
    }
    expect(auth.saveSignup).not.toHaveBeenCalled()
  })
  it('MT-H15-17 確認リンク（A-37）で学習者として登録し、ログインした状態にする', async () => {
    auth.consumeSignup.mockResolvedValue({ email: 'hana@example.co.jp', fullName: '山田 花子', passwordHash: 'scrypt$x' })
    const res = await post('signup/verify', { token: 't+1' })
    expect(res.statusCode).toBe(201)
    expect(auth.consumeSignup).toHaveBeenCalledWith(sha256('t+1'))
    const created = users.create.mock.calls[0][0]
    expect(created).toMatchObject({ email: 'hana@example.co.jp', fullName: '山田 花子', roles: ['learner'] })
    expect(auth.setPassword.mock.calls[0].slice(0, 3)).toEqual([42, 'scrypt$x', { mustChange: false }])
    expect(audit.write.mock.calls[0].slice(0, 3)).toEqual([42, 'user.signup', { type: 'user', id: 42 }])
    expect(db.commits()).toBe(1)
    const body = parse(res)
    expect(verifyToken(body.idToken, { now: NOW })).toMatchObject({ sub: created.sub, groups: ['learner'] })
    expect(auth.saveRefreshToken).toHaveBeenCalledWith(sha256(body.refreshToken), 42, 7)
  })
  it('MT-H15-18 確認リンクを受け付けない・登録済み', async () => {
    auth.consumeSignup.mockResolvedValue(null)
    const used = await post('signup/verify', { token: 'old' })
    expect(used.statusCode).toBe(400)
    expect(parse(used).error.details).toEqual([{ field: 'token', code: 'INVALID' }])
    expect((await post('signup/verify', {})).statusCode).toBe(400)
    expect(users.create).not.toHaveBeenCalled()
    auth.consumeSignup.mockResolvedValue({ email: 'hana@example.co.jp', fullName: '山田 花子', passwordHash: 'scrypt$x' })
    users.create.mockRejectedValueOnce(pgError('23505'))
    const dup = await post('signup/verify', { token: 't' })
    expect(dup.statusCode).toBe(409)
    expect(parse(dup).error.code).toBe('CONFLICT')
    expect(db.rollbacks()).toBe(1)
    expect(auth.saveRefreshToken).not.toHaveBeenCalled()
  })
})
