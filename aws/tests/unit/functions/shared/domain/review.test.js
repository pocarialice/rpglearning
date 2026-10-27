import { describe, it, expect } from 'vitest'
import { nextReview, STAGE_DAYS } from '../../../../../functions/shared/domain/review.js'
const T = '2026-10-20'
const item = (stage, nextReviewOn) => ({ stage, nextReviewOn })
describe('M-G01 review', () => {
  it('MT-G01-01 初回・正解', () => {
    expect(nextReview(null, true, T)).toMatchObject({ stage: 1, nextReviewOn: '2026-10-21', isReview: false, mastered: false })
  })
  it('MT-G01-02 初回・不正解', () => {
    expect(nextReview(undefined, false, T)).toMatchObject({ stage: 1, nextReviewOn: '2026-10-21', isReview: false, mastered: false })
  })
  it('MT-G01-03 予定日の前日', () => {
    expect(nextReview(item(1, '2026-10-21'), true, T)).toEqual({ stage: 1, nextReviewOn: '2026-10-21', isReview: false, mastered: false, changed: false })
  })
  it('MT-G01-04 予定日当日に正解すると段階2・3日後になる', () => {
    expect(nextReview(item(1, T), true, T)).toMatchObject({ stage: 2, nextReviewOn: '2026-10-23', isReview: true })
  })
  it('MT-G01-05 段階2→3', () => {
    expect(nextReview(item(2, T), true, T)).toMatchObject({ stage: 3, nextReviewOn: '2026-10-27' })
  })
  it('MT-G01-06 段階3→4', () => {
    expect(nextReview(item(3, T), true, T)).toMatchObject({ stage: 4, nextReviewOn: '2026-11-03' })
  })
  it('MT-G01-07 段階4→5', () => {
    expect(nextReview(item(4, T), true, T)).toMatchObject({ stage: 5, nextReviewOn: '2026-11-19' })
  })
  it('MT-G01-08 習得', () => {
    expect(nextReview(item(5, T), true, T)).toMatchObject({ stage: 6, nextReviewOn: null, isReview: true, mastered: true })
  })
  it('MT-G01-09 不正解で段階1へ', () => {
    expect(nextReview(item(3, T), false, T)).toMatchObject({ stage: 1, nextReviewOn: '2026-10-21', isReview: true })
  })
  it('MT-G01-10 段階5で不正解', () => {
    expect(nextReview(item(5, T), false, T)).toMatchObject({ stage: 1, nextReviewOn: '2026-10-21', isReview: true })
  })
  it('MT-G01-11 段階1で不正解', () => {
    expect(nextReview(item(1, T), false, T)).toMatchObject({ stage: 1, nextReviewOn: '2026-10-21', isReview: true })
  })
  it('MT-G01-12 遅れて正解（段階を下げない）', () => {
    expect(nextReview(item(2, '2026-10-15'), true, T)).toMatchObject({ stage: 3, nextReviewOn: '2026-10-27', isReview: true })
  })
  it.each([true, false])('MT-G01-13 習得済みを解く（correct=%s）', (correct) => {
    expect(nextReview(item(6, null), correct, T)).toEqual({ stage: 6, nextReviewOn: null, isReview: false, mastered: false, changed: false })
  })
  it('MT-G01-14 年末をまたぐ', () => {
    expect(nextReview(null, true, '2026-12-31')).toMatchObject({ stage: 1, nextReviewOn: '2027-01-01' })
    expect(STAGE_DAYS).toEqual([1, 3, 7, 14, 30])
  })
})
