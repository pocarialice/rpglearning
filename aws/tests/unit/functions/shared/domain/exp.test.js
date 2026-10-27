import { describe, it, expect } from 'vitest'
import { calcAnswerExp, requiredExp, levelInfo } from '../../../../../functions/shared/domain/exp.js'
describe('M-G02 exp', () => {
  it('MT-G02-01 択一の正解', () => expect(calcAnswerExp('choice', true, false)).toBe(10))
  it('MT-G02-02 択一の復習正解', () => expect(calcAnswerExp('choice', true, true)).toBe(15))
  it('MT-G02-03 説明の合格', () => expect(calcAnswerExp('explain', true, false)).toBe(30))
  it('MT-G02-04 説明の復習合格', () => expect(calcAnswerExp('explain', true, true)).toBe(45))
  it('MT-G02-05 不正解は0', () => {
    expect(calcAnswerExp('choice', false, false)).toBe(0)
    expect(calcAnswerExp('explain', false, true)).toBe(0)
  })
  it.each([[1, 100], [2, 230], [3, 374], [4, 528], [5, 690], [10, 1585], [20, 3642], [30, 5924]])(
    'MT-G02-06 必要EXP（表の値）Lv%i → %i', (lv, exp) => expect(requiredExp(lv)).toBe(exp))
  it('MT-G02-07 ちょうど整数になる値', () => expect(requiredExp(1)).toBe(100))
  it('MT-G02-08 Lv1の範囲', () => {
    expect(levelInfo(0)).toEqual({ level: 1, expInLevel: 0, next: 100 })
    expect(levelInfo(99)).toEqual({ level: 1, expInLevel: 99, next: 100 })
  })
  it('MT-G02-09 Lv2になる境界', () => expect(levelInfo(100)).toEqual({ level: 2, expInLevel: 0, next: 230 }))
  it('MT-G02-10 Lv3になる境界', () => {
    expect(levelInfo(329)).toEqual({ level: 2, expInLevel: 229, next: 230 })
    expect(levelInfo(330)).toEqual({ level: 3, expInLevel: 0, next: 374 })
  })
  it.each([[1232, 5], [6425, 10], [31300, 20], [77833, 30]])('MT-G02-11 表の累計EXP %i → Lv%i', (total, level) => {
    expect(levelInfo(total)).toMatchObject({ level, expInLevel: 0 })
  })
  it('MT-G02-12 大きな値', () => {
    const t = performance.now()
    const r = levelInfo(10_000_000)
    expect(performance.now() - t).toBeLessThan(50)
    expect(r.level).toBeGreaterThan(30)
    expect(r.expInLevel).toBeLessThan(r.next)
  })
  it('MT-G02-13 不正な種類', () => {
    expect(() => calcAnswerExp('essay', true, false)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
  })
})
