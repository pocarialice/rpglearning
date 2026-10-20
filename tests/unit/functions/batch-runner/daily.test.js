import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'
vi.mock('../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../functions/shared/db/repositories/exp.js')
vi.mock('../../../../functions/shared/db/repositories/rankings.js')
vi.mock('../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../functions/shared/db/repositories/badges.js')
vi.mock('../../../../functions/shared/db/repositories/quests.js')
vi.mock('../../../../functions/shared/db/repositories/audit.js')
vi.mock('../../../../functions/shared/db/repositories/gradings.js')
vi.mock('../../../../functions/shared/db/repositories/notify.js')
import * as courses from '../../../../functions/shared/db/repositories/courses.js'
import * as exp from '../../../../functions/shared/db/repositories/exp.js'
import * as rankings from '../../../../functions/shared/db/repositories/rankings.js'
import * as users from '../../../../functions/shared/db/repositories/users.js'
import * as badges from '../../../../functions/shared/db/repositories/badges.js'
import * as quests from '../../../../functions/shared/db/repositories/quests.js'
import * as audit from '../../../../functions/shared/db/repositories/audit.js'
import * as gradings from '../../../../functions/shared/db/repositories/gradings.js'
import * as notify from '../../../../functions/shared/db/repositories/notify.js'
import { main, handler } from '../../../../functions/batch-runner/index.mjs'
import * as assignQuests from '../../../../functions/batch-runner/steps/assign-quests.js'
import { memoryLogger } from '../../../helpers/logger.js'
import { s3Mock, cognitoMock, awsError } from '../../../helpers/aws-mocks.js'
const s3 = s3Mock()
const cognito = cognitoMock()
const MON = new Date('2026-10-25T15:00:00Z') // 2026-10-26（月）0:00 JST
const TUE = new Date('2026-10-19T15:00:00Z') // 2026-10-20（火）0:00 JST
let log
const daily = (now = TUE) => main({ job: 'daily' }, { log, now })
const order = []
const track = (name, fn, value) => fn.mockImplementation(async (...args) => {
  order.push(name)
  return typeof value === 'function' ? value(...args) : value
})
beforeEach(() => {
  log = memoryLogger()
  order.length = 0
  s3.reset()
  cognito.reset()
  s3.on(PutObjectCommand).resolves({})
  cognito.on(AdminDeleteUserCommand).callsFake(() => {
    order.push('AdminDeleteUser')
    return {}
  })
  track('close-ranking', courses.listIds, [3])
  exp.weeklyTotals.mockResolvedValue([])
  track('update-streak', users.listForStreak, [])
  track('assign-quests', quests.listAssignTargets, [])
  track('purge-users', users.listPurgeTargets, [])
  track('cleanup-gradings', gradings.deleteOlderThan, 0)
  track('build-notify', notify.listForSlotBuild, [])
  badges.listOwned.mockResolvedValue([])
  rankings.closeWeek.mockImplementation(async (rows) => rows.length)
  track('users.purge', users.purge, true)
})
describe('M-W03 batch-runner daily', () => {
  it('MT-W03-01 実行順', async () => {
    const res = await daily(MON)
    expect(res.steps).toEqual(['close-ranking', 'update-streak', 'assign-quests', 'purge-users', 'cleanup-gradings', 'build-notify'])
    expect(order).toEqual(res.steps)
    expect(res.today).toBe('2026-10-26')
  })
  it('MT-W03-02 月曜以外', async () => {
    const res = await daily(TUE)
    expect(res.steps).toEqual(['update-streak', 'assign-quests', 'purge-users', 'cleanup-gradings', 'build-notify'])
    expect(courses.listIds).not.toHaveBeenCalled()
  })
  it('MT-W03-03 ランキングの締め', async () => {
    exp.weeklyTotals.mockResolvedValue([
      { userId: 1, nickname: 'A', status: 'active', weeklyExp: 120 }, { userId: 2, nickname: 'B', status: 'active', weeklyExp: 120 },
      { userId: 3, nickname: 'C', status: 'active', weeklyExp: 30 }, { userId: 4, nickname: 'D', status: 'deleted', weeklyExp: 500 }
    ])
    await daily(MON)
    expect(exp.weeklyTotals).toHaveBeenCalledWith(3, '2026-10-19')
    expect(rankings.closeWeek.mock.calls[0][0]).toEqual([
      { courseId: 3, weekStart: '2026-10-19', userId: 1, weeklyExp: 120, rank: 1, nickname: 'A' },
      { courseId: 3, weekStart: '2026-10-19', userId: 2, weeklyExp: 120, rank: 1, nickname: 'B' },
      { courseId: 3, weekStart: '2026-10-19', userId: 3, weeklyExp: 30, rank: 3, nickname: 'C' }
    ])
  })
  it('MT-W03-04 継続日数（続いた）', async () => {
    users.listForStreak.mockResolvedValue([{ userId: 15, streakDays: 6, lastActiveOn: '2026-10-19', streakCheckedOn: '2026-10-19' }])
    await daily()
    expect(users.updateStreak).toHaveBeenCalledWith(15, 7, '2026-10-20')
    expect(badges.grant).toHaveBeenCalledWith(15, ['streak_bronze'])
  })
  it('MT-W03-05 継続日数（途切れた）', async () => {
    users.listForStreak.mockResolvedValue([{ userId: 15, streakDays: 12, lastActiveOn: '2026-10-18', streakCheckedOn: '2026-10-19' }])
    await daily()
    expect(users.updateStreak).toHaveBeenCalledWith(15, 0, '2026-10-20')
    expect(badges.grant).not.toHaveBeenCalled()
  })
  it('MT-W03-06 継続日数（二重実行）', async () => {
    users.listForStreak.mockResolvedValue([{ userId: 15, streakDays: 7, lastActiveOn: '2026-10-19', streakCheckedOn: '2026-10-20' }])
    await daily()
    expect(users.updateStreak).not.toHaveBeenCalled()
  })
  it('MT-W03-07 クエストの割り当て', async () => {
    quests.listAssignTargets.mockResolvedValue([{ userId: 15, dueCount: 4, assigned: false }, { userId: 16, dueCount: 0, assigned: false }])
    await assignQuests.run({ today: '2026-10-20', rand: () => 0.5 })
    const [first, second] = quests.insertAssignments.mock.calls
    expect(first[0]).toBe(15)
    expect(first[1]).toBe('2026-10-20')
    expect(first[2]).toHaveLength(3)
    expect(first[2]).toContainEqual({ code: 'Q-04', target: 4 })
    expect(second[2]).toHaveLength(3)
    expect(second[2].map((q) => q.code)).not.toContain('Q-04')
  })
  it('MT-W03-08 クエストの二重実行', async () => {
    quests.listAssignTargets.mockResolvedValue([{ userId: 15, dueCount: 4, assigned: true }, { userId: 16, dueCount: 0, assigned: false }])
    await daily()
    expect(quests.insertAssignments).toHaveBeenCalledTimes(1)
    expect(quests.insertAssignments.mock.calls[0][0]).toBe(16)
  })
  it('MT-W03-09 物理削除', async () => {
    users.listPurgeTargets.mockResolvedValue([{ userId: 20, cognitoSub: 'sub-20' }])
    await daily()
    expect(users.listPurgeTargets).toHaveBeenCalledWith('2026-10-20')
    expect(order.indexOf('AdminDeleteUser')).toBeLessThan(order.indexOf('users.purge'))
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0].args[0].input).toEqual({ UserPoolId: 'ap-northeast-1_TEST', Username: 'sub-20' })
    expect(users.purge).toHaveBeenCalledWith(20)
    expect(audit.write).toHaveBeenCalledWith(null, 'user.purge', { type: 'user', id: 20 }, {})
  })
  it('MT-W03-10 Cognito に利用者がいない', async () => {
    users.listPurgeTargets.mockResolvedValue([{ userId: 20, cognitoSub: 'sub-20' }])
    cognito.on(AdminDeleteUserCommand).rejects(awsError('UserNotFoundException'))
    await daily()
    expect(users.purge).toHaveBeenCalledWith(20)
  })
  it('MT-W03-11 採点ジョブの掃除', async () => {
    await daily()
    expect(gradings.deleteOlderThan).toHaveBeenCalledWith('2026-09-20T00:00:00+09:00')
  })
  it('MT-W03-12 送信リスト', async () => {
    const r = (userId, slot, patch = {}) => ({ userId, email: `u${userId}@example.co.jp`, nickname: `n${userId}`, partnerPersona: 'encourage', partnerName: 'ミナ', status: 'active', emailEnabled: true, slot, reviewCount: 2, quests: '["択一を5問解く"]', ...patch })
    notify.listForSlotBuild.mockResolvedValue([r(1, '0730'), r(2, '0730'), r(3, '2100', { quests: ['キーワード説明を1問合格する'] }), r(4, '0730', { emailEnabled: false }), r(5, '0730', { status: 'deleted' })])
    await daily()
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input)
    expect(puts.map((p) => p.Key)).toEqual(['notify/2026-10-20/0730.json', 'notify/2026-10-20/2100.json'])
    expect(puts[0].Bucket).toBe('rpg-test-notify')
    const list = JSON.parse(puts[0].Body)
    expect(list).toMatchObject({ date: '2026-10-20', slot: '0730' })
    expect(list.items).toEqual([
      { to: 'u1@example.co.jp', nickname: 'n1', partnerName: 'ミナ', persona: 'encourage', reviewCount: 2, quests: ['択一を5問解く'] },
      { to: 'u2@example.co.jp', nickname: 'n2', partnerName: 'ミナ', persona: 'encourage', reviewCount: 2, quests: ['択一を5問解く'] }
    ])
    expect(JSON.parse(puts[1].Body).items).toHaveLength(1)
    expect(JSON.stringify(log.lines)).not.toContain('@example.co.jp')
  })
  it('MT-W03-13 ステップの失敗', async () => {
    quests.listAssignTargets.mockRejectedValue(awsError('BadRequestException'))
    await expect(daily()).rejects.toMatchObject({ name: 'BadRequestException' })
    expect(users.listPurgeTargets).not.toHaveBeenCalled()
    expect(gradings.deleteOlderThan).not.toHaveBeenCalled()
    expect(notify.listForSlotBuild).not.toHaveBeenCalled()
  })
  it('MT-W03-14 知らないジョブ', async () => {
    await expect(main({ job: 'weekly' }, { log, now: TUE })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(main(undefined, { log })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
  it('MT-W03-15 Cognito のほかのエラー・削除できなかった利用者・入口（handler）', async () => {
    users.listPurgeTargets.mockResolvedValue([{ userId: 20, cognitoSub: 'sub-20' }])
    users.purge.mockResolvedValue(false)
    await daily()
    expect(audit.write).not.toHaveBeenCalled()
    cognito.on(AdminDeleteUserCommand).rejects(awsError('TooManyRequestsException'))
    await expect(daily()).rejects.toMatchObject({ name: 'TooManyRequestsException' })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(handler({ job: 'weekly' }, { awsRequestId: 'r' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    users.listPurgeTargets.mockResolvedValue([])
    expect((await handler({ job: 'daily' }, {})).job).toBe('daily')
    expect(spy.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.fn === 'batch-runner' && l.level === 'ERROR')).toBe(true)
  })
})
