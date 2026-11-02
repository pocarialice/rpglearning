import { describe, it, expect } from 'vitest'
import { fakeDb } from '../../../../../helpers/mocks.js'
import * as summaries from '../../../../../../functions/shared/db/repositories/summaries.js'
import { toPositional } from '../../../../../../functions/shared/db/client.js'
describe('M-D03 summaries', () => {
  it('MT-D03-36 冒険の解答：本人の冒険で絞り、足りない観点の JSON を配列にする', async () => {
    const db = fakeDb({ rows: [{ answer_id: 1, kind: 'explain', missing_points: '["サブネット"]' }, { answer_id: 2, kind: 'choice', missing_points: null }] })
    const rows = await summaries.listForAdventure(15, 90, db)
    expect(rows).toEqual([{ answerId: 1, kind: 'explain', missingPoints: ['サブネット'] }, { answerId: 2, kind: 'choice', missingPoints: [] }])
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('a.user_id = :userId AND a.adventure_id = :adventureId')
    expect(sql).toContain("g.status = 'done'")
    expect(params).toEqual({ userId: 15, adventureId: 90 })
    expect(() => toPositional(sql, params)).not.toThrow()
  })
  it('MT-D03-37 1日の解答：JSTの日付で絞る', async () => {
    const db = fakeDb({ rows: [{ answer_id: 3, missing_points: ['ルート'] }] })
    expect(await summaries.listForDate(15, '2026-10-20', db)).toEqual([{ answerId: 3, missingPoints: ['ルート'] }])
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('a.answered_on = :day')
    expect(params).toEqual({ userId: 15, day: { date: '2026-10-20' } })
    expect(() => toPositional(sql, params)).not.toThrow()
  })
})
