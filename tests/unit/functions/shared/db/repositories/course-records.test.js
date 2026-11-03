import { describe, it, expect } from 'vitest'
import { fakeDb } from '../../../../../helpers/mocks.js'
import * as records from '../../../../../../functions/shared/db/repositories/course-records.js'
import { toPositional } from '../../../../../../functions/shared/db/client.js'
describe('M-D03 course-records', () => {
  it('MT-D03-38 一覧：受講したコースと解答したコース、最後に学習した日が新しい順', async () => {
    const db = fakeDb({ rows: [{ course_id: 3, study_seconds: 600, last_studied_on: '2026-10-19' }] })
    expect(await records.listForUser(15, db)).toEqual([{ courseId: 3, studySeconds: 600, lastStudiedOn: '2026-10-19' }])
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('SELECT course_id FROM enrollments WHERE user_id = :userId')
    expect(sql).toContain('UNION SELECT DISTINCT course_id FROM answer_logs WHERE user_id = :userId')
    expect(sql).toContain('sum(ad.study_seconds)')
    expect(sql).toContain("a.kind = 'choice'")
    expect(sql).toContain('ORDER BY last_studied_on DESC NULLS LAST')
    expect(params).toEqual({ userId: 15 })
    expect(() => toPositional(sql, params)).not.toThrow()
  })
  it('MT-D03-39 1コース分：なければ null', async () => {
    const db = fakeDb({ rows: [{ course_id: 3 }] })
    expect(await records.findForUser(15, 3, db)).toEqual({ courseId: 3 })
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('WHERE c.course_id = :courseId')
    expect(params).toEqual({ userId: 15, courseId: 3 })
    expect(() => toPositional(sql, params)).not.toThrow()
    expect(await records.findForUser(15, 9, fakeDb())).toBeNull()
  })
  it('MT-D03-40 詳細の数：今日の復習は公開済みの問題で数える', async () => {
    const db = fakeDb({ rows: [{ adventure_count: 2, due_today: 1 }] })
    expect(await records.detailCounts(15, 3, '2026-10-20', db)).toEqual({ adventureCount: 2, dueToday: 1 })
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('count(DISTINCT a.adventure_id)')
    expect(sql).toContain('r.next_review_on <= :today')
    expect(params).toEqual({ userId: 15, courseId: 3, today: { date: '2026-10-20' } })
    expect(() => toPositional(sql, params)).not.toThrow()
  })
  it('MT-D03-41 苦手な問題：まちがいの多い順、足りない観点の JSON を配列にする', async () => {
    const db = fakeDb({ rows: [{ kind: 'explain', miss_count: 2, missing_points: '["優先度"]' }, { kind: 'choice', miss_count: 1, missing_points: null }] })
    expect(await records.listWeak(15, 3, 3, db)).toEqual([{ kind: 'explain', missCount: 2, missingPoints: ['優先度'] }, { kind: 'choice', missCount: 1, missingPoints: [] }])
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('r.stage < 6 AND r.answer_count > r.correct_count')
    expect(sql).toContain('ORDER BY miss_count DESC')
    expect(params).toEqual({ userId: 15, courseId: 3, limit: 3 })
    expect(() => toPositional(sql, params)).not.toThrow()
  })
})
