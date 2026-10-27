import { describe, it, expect } from 'vitest'
import { judgeMasteryBadges, judgeStreakBadges } from '../../../../../functions/shared/domain/badge.js'
describe('M-G04 badge', () => {
  it('MT-G04-01 習得の境界', () => {
    expect(judgeMasteryBadges(9, [])).toEqual([])
    expect(judgeMasteryBadges(10, [])).toEqual(['mastery_bronze'])
  })
  it('MT-G04-02 次の段階', () => expect(judgeMasteryBadges(50, ['mastery_bronze'])).toEqual(['mastery_silver']))
  it('MT-G04-03 まとめて達成', () => expect(judgeMasteryBadges(100, [])).toEqual(['mastery_bronze', 'mastery_silver', 'mastery_gold']))
  it('MT-G04-04 全部持っている', () => {
    expect(judgeMasteryBadges(120, ['mastery_bronze', 'mastery_silver', 'mastery_gold'])).toEqual([])
  })
  it('MT-G04-05 継続の境界', () => {
    expect(judgeStreakBadges(6, [])).toEqual([])
    expect(judgeStreakBadges(7, [])).toEqual(['streak_bronze'])
  })
  it('MT-G04-06 継続の銀・金', () => {
    expect(judgeStreakBadges(30, ['streak_bronze'])).toEqual(['streak_silver'])
    expect(judgeStreakBadges(100, ['streak_bronze', 'streak_silver'])).toEqual(['streak_gold'])
  })
  it('MT-G04-07 0日', () => {
    expect(judgeStreakBadges(0, [])).toEqual([])
    expect(judgeStreakBadges(0)).toEqual([])
    expect(judgeMasteryBadges(0)).toEqual([])
  })
})
