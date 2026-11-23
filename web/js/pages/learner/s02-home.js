// S-02 ホーム：EXPバー → ひとこと → 受講中のコース → デイリークエスト×3 → 冒険の準備（説明問題を出すか・「冒険に出る」）（外部設計書 3.7）
// 復習の数は出さない。出題の中で新規とまぜて出す
import { getContext } from '../../core/context.js'
import { expBar } from '../../components/exp-bar.js'
import { partnerBubble, imageFor } from '../../components/partner-bubble.js'
import { questCard } from '../../components/quest-card.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatExp, formatPct, aiText } from '../../logic/format.js'
import { goNextQuest } from './adventure.js'
export const M_HOME_ERROR = 'ホームを読み込めませんでした。もう一度お試しください'
export const M_START_ERROR = '冒険を始められませんでした。もう一度お試しください'
// 受講中のコース：名前・資格・問題数・網羅率と「コースを変える」
function courseCard(course) {
  if (!course) return ''
  const pct = Math.min(100, Math.max(0, Number(course.coveragePct) || 0))
  return `<section class="gd-card app-section" aria-labelledby="course-h"><h2 id="course-h" class="title">受講中のコース</h2>
<div class="app-course-head"><p class="body"><b>${escapeHtml(course.name)}</b></p><span class="app-chip">受講中</span></div>
<p class="meta">${escapeHtml(course.certification)}・問題 ${Number(course.questionCount)}問・網羅率 ${formatPct(course.coveragePct)}</p>
<div class="gd-track" role="progressbar" aria-label="網羅率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="gd-fill" style="width:${pct}%"></div></div>
${button({ label: 'コースを変える', variant: 'quiet', block: true, attrs: 'data-action="courses"' })}</section>`
}
// 「説明問題も出す」の選択は、この端末に覚えておく（保存できないときは毎回「出す」から始める）
export const EXPLAIN_PREF_KEY = 'rpg.adventure.includeExplain'
export function loadExplainPref(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(EXPLAIN_PREF_KEY) !== '0'
  } catch {
    return true
  }
}
export function saveExplainPref(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(EXPLAIN_PREF_KEY, on ? '1' : '0')
  } catch { /* 保存できなくても冒険は始められる */ }
}
function adventureCard(includeExplain) {
  return `<section class="gd-card app-section" aria-labelledby="adventure-h"><h2 id="adventure-h" class="title">冒険の準備</h2>
<label class="app-radio"><input type="checkbox" data-explain${includeExplain ? ' checked' : ''}> 説明問題も出す</label>
<p class="meta">時間がないときは外すと、択一だけの5問になる</p>
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
${partnerBubble({ name: home.message?.partnerName, persona: home.message?.persona, html: aiText(home.message?.text), imageUrl: imageFor(getState().user?.partner, home.message?.persona) })}
${courseCard(home.course)}
<section class="app-section" aria-labelledby="quest-h"><h2 id="quest-h" class="title">本日の依頼</h2>
<div class="app-stack">${quests.map((q) => questCard({ title: q.title, reward: q.reward, current: q.progress, target: q.target, done: q.done })).join('') || '<p class="meta">今日の依頼はまだ届いていない</p>'}</div></section>
${adventureCard(loadExplainPref())}${release}`
  root.querySelector('[data-action="courses"]')?.addEventListener('click', () => go('/courses'))
  const explain = root.querySelector('[data-explain]')
  explain.addEventListener('change', () => saveExplainPref(explain.checked))
  const start = root.querySelector('[data-action="start"]')
  start.addEventListener('click', async () => {
    start.disabled = true
    setState({ adventureId: null }) // 「冒険に出る」は新しい冒険を始める（詳細設計書 6.2）
    try {
      await goNextQuest({ api, getState, setState, go }, { includeExplain: explain.checked })
    } catch (err) {
      root.querySelector('.app-error-slot').innerHTML = errorBand(errorMessage(err, M_START_ERROR))
      start.disabled = false
    }
  })
}
