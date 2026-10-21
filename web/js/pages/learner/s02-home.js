// S-02 ホーム：EXPバー → ひとこと → デイリークエスト×3 → 今日の復習と「冒険に出る」（外部設計書 3.7）
import { getContext } from '../../core/context.js'
import { expBar } from '../../components/exp-bar.js'
import { partnerBubble, imageFor } from '../../components/partner-bubble.js'
import { questCard } from '../../components/quest-card.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatExp } from '../../logic/format.js'
import { goNextQuest } from './adventure.js'
export const M_HOME_ERROR = 'ホームを読み込めませんでした。もう一度お試しください'
export const M_START_ERROR = '冒険を始められませんでした。もう一度お試しください'
function reviewCard(review) {
  const total = review?.total ?? 0
  const detail = total > 0
    ? `<p class="numeral">${total}<small class="meta"> 件</small></p><p class="meta">択一 ${review.choice ?? 0}・説明 ${review.explain ?? 0}</p>`
    : '<p class="body">今日の復習はなし。新しい依頼に挑もう</p>'
  return `<section class="gd-card app-section" aria-labelledby="review-h"><h2 id="review-h" class="title">今日の復習</h2>${detail}
<div class="app-error-slot"></div>${button({ label: '冒険に出る', variant: 'primary', block: true, attrs: 'data-action="start"' })}</section>`
}
export async function render(root) {
  const { api, getState, setState, go, config } = getContext()
  const notice = getState().notice
  root.innerHTML = loading()
  let home
  try {
    home = await api.apiGet('/home')
  } catch (err) {
    root.innerHTML = `${errorBand(errorMessage(err, M_HOME_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root))
    return
  }
  if (notice) setState({ notice: null })
  const quests = home.quests ?? []
  setState({ questTitles: Object.fromEntries(quests.map((q) => [q.id, q.title])) })
  const release = config?.release ? `<p class="caption app-release">リリース ${escapeHtml(config.release)}</p>` : ''
  root.innerHTML = `${notice ? `<div class="app-notice" role="status">${escapeHtml(notice)}</div>` : ''}
<h1 class="app-sr-only">ホーム</h1>
${expBar({ level: home.level, exp: home.expInLevel, next: home.next, title: home.streakDays ? `連続 ${home.streakDays}日` : '' })}
<p class="meta app-total">累計 ${formatExp(home.totalExp)} EXP</p>
${partnerBubble({ name: home.message?.partnerName, persona: home.message?.persona, text: home.message?.text ?? '', imageUrl: imageFor(getState().user?.partner, home.message?.persona) })}
<section class="app-section" aria-labelledby="quest-h"><h2 id="quest-h" class="title">本日の依頼</h2>
<div class="app-stack">${quests.map((q) => questCard({ title: q.title, reward: q.reward, current: q.progress, target: q.target, done: q.done })).join('') || '<p class="meta">今日の依頼はまだ届いていない</p>'}</div></section>
${reviewCard(home.review)}${release}`
  const start = root.querySelector('[data-action="start"]')
  start.addEventListener('click', async () => {
    start.disabled = true
    setState({ adventureId: null }) // 「冒険に出る」は新しい冒険を始める（詳細設計書 6.2）
    try {
      await goNextQuest({ api, getState, setState, go })
    } catch (err) {
      root.querySelector('.app-error-slot').innerHTML = errorBand(errorMessage(err, M_START_ERROR))
      start.disabled = false
    }
  })
}
