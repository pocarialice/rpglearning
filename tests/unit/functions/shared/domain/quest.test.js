import { describe, it, expect } from 'vitest'
import { pickDailyQuests, applyQuestEvent, QUEST_DEFS, QUEST_CODES, EXPLAIN_ONLY, HIGH_SCORE } from '../../../../../functions/shared/domain/quest.js'
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
  it('MT-G03-01 1日に3つ、重複なし', () => {
    const list = pickDailyQuests(fixed(0.1, 0.9, 0.5))
    expect(list).toHaveLength(3)
    expect(new Set(codes(list)).size).toBe(3)
    expect(list.every((x) => x.target === QUEST_DEFS[x.code].target)).toBe(true)
  })
  it('MT-G03-02 Q-04 は割り当てない', () => {
    expect(QUEST_CODES).toEqual(['Q-01', 'Q-02', 'Q-03', 'Q-05', 'Q-06', 'Q-07', 'Q-08'])
    expect(codes(pickDailyQuests(fixed(0, 0, 0)))).not.toContain('Q-04')
  })
  it('MT-G03-03 乱数によらず守られる（説明だけのクエストは1日1つまで）', () => {
    const seen = new Set()
    for (let seed = 0; seed < 1000; seed++) {
      const list = codes(pickDailyQuests(seeded(seed)))
      expect(list).toHaveLength(3)
      expect(new Set(list).size).toBe(3)
      expect(list.filter((c) => EXPLAIN_ONLY.includes(c)).length).toBeLessThanOrEqual(1)
      list.forEach((c) => seen.add(c))
    }
    expect([...seen].sort()).toEqual(QUEST_CODES)
    expect(pickDailyQuests()).toHaveLength(3)
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
  it('MT-G03-09 定義のなくなったクエスト（Q-04）は進めない', () => {
    const r = applyQuestEvent([q('Q-04', 1, 2)], { isReview: true })
    expect(r.quests[0]).toEqual(q('Q-04', 1, 2))
    expect(r.achievedNow).toEqual([])
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
  it('MT-G03-13 冒険をやりとげる・まちがえた問題を正解し直す・説明で80点以上', () => {
    expect(applyQuestEvent([q('Q-06', 0, 1)], { kind: 'choice', adventureCompleted: true }).achievedNow).toEqual([{ code: 'Q-06', reward: 30 }])
    expect(applyQuestEvent([q('Q-06', 0, 1)], { kind: 'choice' }).quests[0].progress).toBe(0)
    expect(applyQuestEvent([q('Q-07', 0, 1)], { kind: 'choice', retryCorrect: true }).achievedNow).toEqual([{ code: 'Q-07', reward: 20 }])
    expect(applyQuestEvent([q('Q-08', 0, 1)], { kind: 'explain', score: HIGH_SCORE }).achievedNow).toEqual([{ code: 'Q-08', reward: 30 }])
    expect(applyQuestEvent([q('Q-08', 0, 1)], { kind: 'explain', score: HIGH_SCORE - 1 }).quests[0].progress).toBe(0)
    expect(applyQuestEvent([q('Q-08', 0, 1)], { kind: 'choice', score: 100 }).quests[0].progress).toBe(0)
  })
  it('MT-G03-12 クエストなし', () => {
    expect(applyQuestEvent([], { kind: 'choice' })).toEqual({ quests: [], achievedNow: [], questExp: 0 })
  })
})
