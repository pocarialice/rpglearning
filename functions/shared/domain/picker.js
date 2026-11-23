// 出題の選び方（詳細設計書 3.5 M-G06）
// 1回の冒険（5問）を「復習の枠」と「新規の枠」に分け、交互に並べる。どちらから始めるかは冒険ごとに変わる（startWith）
// 枠の種類で先に探す出どころを変え、見つからなければ残りの出どころから補う。同じ出どころの中ではランダムに選ぶ
const ORDER = {
  review: [['due', 'due'], ['unlearned', 'new'], ['learned', 'learned']],
  new: [['unlearned', 'new'], ['due', 'due'], ['learned', 'learned']]
}
const other = (kind) => (kind === 'choice' ? 'explain' : 'choice')
export function servedKey(kind, row) {
  return kind === 'choice' ? `choice:${row.questionId}` : `explain:${row.keywordId}`
}
// index（0始まり）番目の枠。startWith の枠から始めて交互にする（5問なら 3:2 か 2:3）
export function slotOf(index, startWith = 'new') {
  const first = startWith === 'review' ? 'review' : 'new'
  return index % 2 === 0 ? first : (first === 'review' ? 'new' : 'review')
}
function pickInKind(candidates, kind, { served, usedQuestions, order, rand }) {
  for (const avoidSameQuestion of [true, false]) {
    for (const [key, source] of order) {
      const rows = (candidates[key]?.[kind] ?? []).filter((r) => (kind === 'choice' || r.keywordId != null)
        && !served.has(servedKey(kind, r)) && !(avoidSameQuestion && usedQuestions.has(r.questionId)))
      if (rows.length === 0) continue
      const hit = rows[Math.min(Math.floor(rand() * rows.length), rows.length - 1)]
      return { kind, questionId: hit.questionId, keywordId: kind === 'explain' ? hit.keywordId : null, source }
    }
  }
  return null
}
// candidates = { due: {choice:[], explain:[]}, unlearned: {...}, learned: {...} }
export function chooseKind(lastKind) {
  return lastKind === 'choice' ? 'explain' : 'choice'
}
// allowExplain=false のときは択一だけ。usedQuestionIds は今回の冒険で出した問題（択一・説明で同じ問題が続かないようにする）
export function pickNext(candidates, {
  lastKind = null, servedIds = [], usedQuestionIds = [], index = 0, startWith = 'new', allowExplain = true, rand = Math.random
} = {}) {
  const opts = { served: new Set(servedIds), usedQuestions: new Set(usedQuestionIds), order: ORDER[slotOf(index, startWith)], rand }
  if (!allowExplain) return pickInKind(candidates, 'choice', opts)
  const first = chooseKind(lastKind)
  return pickInKind(candidates, first, opts) ?? pickInKind(candidates, other(first), opts)
}
