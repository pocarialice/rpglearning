import { describe, it, expect, beforeEach } from 'vitest'
import { dbMock } from '../../../../../helpers/mocks.js'
import * as enrollments from '../../../../../../functions/shared/db/repositories/enrollments.js'
import * as gradings from '../../../../../../functions/shared/db/repositories/gradings.js'
import * as reviews from '../../../../../../functions/shared/db/repositories/reviews.js'
import * as exp from '../../../../../../functions/shared/db/repositories/exp.js'
import * as rankings from '../../../../../../functions/shared/db/repositories/rankings.js'
import * as courses from '../../../../../../functions/shared/db/repositories/courses.js'
import * as users from '../../../../../../functions/shared/db/repositories/users.js'
const db = dbMock()
const calls = () => db.calls()
// SQL の中で n 番目（1始まり）のパラメータの値
const param = (call, n) => call.values[n - 1]
const placeholder = (call, n) => new RegExp(`\\$${n}(?!\\d)`).test(call.sql)
describe('M-D03 リポジトリ（代表）', () => {
  beforeEach(() => {
    db.reset()
  })
  it('MT-D03-01 ニックネームの重複確認', async () => {
    db.resolves({ rows: [{ taken: 1 }] })
    expect(await enrollments.nicknameTaken([3, 5], 'たろう', 15)).toBe(true)
    expect(calls()[0].values).toEqual(expect.arrayContaining(['3,5', 'たろう', 15]))
    expect(calls()[0].values).toHaveLength(3)
  })
  it('MT-D03-02 重複なし', async () => {
    db.resolves({ rows: [] })
    expect(await enrollments.nicknameTaken([3, 5], 'たろう', 15)).toBe(false)
  })
  it('MT-D03-03 採点の完了（条件付き）', async () => {
    expect(await gradings.complete(456, { score: 72 })).toBe(true)
    expect(calls()[0].sql).toContain("status = 'processing'")
    expect(calls()[0].values).toContain('{"score":72}')
    db.resolves({ updated: 0 })
    expect(await gradings.complete(456, { score: 72 })).toBe(false)
  })
  it('MT-D03-04 復習項目の登録・更新', async () => {
    await reviews.upsertItem({ userId: 15, courseId: 3, kind: 'choice', questionId: 42, stage: 1, nextReviewOn: '2026-10-21', correct: true, today: '2026-10-20' })
    const input = calls()[0]
    expect(input.sql).toContain("ON CONFLICT (user_id, question_id) WHERE kind = 'choice'")
    // 日付は 'YYYY-MM-DD' の文字で渡す（列の date 型に変わる）
    expect(input.values).toEqual(expect.arrayContaining(['2026-10-21', '2026-10-20', 1]))
  })
  it('MT-D03-05 週の集計', async () => {
    await exp.weeklyTotals(3, '2026-10-19')
    const input = calls()[0]
    expect(input.sql).toMatch(/e\.earned_week = \$\d/)
    expect(input.values).toContain('2026-10-19')
  })
  it('MT-D03-06 ランキングの締め', async () => {
    const n = await rankings.closeWeek([{ courseId: 3, weekStart: '2026-10-12', userId: 15, weeklyExp: 120, rank: 1, nickname: 'たろう' }])
    expect(calls()[0].sql).toContain('ON CONFLICT (course_id, week_start, user_id) DO NOTHING')
    expect(n).toBe(1)
  })
  it('MT-D03-07 列名の変換', async () => {
    db.resolves({ rows: [{ review_id: 1, next_review_on: '2026-10-21', stage: 2 }] })
    const item = await reviews.findItem({ userId: 15, kind: 'choice', questionId: 42 })
    expect(item).toEqual({ reviewId: 1, nextReviewOn: '2026-10-21', stage: 2 })
  })
  it('MT-D03-08 一覧の上限', async () => {
    await courses.dashboardRows(3, { limit: 1000, offset: 0 })
    const input = calls()[0]
    const m = /LIMIT \$(\d+) OFFSET \$(\d+)/.exec(input.sql)
    expect(m).not.toBeNull()
    expect(param(input, Number(m[1]))).toBe(1000)
    expect(param(input, Number(m[2]))).toBe(0)
    expect(placeholder(input, Number(m[1]))).toBe(true)
  })
  it('MT-D03-09 並べ替えの許可リスト', async () => {
    await expect(users.listForAdmin({ sort: 'email; DROP TABLE users' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(calls()).toHaveLength(0)
  })
})
