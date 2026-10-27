import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
vi.mock('../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../functions/api-handler/routes/home.js')
vi.mock('../../../../functions/api-handler/routes/gradings.js')
import * as users from '../../../../functions/shared/db/repositories/users.js'
import * as courses from '../../../../functions/shared/db/repositories/courses.js'
import * as home from '../../../../functions/api-handler/routes/home.js'
import * as gradings from '../../../../functions/api-handler/routes/gradings.js'
import { main, handler } from '../../../../functions/api-handler/index.mjs'
import { match } from '../../../../functions/api-handler/router.js'
import { httpEvent, parse } from '../../../fixtures/events/http.js'
import { memoryLogger } from '../../../helpers/logger.js'
import { rdsMock, awsError } from '../../../helpers/aws-mocks.js'
import { NOW } from '../../../helpers/clock.js'
import { learner, systemAdmin } from '../../../fixtures/users.js'
import { ok } from '../../../../functions/shared/util/http.js'
const rds = rdsMock()
let log
const call = (opts) => main(httpEvent(opts), { log, now: NOW })
describe('M-H01 router・入口', () => {
  beforeEach(() => {
    log = memoryLogger()
    rds.reset()
    users.findBySub.mockResolvedValue({ ...learner })
    home.get.mockResolvedValue(ok({ page: 'home' }))
    gradings.get.mockImplementation(async (ctx) => ok({ id: ctx.params.id }))
  })
  it('MT-H01-01 ルートの一致', async () => {
    const res = await call({ path: '/api/home' })
    expect(res.statusCode).toBe(200)
    expect(home.get).toHaveBeenCalledTimes(1)
    expect(home.get.mock.calls[0][0]).toMatchObject({ user: { userId: 15 }, today: '2026-10-20', weekStart: '2026-10-19' })
  })
  it('MT-H01-02 パスのパラメータ', async () => {
    const res = await call({ path: '/api/gradings/gr_456' })
    expect(gradings.get.mock.calls[0][0].params).toEqual({ id: 'gr_456' })
    expect(parse(res)).toEqual({ id: 'gr_456' })
  })
  it('MT-H01-03 ルートがない', async () => {
    const res = await call({ path: '/api/unknown' })
    expect(res.statusCode).toBe(404)
    expect(parse(res).error.code).toBe('NOT_FOUND')
    expect(users.findBySub).not.toHaveBeenCalled()
  })
  it('MT-H01-04 メソッド違い', async () => {
    const res = await call({ method: 'DELETE', path: '/api/home' })
    expect(res.statusCode).toBe(404)
    expect(home.get).not.toHaveBeenCalled()
  })
  it('MT-H01-05 ヘルスチェック', async () => {
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[{"ok":1}]' })
    const okRes = await call({ path: '/api/health', auth: false })
    expect(okRes.statusCode).toBe(200)
    expect(parse(okRes)).toEqual({ status: 'ok' })
    rds.on(ExecuteStatementCommand).rejects(awsError('DatabaseResumingException'))
    const resuming = await call({ path: '/api/health', auth: false })
    expect(resuming.statusCode).toBe(503)
    expect(parse(resuming).error.code).toBe('DB_RESUMING')
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(2)
  })
  it('MT-H01-06 ロール不足', async () => {
    const res = await call({ path: '/api/admin/dashboard', query: { course: 'c_3' }, groups: ['learner'] })
    expect(res.statusCode).toBe(403)
    expect(parse(res).error.code).toBe('FORBIDDEN')
    expect(users.findBySub).not.toHaveBeenCalled()
  })
  it('MT-H01-07 上位ロール', async () => {
    users.findBySub.mockResolvedValue({ ...systemAdmin, nickname: null, fullName: '管理' })
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[]' })
    courses.dashboardRows.mockResolvedValue([])
    const res = await call({ path: '/api/admin/dashboard', query: { course: 'c_3' }, groups: ['system_admin', 'learner'], sub: 'sub-1' })
    expect(res.statusCode).toBe(200)
    expect(courses.isAdmin).not.toHaveBeenCalled()
  })
  it('MT-H01-08 想定外の例外', async () => {
    home.get.mockRejectedValue(new TypeError('x is undefined'))
    const res = await call({ path: '/api/home' })
    expect(res.statusCode).toBe(500)
    expect(parse(res).error.code).toBe('INTERNAL_ERROR')
    expect(res.body).not.toContain('x is undefined')
    const err = log.lines.find((l) => l.level === 'ERROR')
    expect(err).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
    expect(err.err.stack).toContain('TypeError: x is undefined')
  })
  it('MT-H01-09 初回の流れが終わっていない', async () => {
    users.findBySub.mockResolvedValue({ ...learner, nickname: null })
    const res = await call({ path: '/api/home' })
    expect(res.statusCode).toBe(409)
    expect(parse(res).error.code).toBe('ONBOARDING_REQUIRED')
    expect(home.get).not.toHaveBeenCalled()
  })
  it('MT-H01-10 コースが未選択（COURSE_REQUIRED）', async () => {
    users.findBySub.mockResolvedValue({ ...learner, currentCourseId: null })
    const res = await call({ path: '/api/home' })
    expect(res.statusCode).toBe(409)
    expect(parse(res).error.code).toBe('COURSE_REQUIRED')
  })
  it('MT-H01-11 トークンがない・壊れた本文', async () => {
    expect((await call({ path: '/api/home', auth: false })).statusCode).toBe(401)
    const bad = await main({ ...httpEvent({ method: 'PUT', path: '/api/me/profile' }), body: '{x' }, { log, now: NOW })
    expect(bad.statusCode).toBe(400)
    expect(match('GET', '/api/admin/dashboard.csv').route.path).toBe('/api/admin/dashboard.csv')
    expect(match('GET', '/api/admin/dashboardXcsv')).toBeNull()
  })
  it('MT-H01-12 Lambda の入口（handler）', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await handler(httpEvent({ path: '/api/unknown' }), { awsRequestId: 'r-1' })
    expect(res.statusCode).toBe(404)
    const lines = spy.mock.calls.map((c) => JSON.parse(c[0]))
    expect(lines.some((l) => l.fn === 'api-handler' && l.requestId === 'r-1' && typeof l.durationMs === 'number')).toBe(true)
    const noCtx = await main({}, { log })
    expect(noCtx.statusCode).toBe(404)
  })
})
