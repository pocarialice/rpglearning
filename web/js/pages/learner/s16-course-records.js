// S-16 コースごとの実績（一覧）：全コースの累計の学習時間 → コースのカード（学習時間・正答率・網羅率・最後の学習日）
// カードを押すと S-17 へ。プロフィール（S-08）の下部メニューから開く
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDate, formatDuration, formatPct } from '../../logic/format.js'
export const M_RECORDS_ERROR = 'コースごとの実績を読み込めませんでした。もう一度お試しください'
export const M_RECORDS_EMPTY = 'まだ受講したコースがありません'
export const backButton = (label, path) => `<div class="app-back">${button({ label: `‹ ${label}`, variant: 'quiet', size: 'sm', attrs: `data-go="${escapeHtml(path)}"` })}</div>`
const num = (label, value) => `<div><span class="meta">${label}</span><span class="label">${value}</span></div>`
function row(c) {
  const cover = Math.min(Math.max(Number(c.coveragePct) || 0, 0), 100)
  return `<li class="gd-card"><a class="app-course-row" href="#/profile/course?id=${encodeURIComponent(c.id)}">
<span class="app-record-head app-course-link"><span class="label app-course-name">${escapeHtml(c.name)}</span>${c.current ? '<span class="app-chip">受講中</span>' : ''}</span>
<span class="app-course-nums">${num('学習時間', escapeHtml(formatDuration(c.studySeconds)))}${num('正答率', formatPct(c.correctPct))}${num('網羅率', formatPct(c.coveragePct))}</span>
<span class="app-course-bar" role="img" aria-label="網羅率 ${formatPct(c.coveragePct)}"><i style="width:${cover}%"></i></span>
<span class="meta">最後の学習 ${c.lastStudiedOn ? escapeHtml(formatDate(c.lastStudiedOn)) : 'まだありません'}</span></a></li>`
}
export async function render(root) {
  const { api, go } = getContext()
  root.innerHTML = loading()
  let res
  try {
    res = await api.apiGet('/me/courses')
  } catch (err) {
    root.innerHTML = `${errorBand(errorMessage(err, M_RECORDS_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root))
    return
  }
  const list = res.courses.length
    ? `<ul class="app-course-list">${res.courses.map(row).join('')}</ul><p class="meta app-center">受講したコースと、解答したことのあるコースを表示します</p>`
    : `<p class="gd-card meta app-center">${M_RECORDS_EMPTY}</p>`
  root.innerHTML = `${backButton('プロフィールへ戻る', '/profile')}
<h1 class="display">コースごとの実績</h1>
<div class="app-course-total"><span class="meta">全コースの累計の学習時間</span><span class="numeral">${escapeHtml(formatDuration(res.totalStudySeconds))}</span></div>
${list}`
  root.querySelector('[data-go]').addEventListener('click', (e) => go(e.currentTarget.dataset.go))
}
