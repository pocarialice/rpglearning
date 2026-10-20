import { describe, it, expect, vi } from 'vitest'
import { getAuth, requireRole, loadUser, assertCourseAdmin } from '../../../../../functions/shared/util/authz.js'
const ev = (claims) => ({ requestContext: { authorizer: { jwt: { claims } } } })
const db = (user, isAdmin = false) => ({
  users: { findBySub: vi.fn(async () => user), activate: vi.fn(async () => true) },
  courses: { isAdmin: vi.fn(async () => isAdmin) }
})
describe('M-U04 authz', () => {
  it('MT-U04-01 グループ（文字列）', () => {
    expect(getAuth(ev({ sub: 's', 'cognito:groups': '[learner course_admin]' })).groups).toEqual(['learner', 'course_admin'])
  })
  it('MT-U04-02 グループ（配列）・なし', () => {
    expect(getAuth(ev({ sub: 's', 'cognito:groups': ['learner'] })).groups).toEqual(['learner'])
    expect(getAuth(ev({ sub: 's' })).groups).toEqual([])
  })
  it('MT-U04-03 sub がない', () => {
    expect(() => getAuth(ev({ 'cognito:groups': ['learner'] }))).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
    expect(() => getAuth({ requestContext: {} })).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
    expect(() => getAuth(undefined)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
  })
  it('MT-U04-04 ロールあり', () => {
    expect(() => requireRole({ groups: ['learner'] }, 'learner')).not.toThrow()
    expect(() => requireRole({ roles: ['learner'] }, 'learner')).not.toThrow()
  })
  it('MT-U04-05 ロールなし', () => {
    expect(() => requireRole({ groups: ['learner'] }, 'course_admin', 'system_admin')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
    expect(() => requireRole(null, 'learner')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
  })
  it('MT-U04-06 招待中の初回ログイン', async () => {
    const d = db({ userId: 15, status: 'invited' })
    const u = await loadUser(d, { sub: 's', groups: ['learner'] })
    expect(d.users.activate).toHaveBeenCalledWith(15)
    expect(u.status).toBe('active')
    expect(u.roles).toEqual(['learner'])
  })
  it('MT-U04-07 論理削除中・未登録', async () => {
    await expect(loadUser(db({ userId: 15, status: 'deleted' }), { sub: 's', groups: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(loadUser(db(null), { sub: 's', groups: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('MT-U04-10 有効な利用者はそのまま返し、DBのロールを優先する', async () => {
    const d = db({ userId: 15, status: 'active', roles: ['learner', 'course_admin'] })
    const u = await loadUser(d, { sub: 's', groups: ['learner'] })
    expect(d.users.activate).not.toHaveBeenCalled()
    expect(u.roles).toEqual(['learner', 'course_admin'])
    const d2 = db({ userId: 16, status: 'active' })
    expect((await loadUser(d2, { sub: 's' })).roles).toEqual([])
  })
  it('MT-U04-08 担当コース', async () => {
    const admin = { userId: 2, roles: ['course_admin'] }
    const yes = db(null, true)
    await expect(assertCourseAdmin(yes, admin, 3)).resolves.toBeUndefined()
    expect(yes.courses.isAdmin).toHaveBeenCalledWith(3, 2)
    await expect(assertCourseAdmin(db(null, false), admin, 3)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(assertCourseAdmin(db(null, true), { userId: 15, roles: ['learner'] }, 3)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(assertCourseAdmin(db(null, true), {}, 3)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('MT-U04-09 システム管理者は全コース', async () => {
    const d = db(null, false)
    await expect(assertCourseAdmin(d, { userId: 1, roles: ['system_admin'] }, 3)).resolves.toBeUndefined()
    expect(d.courses.isAdmin).not.toHaveBeenCalled()
  })
})
