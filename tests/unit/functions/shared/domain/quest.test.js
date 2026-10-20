import { describe, it, expect } from 'vitest'
import { pickDailyQuests, applyQuestEvent } from '../../../../../functions/shared/domain/quest.js'
const fixed = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }
// シードつきの乱数（mulberry32）
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const q = (code, progress, target, achieved = false) => ({ code, progress, target, achieved })
const codes = (list) => list.map((x) => x.code)
describe('M-G03 quest', () => {
  it('MT-G03-01 復習ありの日', () => {
    const list = pickDailyQuests(5, fixed(0.1, 0.9))
    expect(list).toHaveLength(3)
    expect(list.find((x) => x.code === 'Q-04')).toEqual({ code: 'Q-04', target: 5 })
    expect(new Set(codes(list)).size).toBe(3)
  })
  it('MT-G03-02 復習なしの日', () => {
    const list = pickDailyQuests(0, fixed(0, 0, 0))
    expect(list).toHaveLength(3)
    expect(codes(list)).not.toContain('Q-04')
    expect(new Set(codes(list)).size).toBe(3)
    expect(list.every((x) => x.target >= 1)).toBe(true)
  })
  it('MT-G03-03 乱数によらず守られる', () => {
    for (const due of [0, 3]) {
      for (let seed = 0; seed < 1000; seed++) {
        const list = pickDailyQuests(due, seeded(seed))
        expect(list).toHaveLength(3)
        expect(new Set(codes(list)).size).toBe(3)
        expect(codes(list).includes('Q-04')).toBe(due > 0)
      }
    }
    expect(pickDailyQuests(2)).toHaveLength(3)
  })
  it('MT-G03-04 択一の不正解', () => {
    const r = applyQuestEvent([q('Q-01', 0, 5), q('Q-02', 0, 3)], { kind: 'choice', correct: false })
    expect(r.quests.map((x) => x.progress)).toEqual([1, 0])
  })
  it('MT-G03-05 択一の正解', () => {
    const r = applyQuestEvent([q('Q-01', 0, 5), q('Q-02', 0, 3)], { kind: 'choice', correct: true })
    expect(r.quests.map((x) => x.progress)).toEqual([1, 1])
  })
  it('MT-G03-06 達成', () => {
    const r = applyQuestEvent([q('Q-01', 4, 5)], { kind: 'choice', correct: false })
    expect(r.quests[0]).toMatchObject({ progress: 5, achieved: true })
    expect(r.achievedNow).toEqual([{ code: 'Q-01', reward: 20 }])
  })
  it('MT-G03-07 達成済みは進めない', () => {
    const r = applyQuestEvent([q('Q-01', 5, 5, true)], { kind: 'choice', correct: true })
    expect(r.quests[0]).toEqual(q('Q-01', 5, 5, true))
    expect(r.achievedNow).toEqual([])
  })
  it('MT-G03-08 説明の合格・不合格', () => {
    expect(applyQuestEvent([q('Q-03', 0, 1)], { kind: 'explain', passed: true }).quests[0].achieved).toBe(true)
    expect(applyQuestEvent([q('Q-03', 0, 1)], { kind: 'explain', passed: false }).quests[0]).toEqual(q('Q-03', 0, 1))
  })
  it('MT-G03-09 復習', () => {
    expect(applyQuestEvent([q('Q-04', 1, 2)], { isReview: true }).quests[0]).toMatchObject({ progress: 2, achieved: true })
  })
  it('MT-G03-10 新しい問題', () => {
    expect(applyQuestEvent([q('Q-05', 2, 3)], { isNew: true }).quests[0].achieved).toBe(true)
    expect(applyQuestEvent([q('Q-05', 2, 3)], { isNew: false }).quests[0]).toEqual(q('Q-05', 2, 3))
  })
  it('MT-G03-11 同時に2つ達成', () => {
    const r = applyQuestEvent([q('Q-01', 4, 5), q('Q-05', 2, 3)], { kind: 'choice', isNew: true })
    expect(codes(r.achievedNow)).toEqual(['Q-01', 'Q-05'])
    expect(r.questExp).toBe(40)
  })
  it('MT-G03-12 クエストなし', () => {
    expect(applyQuestEvent([], { kind: 'choice' })).toEqual({ quests: [], achievedNow: [], questExp: 0 })
  })
})
