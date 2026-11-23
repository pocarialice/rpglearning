import { describe, it, expect } from 'vitest'
import { buildAnswerOutcome } from '../../../../../functions/shared/domain/answer-flow.js'
const T = '2026-10-20'
const q = (code, progress, target, achieved = false) => ({ code, progress, target, achieved })
const base = { today: T, user: { totalExp: 330 }, quests: [], ownedBadges: [], masteredCountBefore: 0 }
const prog = (r, code) => r.quests.find((x) => x.code === code).progress
describe('M-G07 answer-flow', () => {
  it('MT-G07-01 初めての択一に正解', () => {
    const r = buildAnswerOutcome({ ...base, kind: 'choice', correct: true, reviewItem: null, quests: [q('Q-05', 0, 3)] })
    expect(r.review.stage).toBe(1)
    expect(r.exp.gained).toBe(10)
    expect(prog(r, 'Q-05')).toBe(1)
    expect(r.exp.levelUp).toBe(false)
  })
  it('MT-G07-02 復習の択一に正解', () => {
    const r = buildAnswerOutcome({ ...base, kind: 'choice', correct: true, reviewItem: { stage: 2, nextReviewOn: T, answerCount: 2, correctCount: 2 }, quests: [q('Q-07', 0, 1), q('Q-05', 0, 3)] })
    expect(r.review.stage).toBe(3)
    expect(r.exp.gained).toBe(15)
    expect(prog(r, 'Q-07')).toBe(0)
    expect(prog(r, 'Q-05')).toBe(0)
  })
  it('MT-G07-03 復習の説明に合格', () => {
    const r = buildAnswerOutcome({ ...base, kind: 'explain', correct: true, reviewItem: { stage: 1, nextReviewOn: T }, quests: [q('Q-03', 0, 1)] })
    expect(r.exp.gained).toBe(45)
    expect(r.achievedNow).toEqual([{ code: 'Q-03', reward: 30 }])
    expect(r.exp.questExp).toBe(30)
    expect(r.exp.totalExp).toBe(330 + 45 + 30)
  })
  it('MT-G07-04 不正解', () => {
    const r = buildAnswerOutcome({ ...base, kind: 'choice', correct: false, reviewItem: { stage: 3, nextReviewOn: T }, quests: [q('Q-01', 0, 5)] })
    expect(r.review.stage).toBe(1)
    expect(r.exp.gained).toBe(0)
    expect(prog(r, 'Q-01')).toBe(1)
  })
  it('MT-G07-05 正解でレベルアップ', () => {
    const r = buildAnswerOutcome({ ...base, user: { totalExp: 95 }, kind: 'choice', correct: true, reviewItem: null })
    expect(r.exp).toMatchObject({ level: 2, expInLevel: 5, levelUp: true })
  })
  it('MT-G07-06 クエスト報酬だけでレベルアップ', () => {
    const r = buildAnswerOutcome({ ...base, user: { totalExp: 90 }, kind: 'choice', correct: false, reviewItem: null, quests: [q('Q-01', 4, 5)] })
    expect(r.exp).toMatchObject({ gained: 0, questExp: 20, totalExp: 110, levelUp: true })
  })
  it('MT-G07-07 習得でバッジ', () => {
    const r = buildAnswerOutcome({ ...base, masteredCountBefore: 9, kind: 'choice', correct: true, reviewItem: { stage: 5, nextReviewOn: T } })
    expect(r.review.mastered).toBe(true)
    expect(r.newBadges).toEqual(['mastery_bronze'])
  })
  it('MT-G07-08 習得済みの問題に正解', () => {
    const r = buildAnswerOutcome({ ...base, kind: 'choice', correct: true, reviewItem: { stage: 6, nextReviewOn: null }, quests: [q('Q-04', 0, 3)] })
    expect(r.exp.gained).toBe(10)
    expect(r.review.stage).toBe(6)
    expect(prog(r, 'Q-04')).toBe(0)
  })
  it('MT-G07-09 まちがえたことのある問題に正解（Q-07）', () => {
    const wrongBefore = { stage: 1, nextReviewOn: T, answerCount: 3, correctCount: 1 }
    const r = buildAnswerOutcome({ ...base, kind: 'choice', correct: true, reviewItem: wrongBefore, quests: [q('Q-07', 0, 1)] })
    expect(r.achievedNow).toEqual([{ code: 'Q-07', reward: 20 }])
    expect(prog(buildAnswerOutcome({ ...base, kind: 'choice', correct: false, reviewItem: wrongBefore, quests: [q('Q-07', 0, 1)] }), 'Q-07')).toBe(0)
    expect(prog(buildAnswerOutcome({ ...base, kind: 'choice', correct: true, reviewItem: null, quests: [q('Q-07', 0, 1)] }), 'Q-07')).toBe(0)
  })
  it('MT-G07-10 説明で80点以上（Q-08）', () => {
    const run = (score) => buildAnswerOutcome({ ...base, kind: 'explain', correct: score >= 60, score, reviewItem: null, quests: [q('Q-08', 0, 1)] })
    expect(run(80).achievedNow).toEqual([{ code: 'Q-08', reward: 30 }])
    expect(prog(run(79), 'Q-08')).toBe(0)
  })
  it('MT-G07-11 冒険をやりとげる（Q-06）', () => {
    const run = (adventureCompleted) => buildAnswerOutcome({ ...base, kind: 'choice', correct: false, reviewItem: null, adventureCompleted, quests: [q('Q-06', 0, 1)] })
    expect(run(true).achievedNow).toEqual([{ code: 'Q-06', reward: 30 }])
    expect(prog(run(false), 'Q-06')).toBe(0)
  })
})
