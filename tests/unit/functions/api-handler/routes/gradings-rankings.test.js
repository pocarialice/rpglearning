import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InvokeCommand } from '@aws-sdk/client-lambda'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/questions.js')
vi.mock('../../../../../functions/shared/db/repositories/gradings.js')
vi.mock('../../../../../functions/shared/db/repositories/adventures.js')
vi.mock('../../../../../functions/shared/db/repositories/enrollments.js')
vi.mock('../../../../../functions/shared/db/repositories/exp.js')
vi.mock('../../../../../functions/shared/db/repositories/rankings.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as questions from '../../../../../functions/shared/db/repositories/questions.js'
import * as gradings from '../../../../../functions/shared/db/repositories/gradings.js'
import * as adventures from '../../../../../functions/shared/db/repositories/adventures.js'
import * as enrollments from '../../../../../functions/shared/db/repositories/enrollments.js'
import * as exp from '../../../../../functions/shared/db/repositories/exp.js'
import * as rankings from '../../../../../functions/shared/db/repositories/rankings.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { lambdaMock, awsError } from '../../../../helpers/aws-mocks.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const lambda = lambdaMock()
let log
const call = (opts) => main(httpEvent(opts), { log, now: NOW })
const X = (n) => 'あ'.repeat(n)
const secondsAgo = (s) => new Date(NOW.getTime() - s * 1000).toISOString().replace('T', ' ').replace('Z', '')
describe('M-H07 gradings（A-09・A-10）', () => {
  beforeEach(() => {
    log = memoryLogger()
    lambda.reset()
    lambda.on(InvokeCommand).resolves({ StatusCode: 202 })
    users.findBySub.mockResolvedValue({ ...learner })
    questions.findKeyword.mockImplementation(async (id) => ({ keywordId: id, keyword: 'DNS', questionId: 42, courseId: id === 999 ? 9 : 3, status: 'published' }))
    gradings.create.mockResolvedValue({ gradingId: 456, createdAt: secondsAgo(0) })
    adventures.find.mockResolvedValue({ adventureId: 90 })
  })
  const create = (text, keywordId = 'kw_123', extra = {}) => call({ method: 'POST', path: '/api/gradings', body: { adventureId: 'adv_90', keywordId, text, isReview: true, ...extra } })
  it('MT-H07-01 採点の受付', async () => {
    const res = await create(X(120))
    expect(res.statusCode).toBe(202)
    expect(parse(res)).toEqual({ gradingId: 'gr_456', status: 'processing' })
    expect(gradings.create).toHaveBeenCalledWith({ userId: 15, courseId: 3, keywordId: 123, adventureId: 90, explanationText: X(120) })
    const input = lambda.commandCalls(InvokeCommand)[0].args[0].input
    expect(input.InvocationType).toBe('Event')
    expect(input.FunctionName).toBe('rpg-test-grading-worker')
    expect(JSON.parse(new TextDecoder().decode(input.Payload))).toEqual({ gradingId: 456 })
  })
  it('MT-H07-02 説明文が短い', async () => {
    const res = await create(X(49))
    expect(res.statusCode).toBe(400)
    expect(parse(res).error.details[0]).toMatchObject({ field: 'text', code: 'M-03' })
    expect(gradings.create).not.toHaveBeenCalled()
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0)
  })
  it('MT-H07-03 他コースのキーワード', async () => {
    expect((await create(X(120), 'kw_999')).statusCode).toBe(404)
    questions.findKeyword.mockResolvedValue(null)
    expect((await create(X(120))).statusCode).toBe(404)
    questions.findKeyword.mockResolvedValue({ keywordId: 123, courseId: 3, status: 'draft' })
    expect((await create(X(120))).statusCode).toBe(404)
    expect(gradings.create).not.toHaveBeenCalled()
  })
  it('MT-H07-04 起動の失敗', async () => {
    lambda.on(InvokeCommand).rejects(awsError('ServiceException'))
    const res = await create(X(120))
    expect(res.statusCode).toBe(500)
    expect(gradings.fail).toHaveBeenCalledWith(456, 'ai_error')
  })
  it('MT-H07-10 冒険IDなし・他人の冒険', async () => {
    expect((await create(X(120), 'kw_123', { adventureId: undefined })).statusCode).toBe(202)
    expect(gradings.create.mock.calls[0][0].adventureId).toBeNull()
    adventures.find.mockResolvedValue(null)
    expect((await create(X(120))).statusCode).toBe(404)
  })
  it('MT-H07-05 結果（完了）', async () => {
    const result = { status: 'done', score: 72, passed: true }
    gradings.find.mockResolvedValue({ gradingId: 456, status: 'done', result, createdAt: secondsAgo(10) })
    const res = await call({ path: '/api/gradings/gr_456' })
    expect(res.statusCode).toBe(200)
    expect(parse(res)).toEqual(result)
    expect(gradings.find).toHaveBeenCalledWith(456, 15)
  })
  it('MT-H07-06 結果（採点中・30秒以内）', async () => {
    gradings.find.mockResolvedValue({ gradingId: 456, status: 'processing', createdAt: secondsAgo(29) })
    const res = await call({ path: '/api/gradings/gr_456' })
    expect(parse(res)).toEqual({ status: 'processing' })
    expect(gradings.fail).not.toHaveBeenCalled()
  })
  it('MT-H07-07 結果（30秒超え）', async () => {
    gradings.find.mockResolvedValue({ gradingId: 456, status: 'processing', createdAt: secondsAgo(31) })
    const res = await call({ path: '/api/gradings/gr_456' })
    expect(res.statusCode).toBe(504)
    expect(parse(res).error.code).toBe('GRADING_TIMEOUT')
    expect(gradings.fail).toHaveBeenCalledWith(456, 'timeout')
    expect(JSON.stringify(log.lines)).toContain('"code":"GRADING_TIMEOUT"')
  })
  it('MT-H07-08 結果（AIの失敗）', async () => {
    gradings.find.mockResolvedValue({ gradingId: 456, status: 'failed', failureReason: 'ai_error', createdAt: secondsAgo(40) })
    const res = await call({ path: '/api/gradings/gr_456' })
    expect(res.statusCode).toBe(200)
    expect(parse(res)).toEqual({ status: 'failed', retryable: true })
    gradings.find.mockResolvedValue({ gradingId: 456, status: 'failed', failureReason: 'timeout', createdAt: secondsAgo(40) })
    expect((await call({ path: '/api/gradings/gr_456' })).statusCode).toBe(504)
  })
  it('MT-H07-09 他人の採点', async () => {
    gradings.find.mockResolvedValue(null)
    expect((await call({ path: '/api/gradings/gr_457' })).statusCode).toBe(404)
    expect(gradings.find).toHaveBeenCalledWith(457, 15)
  })
})
const people = (n) => Array.from({ length: n }, (_, i) => ({ userId: i === 11 ? 15 : 100 + i, nickname: `p${String(i).padStart(2, '0')}`, status: 'active', weeklyExp: 1000 - i * 10 }))
describe('M-H08 rankings（A-11）', () => {
  beforeEach(() => {
    users.findBySub.mockResolvedValue({ ...learner })
    enrollments.isEnrolled.mockImplementation(async (u, c) => c === 3)
    exp.weeklyTotals.mockResolvedValue(people(15))
    rankings.weeks.mockResolvedValue(['2026-10-12', '2026-10-05'])
    rankings.history.mockResolvedValue([{ userId: 15, nickname: 'たろう', weeklyExp: 300, rank: 1 }])
  })
  it('MT-H08-01 今週', async () => {
    const body = parse(await call({ path: '/api/rankings', query: { course: 'c_3' } }))
    expect(exp.weeklyTotals).toHaveBeenCalledWith(3, '2026-10-19')
    expect(body).toMatchObject({ weekStart: '2026-10-19', weekEnd: '2026-10-25', daysToReset: 6, weeks: ['2026-10-12', '2026-10-05'] })
  })
  it('MT-H08-02 上位10名＋自分', async () => {
    const body = parse(await call({ path: '/api/rankings', query: { course: 'c_3' } }))
    expect(body.rows).toHaveLength(11)
    expect(body.rows.slice(0, 10).every((r) => !r.isMe)).toBe(true)
    expect(body.rows[10]).toEqual({ rank: 12, nickname: 'p11', weeklyExp: 890, isMe: true })
    expect(body.me.rank).toBe(12)
  })
  it('MT-H08-03 自分が10位以内', async () => {
    const rows = people(15).map((r) => ({ ...r, userId: r.userId === 15 ? 999 : r.userId }))
    rows[2].userId = 15
    exp.weeklyTotals.mockResolvedValue(rows)
    const body = parse(await call({ path: '/api/rankings', query: { course: 'c_3' } }))
    expect(body.rows).toHaveLength(10)
    expect(body.rows.filter((r) => r.isMe)).toEqual([{ rank: 3, nickname: 'p02', weeklyExp: 980, isMe: true }])
  })
  it('MT-H08-04 過去週', async () => {
    const body = parse(await call({ path: '/api/rankings', query: { course: 'c_3', week: '2026-10-12' } }))
    expect(rankings.history).toHaveBeenCalledWith(3, '2026-10-12')
    expect(exp.weeklyTotals).not.toHaveBeenCalled()
    expect(body).toMatchObject({ weekStart: '2026-10-12', weekEnd: '2026-10-18', rows: [{ rank: 1, isMe: true }] })
  })
  it('MT-H08-05 受講していないコース', async () => {
    expect((await call({ path: '/api/rankings', query: { course: 'c_9' } })).statusCode).toBe(403)
  })
  it.each(['2026-10-13', '2026-02-30', 'x'])('MT-H08-06 月曜以外の週の指定 %s', async (week) => {
    expect((await call({ path: '/api/rankings', query: { course: 'c_3', week } })).statusCode).toBe(400)
  })
  it('MT-H08-07 コース省略・論理削除中の除外・自分が圏外', async () => {
    exp.weeklyTotals.mockResolvedValue([{ userId: 7, nickname: 'D', status: 'deleted', weeklyExp: 999 }, { userId: 8, nickname: 'A', status: 'active', weeklyExp: 10 }])
    const body = parse(await call({ path: '/api/rankings' }))
    expect(enrollments.isEnrolled).toHaveBeenCalledWith(15, 3)
    expect(body.rows).toEqual([{ rank: 1, nickname: 'A', weeklyExp: 10, isMe: false }])
    expect(body.me).toBeNull()
    users.findBySub.mockResolvedValue({ ...learner, currentCourseId: null })
    expect(parse(await call({ path: '/api/rankings' })).error.code).toBe('COURSE_REQUIRED')
  })
})
