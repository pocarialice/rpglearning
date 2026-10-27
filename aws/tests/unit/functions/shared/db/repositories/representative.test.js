import { describe, it, expect, beforeEach } from 'vitest'
import { ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { rdsMock } from '../../../../../helpers/aws-mocks.js'
import * as enrollments from '../../../../../../functions/shared/db/repositories/enrollments.js'
import * as gradings from '../../../../../../functions/shared/db/repositories/gradings.js'
import * as reviews from '../../../../../../functions/shared/db/repositories/reviews.js'
import * as exp from '../../../../../../functions/shared/db/repositories/exp.js'
import * as rankings from '../../../../../../functions/shared/db/repositories/rankings.js'
import * as courses from '../../../../../../functions/shared/db/repositories/courses.js'
import * as users from '../../../../../../functions/shared/db/repositories/users.js'
const rds = rdsMock()
const calls = () => rds.commandCalls(ExecuteStatementCommand).map((c) => c.args[0].input)
const param = (input, name) => input.parameters.find((p) => p.name === name)
describe('M-D03 リポジトリ（代表）', () => {
  beforeEach(() => {
    rds.reset()
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[]', numberOfRecordsUpdated: 1 })
  })
  it('MT-D03-01 ニックネームの重複確認', async () => {
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[{"taken":1}]' })
    expect(await enrollments.nicknameTaken([3, 5], 'たろう', 15)).toBe(true)
    const input = calls()[0]
    expect(param(input, 'courseIds').value).toEqual({ stringValue: '3,5' })
    expect(param(input, 'nickname').value).toEqual({ stringValue: 'たろう' })
    expect(param(input, 'exceptUserId').value).toEqual({ longValue: 15 })
  })
  it('MT-D03-02 重複なし', async () => {
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[]' })
    expect(await enrollments.nicknameTaken([3, 5], 'たろう', 15)).toBe(false)
  })
  it('MT-D03-03 採点の完了（条件付き）', async () => {
    expect(await gradings.complete(456, { score: 72 })).toBe(true)
    expect(calls()[0].sql).toContain("status = 'processing'")
    expect(param(calls()[0], 'result')).toEqual({ name: 'result', value: { stringValue: '{"score":72}' }, typeHint: 'JSON' })
    rds.on(ExecuteStatementCommand).resolves({ numberOfRecordsUpdated: 0 })
    expect(await gradings.complete(456, { score: 72 })).toBe(false)
  })
  it('MT-D03-04 復習項目の登録・更新', async () => {
    await reviews.upsertItem({ userId: 15, courseId: 3, kind: 'choice', questionId: 42, stage: 1, nextReviewOn: '2026-10-21', correct: true, today: '2026-10-20' })
    const input = calls()[0]
    expect(input.sql).toContain("ON CONFLICT (user_id, question_id) WHERE kind = 'choice'")
    expect(param(input, 'nextReviewOn')).toEqual({ name: 'nextReviewOn', value: { stringValue: '2026-10-21' }, typeHint: 'DATE' })
    expect(param(input, 'today').typeHint).toBe('DATE')
    expect(param(input, 'correctInc').value).toEqual({ longValue: 1 })
  })
  it('MT-D03-05 週の集計', async () => {
    await exp.weeklyTotals(3, '2026-10-19')
    const input = calls()[0]
    expect(input.sql).toContain('e.earned_week = :weekStart')
    expect(param(input, 'weekStart')).toEqual({ name: 'weekStart', value: { stringValue: '2026-10-19' }, typeHint: 'DATE' })
  })
  it('MT-D03-06 ランキングの締め', async () => {
    const n = await rankings.closeWeek([{ courseId: 3, weekStart: '2026-10-12', userId: 15, weeklyExp: 120, rank: 1, nickname: 'たろう' }])
    expect(calls()[0].sql).toContain('ON CONFLICT (course_id, week_start, user_id) DO NOTHING')
    expect(n).toBe(1)
  })
  it('MT-D03-07 列名の変換', async () => {
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[{"review_id":1,"next_review_on":"2026-10-21","stage":2}]' })
    const item = await reviews.findItem({ userId: 15, kind: 'choice', questionId: 42 })
    expect(item).toEqual({ reviewId: 1, nextReviewOn: '2026-10-21', stage: 2 })
  })
  it('MT-D03-08 一覧の上限', async () => {
    await courses.dashboardRows(3, { limit: 1000, offset: 0 })
    const input = calls()[0]
    expect(param(input, 'limit').value).toEqual({ longValue: 1000 })
    expect(param(input, 'offset').value).toEqual({ longValue: 0 })
    expect(input.sql).toContain('LIMIT :limit OFFSET :offset')
  })
  it('MT-D03-09 並べ替えの許可リスト', async () => {
    await expect(users.listForAdmin({ sort: 'email; DROP TABLE users' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(calls()).toHaveLength(0)
  })
})
