// 冒険（10問）の進め方。A-07 で次の問題を取り、種類に応じて S-04／S-05 へ移る
export const QUEST_PATH = { choice: '/quest/choice', explain: '/quest/explain' }
export const NOTICE_DONE = '10問の冒険を終えた。おつかれさま'
export const NOTICE_NO_QUESTION = 'いま出せる問題がない。また明日、掲示板を見に来よう'
export async function goNextQuest({ api, getState, setState, go }) {
  const { adventureId } = getState()
  const qs = adventureId ? `?adventureId=${encodeURIComponent(adventureId)}` : ''
  const next = await api.apiGet(`/quests/next${qs}`)
  if (next.done) {
    setState({ adventureId: null, quest: null, notice: next.reason === 'NO_QUESTION' ? NOTICE_NO_QUESTION : NOTICE_DONE })
    return go('/home')
  }
  setState({ adventureId: next.adventureId, quest: next, result: null })
  go(QUEST_PATH[next.kind])
}
// 「3 / 10問」と復習の印
export function progressLine(quest) {
  const review = quest.isReview ? '<span class="app-chip">復習</span>' : ''
  return `<p class="meta app-progress">${Number(quest.index)} / ${Number(quest.total)}問${review}</p>`
}
