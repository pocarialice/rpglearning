import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../../functions/shared/db/repositories/audit.js')
vi.mock('../../../../../functions/shared/db/repositories/auth.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as courses from '../../../../../functions/shared/db/repositories/courses.js'
import * as audit from '../../../../../functions/shared/db/repositories/audit.js'
import * as auth from '../../../../../functions/shared/db/repositories/auth.js'
import { verifyPassword } from '../../../../../functions/shared/auth/password.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { csvCell } from '../../../../../functions/api-handler/routes/admin-dashboard.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { dbMock, mailMock, pgError } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
import { courseAdmin, systemAdmin } from '../../../../fixtures/users.js'
const db = dbMock()
const mail = mailMock()
const row = (i, patch = {}) => ({
  userId: 100 + i, fullName: `受講者${i}`, nickname: `n${i}`, email: `u${i}@example.co.jp`, enrolledOn: '2026-10-01',
  level: 2, totalExp: 150, lastLoginAt: '2026-10-19 23:30:00', coveragePct: '50.0', correctPct: '70.0', mastered: 3, logins7d: 2, ...patch
})
describe('M-H11 admin-dashboard（A-17・A-18）', () => {
  const call = (opts) => main(httpEvent({ groups: ['course_admin'], sub: 'sub-2', ...opts }), { log: memoryLogger(), now: NOW })
  beforeEach(() => {
    users.findBySub.mockResolvedValue({ ...courseAdmin })
    courses.isAdmin.mockImplementation(async (c) => c === 3)
  })
  it('MT-H11-01 集計', async () => {
    courses.dashboardRows.mockResolvedValue([
      row(1, { logins7d: 3, coveragePct: '50.0' }), row(2, { logins7d: 2, coveragePct: '40.0' }),
      row(3, { logins7d: 1, coveragePct: '30.0' }), row(4, { logins7d: 0, coveragePct: '0.0', correctPct: null, lastLoginAt: null })
    ])
    const body = parse(await call({ path: '/api/admin/dashboard', query: { course: 'c_3' } }))
    expect(body.summary).toEqual({ learners: 4, activeRate: 50.0, avgCoveragePct: 30.0, avgCorrectPct: 70.0 })
    expect(body.learners[0]).toMatchObject({ userId: 'u_101', coveragePct: 50, lastLoginAt: '2026-10-20T08:30:00+09:00' })
    expect(body.learners[3].lastLoginAt).toBeNull()
  })
  it('MT-H11-02 受講者0名', async () => {
    courses.dashboardRows.mockResolvedValue([])
    const body = parse(await call({ path: '/api/admin/dashboard', query: { course: 'c_3' } }))
    expect(body.summary).toEqual({ learners: 0, activeRate: null, avgCoveragePct: null, avgCorrectPct: null })
  })
  it('MT-H11-03 CSVの形', async () => {
    courses.dashboardRows.mockResolvedValue([row(1), row(2, { lastLoginAt: null, correctPct: null })])
    const res = await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_3' } })
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(res.body.startsWith('﻿')).toBe(true)
    const lines = res.body.slice(1).split('\r\n')
    expect(lines).toHaveLength(3)
    expect(res.body.replace(/\r\n/g, '')).not.toContain('\n')
    expect(lines[0]).toBe('氏名,ニックネーム,メールアドレス,受講開始日,網羅率(%),正答率(%),習得済み問題数,レベル,累計EXP,最終ログイン日時,直近7日のログイン回数')
    expect(lines[1]).toBe('受講者1,n1,u1@example.co.jp,2026-10-01,50,70,3,2,150,2026-10-20 08:30,2')
    expect(lines[2]).toBe('受講者2,n2,u2@example.co.jp,2026-10-01,50,,3,2,150,,2')
  })
  it('MT-H11-04 CSVの囲み', async () => {
    courses.dashboardRows.mockResolvedValue([row(1, { fullName: '山田, 太郎', nickname: 'た"ろう"', email: '改行\nあり' })])
    const res = await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_3' } })
    expect(res.body).toContain('"山田, 太郎","た""ろう""","改行\nあり"')
  })
  it('MT-H11-05 CSVの数式対策', async () => {
    expect(['=SUM(1)', '+1', '-1', '@x'].map(csvCell)).toEqual(["'=SUM(1)", "'+1", "'-1", "'@x"])
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`)
    expect(csvCell(-1)).toBe('-1')
    courses.dashboardRows.mockResolvedValue([row(1, { nickname: '=SUM(1)' })])
    const res = await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_3' } })
    expect(res.body).toContain(",'=SUM(1),")
  })
  it('MT-H11-06 CSVのファイル名と記録', async () => {
    courses.dashboardRows.mockResolvedValue([row(1)])
    const res = await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_3' } })
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="dashboard_c_3_20261020.csv"')
    expect(audit.write).toHaveBeenCalledWith(2, 'dashboard.csv', { type: 'course', id: 3 }, { rows: 1 })
  })
  it('MT-H11-07 1,000件ずつの取得', async () => {
    const all = Array.from({ length: 1500 }, (_, i) => row(i))
    courses.dashboardRows.mockImplementation(async (c, { limit, offset }) => all.slice(offset, offset + limit))
    const res = await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_3' } })
    expect(courses.dashboardRows.mock.calls.map((c) => c[1])).toEqual([{ limit: 1000, offset: 0 }, { limit: 1000, offset: 1000 }])
    expect(res.body.slice(1).split('\r\n')).toHaveLength(1501)
  })
  it('MT-H11-08 担当外のコース', async () => {
    expect((await call({ path: '/api/admin/dashboard', query: { course: 'c_4' } })).statusCode).toBe(403)
    expect((await call({ path: '/api/admin/dashboard.csv', query: { course: 'c_4' } })).statusCode).toBe(403)
    expect(audit.write).not.toHaveBeenCalled()
  })
})
describe('M-H12 admin-users（A-19・A-20・A-21b）', () => {
  let log
  const call = (opts) => main(httpEvent({ groups: ['system_admin', 'learner'], sub: 'sub-1', ...opts }), { log, now: NOW })
  const target = (patch = {}) => ({ userId: 15, authSub: 'sub-15', email: 'taro@example.co.jp', fullName: '山田太郎', nickname: 'たろう', roles: ['learner'], status: 'active', ...patch })
  const tempPasswordIn = (m) => /仮パスワード：(\S+)/.exec(m.text)?.[1]
  beforeEach(() => {
    log = memoryLogger()
    db.reset()
    mail.reset()
    users.findBySub.mockResolvedValue({ ...systemAdmin })
    users.findById.mockImplementation(async (id) => (id === 1 ? { ...systemAdmin, authSub: 'sub-1', status: 'active' } : id === 15 ? target() : null))
    users.create.mockResolvedValue(20)
    users.markDeleted.mockResolvedValue(true)
    users.restore.mockResolvedValue(true)
  })
  it('MT-H12-01 登録（仮パスワードを作って招待メールを送る）', async () => {
    const res = await call({ method: 'POST', path: '/api/admin/users', body: { email: 'new@example.co.jp', fullName: '新人', roles: ['learner'] } })
    expect(res.statusCode).toBe(201)
    expect(parse(res)).toEqual({ id: 'u_20', status: 'invited' })
    const arg = users.create.mock.calls[0][0]
    expect(arg).toMatchObject({ email: 'new@example.co.jp', fullName: '新人', roles: ['learner'] })
    expect(arg.sub).toMatch(/^[0-9a-f-]{36}$/)
    // 招待メールの仮パスワードと、保存したハッシュが合う
    const [userId, hash, opts] = auth.setPassword.mock.calls[0]
    expect(userId).toBe(20)
    expect(opts).toEqual({ mustChange: true, tempValidDays: 7 })
    expect(mail.sent()).toHaveLength(1)
    expect(mail.sent()[0]).toMatchObject({ to: 'new@example.co.jp', subject: '【RPG学習アプリ】ギルドへの招待' })
    expect(await verifyPassword(tempPasswordIn(mail.sent()[0]), hash)).toBe(true)
    expect(db.commits()).toBe(1)
    expect(audit.write.mock.calls[0].slice(0, 4)).toEqual([1, 'user.create', { type: 'user', id: 20 }, { roles: ['learner'] }])
    expect(JSON.stringify(audit.write.mock.calls[0][3])).not.toContain('new@example.co.jp')
    expect(JSON.stringify(log.lines)).not.toContain(tempPasswordIn(mail.sent()[0]))
  })
  it('MT-H12-02 登録の失敗（重複・メールを送れない）', async () => {
    users.create.mockRejectedValueOnce(pgError('23505'))
    const dup = await call({ method: 'POST', path: '/api/admin/users', body: { email: 'taro@example.co.jp', fullName: '山田', roles: ['learner'] } })
    expect(dup.statusCode).toBe(409)
    expect(parse(dup).error.details).toEqual([{ field: 'email' }])
    expect(mail.sent()).toHaveLength(0)
    mail.fail(1)
    const res = await call({ method: 'POST', path: '/api/admin/users', body: { email: 'x@example.co.jp', fullName: '山田', roles: ['learner'] } })
    expect(res.statusCode).toBe(500)
    expect(parse(res).error.message).toBe('招待メールを送れませんでした。メールの設定を確認してください')
    // メールを送れなかったら登録ごと取り消す
    expect(db.rollbacks()).toBe(2)
    users.create.mockRejectedValueOnce(new Error('db down'))
    expect((await call({ method: 'POST', path: '/api/admin/users', body: { email: 'y@example.co.jp', fullName: '山田', roles: ['learner'] } })).statusCode).toBe(500)
  })
  it('MT-H12-03 ロールの変更', async () => {
    const res = await call({ method: 'PUT', path: '/api/admin/users/u_15', body: { roles: ['learner', 'course_admin'] } })
    expect(res.statusCode).toBe(200)
    expect(users.setRoles).toHaveBeenCalledWith(15, ['learner', 'course_admin'], expect.anything())
    expect(audit.write.mock.calls[0][1]).toBe('user.role')
    expect(audit.write.mock.calls[0][3]).toEqual({ added: ['course_admin'], removed: [] })
  })
  it('MT-H12-04 自分の system_admin を外す', async () => {
    const res = await call({ method: 'PUT', path: '/api/admin/users/u_1', body: { roles: ['learner'] } })
    expect(res.statusCode).toBe(409)
    expect(users.setRoles).not.toHaveBeenCalled()
  })
  it('MT-H12-05 論理削除（ログイン中の端末のトークンも無効にする）', async () => {
    const res = await call({ method: 'POST', path: '/api/admin/users/u_15/delete' })
    expect(parse(res)).toEqual({ id: 'u_15', status: 'deleted', deleteScheduledOn: '2026-11-19' })
    expect(users.markDeleted).toHaveBeenCalledWith(15, '2026-11-19', expect.anything())
    expect(auth.revokeAllForUser).toHaveBeenCalledWith(15, expect.anything())
    expect(mail.sent()[0].to).toBe('taro@example.co.jp')
    expect(mail.sent()[0].text).toContain('2026年11月19日')
    expect(audit.write.mock.calls[0][1]).toBe('user.delete')
  })
  it('MT-H12-06 自分自身の削除', async () => {
    expect((await call({ method: 'POST', path: '/api/admin/users/u_1/delete' })).statusCode).toBe(409)
    expect(users.markDeleted).not.toHaveBeenCalled()
  })
  it('MT-H12-07 復活', async () => {
    users.findById.mockResolvedValue(target({ status: 'deleted', deleteScheduledOn: '2026-11-19' }))
    const res = await call({ method: 'POST', path: '/api/admin/users/u_15/restore' })
    expect(parse(res)).toEqual({ id: 'u_15', status: 'active' })
    expect(users.restore).toHaveBeenCalledWith(15, expect.anything())
    expect(audit.write.mock.calls[0][1]).toBe('user.restore')
  })
  it('MT-H12-08 有効な利用者の復活', async () => {
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/restore' })).statusCode).toBe(409)
    expect(users.restore).not.toHaveBeenCalled()
  })
  it('MT-H12-09 入力の検証・削除済みの削除・状態の食い違い・メールの失敗・ロールを外す・一覧', async () => {
    for (const body of [{ email: 'x', fullName: 'a', roles: ['learner'] }, { email: 'a@b.jp', fullName: '', roles: ['learner'] }, { email: 'a@b.jp', fullName: 'a', roles: ['boss'] }, { email: 'a@b.jp', fullName: 'a', roles: [] }]) {
      expect((await call({ method: 'POST', path: '/api/admin/users', body })).statusCode).toBe(400)
    }
    expect((await call({ method: 'PUT', path: '/api/admin/users/u_99', body: { roles: ['learner'] } })).statusCode).toBe(404)
    users.findById.mockResolvedValue(target({ status: 'deleted' }))
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/delete' })).statusCode).toBe(409)
    users.findById.mockResolvedValue(target())
    users.markDeleted.mockResolvedValue(false)
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/delete' })).statusCode).toBe(409)
    users.markDeleted.mockResolvedValue(true)
    mail.fail(1)
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/delete' })).statusCode).toBe(200)
    expect(log.lines.some((l) => l.msg === 'deletion_mail.failed')).toBe(true)
    users.findById.mockResolvedValue(target({ status: 'deleted' }))
    users.restore.mockResolvedValue(false)
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/restore' })).statusCode).toBe(409)
    users.findById.mockResolvedValue(target({ roles: ['learner', 'course_admin'] }))
    await call({ method: 'PUT', path: '/api/admin/users/u_15', body: { roles: ['learner'] } })
    expect(audit.write.mock.calls.at(-1)[3]).toEqual({ added: [], removed: ['course_admin'] })
    users.listForAdmin.mockResolvedValue([target()])
    const list = parse(await call({ path: '/api/admin/users', query: { q: 'たろう', limit: '500', offset: '-1' } })).users
    expect(users.listForAdmin).toHaveBeenCalledWith({ q: 'たろう', status: null, sort: 'id', order: 'asc', limit: 200, offset: 0 })
    expect(list[0]).toMatchObject({ id: 'u_15', roles: ['learner'], deleteScheduledOn: null })
    await call({ path: '/api/admin/users' })
    expect(users.listForAdmin).toHaveBeenLastCalledWith({ q: '', status: null, sort: 'id', order: 'asc', limit: 50, offset: 0 })
  })
  it('MT-H12-11 再招待（A-21b）', async () => {
    users.findById.mockResolvedValue(target({ status: 'invited', nickname: null }))
    const res = await call({ method: 'POST', path: '/api/admin/users/u_15/reinvite' })
    expect(res.statusCode).toBe(200)
    expect(parse(res)).toEqual({ id: 'u_15', status: 'invited' })
    const [, hash, opts] = auth.setPassword.mock.calls[0]
    expect(opts).toEqual({ mustChange: true, tempValidDays: 7 })
    expect(await verifyPassword(tempPasswordIn(mail.sent()[0]), hash)).toBe(true)
    expect(audit.write.mock.calls[0][1]).toBe('user.reinvite')
    users.findById.mockResolvedValue(target())
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/reinvite' })).statusCode).toBe(409)
    users.findById.mockResolvedValue(target({ status: 'invited' }))
    mail.fail(1)
    expect((await call({ method: 'POST', path: '/api/admin/users/u_15/reinvite' })).statusCode).toBe(500)
    expect(db.rollbacks()).toBe(1)
  })
  it('MT-H12-10 一覧の最終ログイン日時は +09:00 付き', async () => {
    users.listForAdmin.mockResolvedValue([target({ lastLoginAt: '2026-10-19 15:00:00' }), target({ userId: 16, lastLoginAt: null })])
    const list = parse(await call({ path: '/api/admin/users' })).users
    expect(list.map((u) => u.lastLoginAt)).toEqual(['2026-10-20T00:00:00+09:00', null])
  })
})
