// 出題の選び方（詳細設計書 3.5 M-G06）
const SOURCES = [['due', 'due'], ['unlearned', 'new'], ['learned', 'learned']]
const other = (kind) => (kind === 'choice' ? 'explain' : 'choice')
export function servedKey(kind, row) {
  return kind === 'choice' ? `choice:${row.questionId}` : `explain:${row.keywordId}`
}
function pickInKind(candidates, kind, served) {
  for (const [key, source] of SOURCES) {
    const rows = candidates[key]?.[kind] ?? []
    const hit = rows.find((r) => (kind === 'choice' || r.keywordId != null) && !served.has(servedKey(kind, r)))
    if (hit) return { kind, questionId: hit.questionId, keywordId: kind === 'explain' ? hit.keywordId : null, source }
  }
  return null
}
// candidates = { due: {choice:[], explain:[]}, unlearned: {...}, learned: {...} }
export function chooseKind(lastKind) {
  return lastKind === 'choice' ? 'explain' : 'choice'
}
export function pickNext(candidates, { lastKind = null, servedIds = [] } = {}) {
  const served = new Set(servedIds)
  const first = chooseKind(lastKind)
  return pickInKind(candidates, first, served) ?? pickInKind(candidates, other(first), served)
}
