// S-17 コースの実績（詳細）：#/profile/course?id=c_3
// 実績（累積の学習時間がいちばん上）→ 苦手な問題 → パートナーのコメント（開いたときに作る。待つ間は「…」）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { partnerBubble, partnerName, imageFor } from '../../components/partner-bubble.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { aiText, escapeHtml, formatDate, formatDuration, formatPct } from '../../logic/format.js'
import { backButton } from './s16-course-records.js'
export const M_RECORD_ERROR = 'コースの実績を読み込めませんでした。もう一度お試しください'
export const M_COMMENT_ERROR = 'パートナーのコメントを読み込めませんでした'
export const M_COMMENT_EMPTY = 'このコースの問題を解くと、パートナーがコメントしてくれます'
export const M_WEAK_EMPTY = 'いま苦手な問題はありません'
const KIND = { choice: '択一', explain: '説明' }
const stat = (label, value, wide = false) => `<div class="app-stat${wide ? ' app-stat-wide' : ''}"><span class="meta">${label}</span><span class="numeral">${value}</span></div>`
const unit = (n, u) => `${Number(n) || 0}<small class="meta"> ${u}</small>`
function weakItem(w) {
  const note = w.kind === 'explain'
    ? [w.score === null || w.score === undefined ? '' : `直近 ${Number(w.score)}点`, w.missingPoints?.length ? `足りない観点：${w.missingPoints.join('、')}` : ''].filter(Boolean).join('・')
    : `${Number(w.missCount)}回まちがい`
  return `<li><span class="app-chip">${KIND[w.kind] ?? ''}</span><span>${escapeHtml(w.label)}${note ? `（${escapeHtml(note)}）` : ''}</span></li>`
}
async function loadComment(slot, { api, id, partner }) {
  const persona = partner?.persona ?? 'encourage'
  const bubble = (opts) => partnerBubble({ name: partnerName(partner), persona, imageUrl: imageFor(partner, persona), ...opts })
  slot.innerHTML = bubble({ thinking: true })
  let res
  try {
    res = await api.apiGet(`/me/courses/${encodeURIComponent(id)}/comment`)
  } catch (err) {
    slot.innerHTML = `${errorBand(errorMessage(err, M_COMMENT_ERROR))}${button({ label: 'もう一度読み込む', size: 'sm', attrs: 'data-action="comment-reload"' })}`
    slot.querySelector('[data-action="comment-reload"]').addEventListener('click', () => loadComment(slot, { api, id, partner }))
    return
  }
  const c = res.comment
  if (!c) {
    slot.innerHTML = `<p class="meta app-center">${M_COMMENT_EMPTY}</p>`
    return
  }
  const p = { persona: c.persona, partnerName: c.partnerName }
  slot.innerHTML = partnerBubble({ name: partnerName(p), persona: c.persona, imageUrl: imageFor(partner, c.persona), html: aiText(c.text) })
}
export async function render(root, params = {}) {
  const { api, go, getState } = getContext()
  const id = params.id
  if (!id) return go('/profile/courses')
  root.innerHTML = loading()
  let d
  try {
    d = await api.apiGet(`/me/courses/${encodeURIComponent(id)}`)
  } catch (err) {
    root.innerHTML = `${backButton('コースごとの実績へ戻る', '/profile/courses')}${errorBand(errorMessage(err, M_RECORD_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-go]').addEventListener('click', (e) => go(e.currentTarget.dataset.go))
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root, params))
    return
  }
  const dates = [d.enrolledOn ? `受講開始 ${formatDate(d.enrolledOn)}` : '', `最後の学習 ${d.lastStudiedOn ? formatDate(d.lastStudiedOn) : 'まだありません'}`].filter(Boolean).join('・')
  const avg = d.explain.avgScore === null || d.explain.avgScore === undefined ? '' : `（平均 ${Number(d.explain.avgScore)}点）`
  root.innerHTML = `${backButton('コースごとの実績へ戻る', '/profile/courses')}
<div class="app-record-head"><h1 class="title app-course-title">${escapeHtml(d.name)}</h1>${d.current ? '<span class="app-chip">受講中</span>' : ''}</div>
<p class="meta app-course-dates">${escapeHtml(dates)}</p>
<section class="gd-card app-section" aria-labelledby="record-h"><h2 id="record-h" class="title">実績</h2>
<div class="app-stats">${stat('累積の学習時間', escapeHtml(formatDuration(d.studySeconds)), true)}${stat('冒険の回数', unit(d.adventureCount, '回'))}${stat('解いた問題', unit(d.answerCount, '問'))}${stat('正答率', formatPct(d.correctPct))}${stat('網羅率', formatPct(d.coveragePct))}${stat('習得済み', unit(d.mastered, '問'))}${stat('今日の復習', unit(d.dueToday, '問'))}</div>
<ul class="app-breakdown body"><li><span>択一</span><span>${Number(d.choice.correct)} / ${Number(d.choice.count)}問 正解</span></li><li><span>説明</span><span>${Number(d.explain.passed)} / ${Number(d.explain.count)}問 合格${avg}</span></li></ul></section>
<section class="gd-card app-section" aria-labelledby="weak-h"><h2 id="weak-h" class="title">苦手な問題</h2>
${d.weak.length ? `<ul class="app-weak body">${d.weak.map(weakItem).join('')}</ul>` : `<p class="meta">${M_WEAK_EMPTY}</p>`}</section>
<section class="app-section" aria-labelledby="comment-h"><h2 id="comment-h" class="title">パートナーのコメント</h2>
<div class="app-comment-slot"></div><p class="meta">このコースの学習全体をもとに、開いたときに作ります</p></section>`
  root.querySelector('[data-go]').addEventListener('click', (e) => go(e.currentTarget.dataset.go))
  await loadComment(root.querySelector('.app-comment-slot'), { api, id, partner: getState().user?.partner })
}
