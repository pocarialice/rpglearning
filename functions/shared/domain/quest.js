// デイリークエスト（詳細設計書 3.5 M-G03）。Q-04（今日の復習をすべて終える）は廃止した
export const QUEST_DEFS = {
  'Q-01': { target: 5, reward: 20, matches: (ev) => ev.kind === 'choice' },
  'Q-02': { target: 3, reward: 20, matches: (ev) => ev.kind === 'choice' && !!ev.correct },
  'Q-03': { target: 1, reward: 30, matches: (ev) => ev.kind === 'explain' && !!ev.passed },
  'Q-05': { target: 3, reward: 20, matches: (ev) => !!ev.isNew },
  'Q-06': { target: 1, reward: 30, matches: (ev) => !!ev.adventureCompleted },
  'Q-07': { target: 1, reward: 20, matches: (ev) => !!ev.retryCorrect },
  'Q-08': { target: 1, reward: 30, matches: (ev) => ev.kind === 'explain' && Number(ev.score) >= HIGH_SCORE }
}
// Q-08 の基準点
export const HIGH_SCORE = 80
export const QUEST_CODES = Object.keys(QUEST_DEFS)
// 説明問題でしか進まないクエスト。説明を出さない冒険もあるので、1日に1つまでにする
export const EXPLAIN_ONLY = ['Q-03', 'Q-08']
export const DAILY_COUNT = 3
// 残りの候補から重複なく n 個を選ぶ（rand は 0 以上 1 未満を返す関数）。説明だけのクエストは1つまで
function pickWithout(pool, n, rand) {
  let rest = [...pool]
  const picked = []
  for (let i = 0; i < n && rest.length > 0; i++) {
    const idx = Math.min(Math.floor(rand() * rest.length), rest.length - 1)
    const code = rest.splice(idx, 1)[0]
    picked.push(code)
    if (EXPLAIN_ONLY.includes(code)) rest = rest.filter((c) => !EXPLAIN_ONLY.includes(c))
  }
  return picked
}
export function pickDailyQuests(rand = Math.random) {
  return pickWithout(QUEST_CODES, DAILY_COUNT, rand).map((code) => ({ code, target: QUEST_DEFS[code].target }))
}
// 未達成のクエストを進め、今回達成したものを achievedNow に入れる。定義のなくなったクエスト（Q-04 など）は進めない
export function applyQuestEvent(quests, ev) {
  const achievedNow = []
  const updated = quests.map((q) => {
    const def = QUEST_DEFS[q.code]
    if (!def || q.achieved || !def.matches(ev)) return { ...q }
    const progress = Math.min(q.progress + 1, q.target)
    const achieved = progress >= q.target
    if (achieved) achievedNow.push({ code: q.code, reward: def.reward })
    return { ...q, progress, achieved }
  })
  return { quests: updated, achievedNow, questExp: achievedNow.reduce((s, a) => s + a.reward, 0) }
}
