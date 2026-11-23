import { describe, it, expect } from 'vitest'
import { pickNext, servedKey, slotOf } from '../../../../../functions/shared/domain/picker.js'
const c = (questionId) => ({ questionId, keywordId: null })
const e = (questionId, keywordId) => ({ questionId, keywordId })
const cands = ({ dueC = [], dueE = [], newC = [], newE = [], lrnC = [], lrnE = [] } = {}) => ({
  due: { choice: dueC, explain: dueE }, unlearned: { choice: newC, explain: newE }, learned: { choice: lrnC, explain: lrnE }
})
const first = () => 0
const last = () => 0.999
describe('M-G06 picker', () => {
  it('MT-G06-01 最初は択一', () => {
    expect(pickNext(cands({ dueC: [c(1)], dueE: [e(2, 20)] }), { lastKind: null, servedIds: [] })).toEqual({ kind: 'choice', questionId: 1, keywordId: null, source: 'due' })
  })
  it('MT-G06-02 交互（択一のあと）', () => {
    expect(pickNext(cands({ dueC: [c(1)], dueE: [e(2, 20)] }), { lastKind: 'choice', servedIds: [] })).toEqual({ kind: 'explain', questionId: 2, keywordId: 20, source: 'due' })
  })
  it('MT-G06-03 交互（説明のあと）', () => {
    expect(pickNext(cands({ newC: [c(4)], dueE: [e(2, 20)] }), { lastKind: 'explain', servedIds: [] })).toMatchObject({ kind: 'choice', questionId: 4, source: 'new' })
  })
  it('MT-G06-04 説明がないときは択一', () => {
    expect(pickNext(cands({ newC: [c(4)] }), { lastKind: 'choice', servedIds: [] })).toMatchObject({ kind: 'choice', questionId: 4 })
  })
  it('MT-G06-05 枠ごとの優先順位（新規の枠は未学習、復習の枠は復習を先に）', () => {
    const all = cands({ dueC: [c(9)], newC: [c(1)], lrnC: [c(2)] })
    expect(pickNext(all, { index: 0, startWith: 'new', rand: first })).toMatchObject({ questionId: 1, source: 'new' })
    expect(pickNext(all, { index: 1, startWith: 'new', rand: first })).toMatchObject({ questionId: 9, source: 'due' })
    expect(pickNext(all, { index: 0, startWith: 'review', rand: first })).toMatchObject({ questionId: 9, source: 'due' })
    // 枠の出どころが空なら、もう片方から補う
    expect(pickNext(cands({ dueC: [c(9)], lrnC: [c(2)] }), { index: 0, startWith: 'new' })).toMatchObject({ questionId: 9, source: 'due' })
    expect(pickNext(cands({ newC: [c(1)], lrnC: [c(2)] }), { index: 0, startWith: 'review' })).toMatchObject({ questionId: 1, source: 'new' })
  })
  it('MT-G06-06 学習済みからの出題', () => {
    expect(pickNext(cands({ lrnC: [c(7), c(3)] }), { lastKind: null, servedIds: [], rand: first })).toEqual({ kind: 'choice', questionId: 7, keywordId: null, source: 'learned' })
  })
  it('MT-G06-07 出したものは除く', () => {
    expect(pickNext(cands({ dueC: [c(5), c(8)] }), { lastKind: null, servedIds: [servedKey('choice', c(5))] })).toMatchObject({ questionId: 8 })
  })
  it('MT-G06-08 出せるものがない', () => {
    expect(pickNext(cands(), { lastKind: null, servedIds: [] })).toBeNull()
    expect(pickNext({}, {})).toBeNull()
    expect(pickNext(cands({ dueC: [c(5)], newE: [e(6, 60)] }), { lastKind: 'explain', servedIds: ['choice:5', 'explain:60'] })).toBeNull()
  })
  it('MT-G06-09 キーワードのない説明候補', () => {
    expect(pickNext(cands({ dueE: [e(2, null), e(3, 30)] }), { lastKind: 'choice', servedIds: [] })).toMatchObject({ kind: 'explain', questionId: 3, keywordId: 30 })
    expect(pickNext(cands({ dueE: [e(2, null)], newC: [c(5)] }), { lastKind: 'choice' })).toMatchObject({ kind: 'choice', questionId: 5 })
    expect(pickNext(cands({ newC: [c(5)] }))).toMatchObject({ kind: 'choice' })
  })
  it('MT-G06-10 枠の並び（5問で復習は2問か3問）', () => {
    expect([0, 1, 2, 3, 4].map((i) => slotOf(i, 'new'))).toEqual(['new', 'review', 'new', 'review', 'new'])
    expect([0, 1, 2, 3, 4].map((i) => slotOf(i, 'review'))).toEqual(['review', 'new', 'review', 'new', 'review'])
    expect(slotOf(0)).toBe('new')
  })
  it('MT-G06-11 復習がたまっていても新規がまざる', () => {
    const many = cands({ dueC: [1, 2, 3, 4, 5, 6].map(c), newC: [11, 12, 13].map(c) })
    for (const startWith of ['new', 'review']) {
      const served = []
      const sources = []
      for (let index = 0; index < 5; index++) {
        const p = pickNext(many, { index, startWith, servedIds: served, allowExplain: false })
        served.push(servedKey('choice', p))
        sources.push(p.source)
      }
      const reviews = sources.filter((s) => s === 'due').length
      expect(reviews).toBe(startWith === 'review' ? 3 : 2)
      expect(sources.filter((s) => s === 'new')).toHaveLength(5 - reviews)
    }
  })
  it('MT-G06-12 同じ出どころの中ではランダムに選ぶ', () => {
    const list = cands({ dueC: [c(1), c(2), c(3)] })
    expect(pickNext(list, { rand: first })).toMatchObject({ questionId: 1 })
    expect(pickNext(list, { rand: last })).toMatchObject({ questionId: 3 })
    expect(pickNext(list, { rand: () => 0.5 })).toMatchObject({ questionId: 2 })
  })
  it('MT-G06-13 説明問題を出さない冒険', () => {
    expect(pickNext(cands({ dueC: [c(1)], dueE: [e(2, 20)] }), { lastKind: 'choice', allowExplain: false })).toMatchObject({ kind: 'choice', questionId: 1 })
    expect(pickNext(cands({ dueE: [e(2, 20)] }), { lastKind: 'choice', allowExplain: false })).toBeNull()
  })
  it('MT-G06-14 同じ冒険で出した問題は後回し', () => {
    const list = cands({ newE: [e(4, 40), e(5, 50)] })
    expect(pickNext(list, { lastKind: 'choice', usedQuestionIds: [4], rand: first })).toMatchObject({ questionId: 5 })
    // ほかになければ同じ問題の別の種類でも出す
    expect(pickNext(cands({ newE: [e(4, 40)] }), { lastKind: 'choice', usedQuestionIds: [4] })).toMatchObject({ kind: 'explain', questionId: 4 })
  })
})
