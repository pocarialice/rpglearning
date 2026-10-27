import { describe, it, expect } from 'vitest'
import { todayJst, addDays, weekStartJst, jstSlot, toIsoJst, diffDays } from '../../../../../functions/shared/util/date-jst.js'
const jst = (s) => new Date(`${s}+09:00`)
describe('M-U03 date-jst', () => {
  it('MT-U03-01 JSTの日付（0:00直前）', () => {
    expect(todayJst(new Date('2026-10-20T14:59:59Z'))).toBe('2026-10-20')
  })
  it('MT-U03-02 JSTの日付（0:00ちょうど）', () => {
    expect(todayJst(new Date('2026-10-20T15:00:00Z'))).toBe('2026-10-21')
  })
  it('MT-U03-03 月末をまたぐ', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
  it('MT-U03-04 年末をまたぐ', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('MT-U03-05 うるう年', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('MT-U03-06 引き算', () => {
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19')
  })
  it('MT-U03-07 週の開始（月曜0:00）', () => {
    expect(weekStartJst(new Date('2026-10-18T15:00:00Z'))).toBe('2026-10-19')
  })
  it('MT-U03-08 週の開始（日曜23:59）', () => {
    expect(weekStartJst(new Date('2026-10-25T14:59:59Z'))).toBe('2026-10-19')
  })
  it('MT-U03-09 週の開始（次の月曜）', () => {
    expect(weekStartJst(new Date('2026-10-25T15:00:00Z'))).toBe('2026-10-26')
  })
  it('MT-U03-10 送信枠', () => {
    expect(jstSlot(jst('2026-10-20T07:29:59'))).toBe('0700')
    expect(jstSlot(jst('2026-10-20T07:30:00'))).toBe('0730')
    expect(jstSlot(jst('2026-10-20T22:59:00'))).toBe('2230')
    expect(jstSlot(jst('2026-10-20T00:10:00'))).toBe('0000')
  })
  it('MT-U03-11 ISO文字列', () => {
    expect(toIsoJst(new Date('2026-10-20T15:30:00Z'))).toBe('2026-10-21T00:30:00+09:00')
  })
  it('MT-U03-12 日数の差', () => {
    expect(diffDays('2026-10-21', '2026-10-26')).toBe(5)
  })
  it('MT-U03-13 不正な日付', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
    expect(() => addDays('2026/10/01', 1)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
    expect(() => addDays(null, 1)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
  })
})
describe('M-U03 date-jst（追加）', () => {
  it('MT-U03-14 DBの日時の読み取り', async () => {
    const { parseDbTimestamp } = await import('../../../../../functions/shared/util/date-jst.js')
    expect(parseDbTimestamp('2026-10-20 01:00:00').toISOString()).toBe('2026-10-20T01:00:00.000Z')
    expect(parseDbTimestamp('2026-10-20T10:00:00+09:00').toISOString()).toBe('2026-10-20T01:00:00.000Z')
    const d = new Date()
    expect(parseDbTimestamp(d)).toBe(d)
  })
})
