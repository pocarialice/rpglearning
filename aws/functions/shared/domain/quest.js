// デイリークエスト（詳細設計書 3.5 M-G03）
export const QUEST_DEFS = {
  'Q-01': { target: 5, reward: 20, matches: (ev) => ev.kind === 'choice' },
  'Q-02': { target: 3, reward: 20, matches: (ev) => ev.kind === 'choice' && !!ev.correct },
  'Q-03': { target: 1, reward: 30, matches: (ev) => ev.kind === 'explain' && !!ev.passed },
  'Q-04': { target: null, reward: 30, matches: (ev) => !!ev.isReview },
  'Q-05': { target: 3, reward: 20, matches: (ev) => !!ev.isNew }
}
const OPTIONAL = ['Q-01', 'Q-02', 'Q-03', 'Q-05']
// 残りの候補から重複なく n 個を選ぶ（rand は 0 以上 1 未満を返す関数）
function pickWithout(pool, n, rand) {
  const rest = [...pool]
  const picked = []
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.floor(rand() * rest.length), rest.length - 1)
    picked.push(rest.splice(idx, 1)[0])
  }
  return picked
}
export function pickDailyQuests(dueCount, rand = Math.random) {
  const codes = dueCount > 0 ? ['Q-04', ...pickWithout(OPTIONAL, 2, rand)] : pickWithout(OPTIONAL, 3, rand)
  return codes.map((code) => ({ code, target: code === 'Q-04' ? dueCount : QUEST_DEFS[code].target }))
}
// 未達成のクエストを進め、今回達成したものを achievedNow に入れる
export function applyQuestEvent(quests, ev) {
  const achievedNow = []
  const updated = quests.map((q) => {
    const def = QUEST_DEFS[q.code]
    if (q.achieved || !def.matches(ev)) return { ...q }
    const progress = Math.min(q.progress + 1, q.target)
    const achieved = progress >= q.target
    if (achieved) achievedNow.push({ code: q.code, reward: def.reward })
    return { ...q, progress, achieved }
  })
  return { quests: updated, achievedNow, questExp: achievedNow.reduce((s, a) => s + a.reward, 0) }
}
