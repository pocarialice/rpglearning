import { describe, it, expect } from 'vitest'
import { pickNext, servedKey } from '../../../../../functions/shared/domain/picker.js'
const c = (questionId) => ({ questionId, keywordId: null })
const e = (questionId, keywordId) => ({ questionId, keywordId })
const cands = ({ dueC = [], dueE = [], newC = [], newE = [], lrnC = [], lrnE = [] } = {}) => ({
  due: { choice: dueC, explain: dueE }, unlearned: { choice: newC, explain: newE }, learned: { choice: lrnC, explain: lrnE }
})
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
  it('MT-G06-05 優先順位', () => {
    expect(pickNext(cands({ dueC: [c(9), c(3)], newC: [c(1)], lrnC: [c(2)] }), { lastKind: null, servedIds: [] })).toMatchObject({ questionId: 9, source: 'due' })
    expect(pickNext(cands({ newC: [c(1)], lrnC: [c(2)] }), { lastKind: null, servedIds: [] })).toMatchObject({ questionId: 1, source: 'new' })
  })
  it('MT-G06-06 学習済みからの出題', () => {
    expect(pickNext(cands({ lrnC: [c(7), c(3)] }), { lastKind: null, servedIds: [] })).toEqual({ kind: 'choice', questionId: 7, keywordId: null, source: 'learned' })
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
})
