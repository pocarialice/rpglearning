// S-07 週間ランキング：見出し（コース名・集計期間・リセットまで）→ 上位10名と自分の行 → 過去週の切り替え（外部設計書 3.7・4.6）
import { getContext } from '../../core/context.js'
import { rankingRow } from '../../components/ranking-row.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDate } from '../../logic/format.js'
export const M_RANKING_ERROR = 'ランキングを読み込めませんでした。もう一度お試しください'
const shortDate = (d) => formatDate(d).slice(5)
// 「今週」は week を付けずに開く。過去週は締めた週（weekly_rankings）だけが並ぶ
function weekButtons(current, weeks) {
  const list = [[null, '今週'], ...weeks.map((w) => [w, `${shortDate(w)}〜`])]
  return list.map(([w, label]) => {
    const on = w === current
    return button({ label, size: 'sm', variant: on ? 'primary' : 'secondary', attrs: `data-week="${escapeHtml(w ?? '')}" aria-pressed="${on}"` })
  }).join('')
}
export async function render(root, params = {}) {
  const { api, go } = getContext()
  root.innerHTML = loading()
  let data
  try {
    data = await api.apiGet(params.week ? `/rankings?week=${encodeURIComponent(params.week)}` : '/rankings')
  } catch (err) {
    root.innerHTML = `${errorBand(errorMessage(err, M_RANKING_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root, params))
    return
  }
  const isThisWeek = !params.week
  const rows = data.rows ?? []
  // API は上位10名のあとに、圏外の自分の行を1つ足して返す
  const top = rows.slice(0, 10)
  const mine = rows.slice(10)
  const row = (r) => rankingRow({ rank: r.rank, name: r.nickname, exp: r.weeklyExp, isMe: r.isMe })
  const table = rows.length === 0
    ? `<p class="body">${isThisWeek ? 'この週はまだ誰もEXPを獲得していない。最初の1問で1位になろう' : 'この週の記録はない'}</p>`
    : `${top.map(row).join('')}${mine.length ? `<p class="app-rank-gap" aria-hidden="true">⋮</p>${mine.map(row).join('')}` : ''}`
  const me = data.me ? `あなたは ${Number(data.me.rank)}位` : 'あなたはまだランキングに入っていない'
  root.innerHTML = `<h1 class="display">週間ランキング</h1>
<section class="gd-card app-section" aria-labelledby="rank-h"><h2 id="rank-h" class="title">${escapeHtml(data.courseName ?? 'コース')}</h2>
<p class="meta">${escapeHtml(formatDate(data.weekStart))}（月）〜${escapeHtml(shortDate(data.weekEnd))}（日）・<span class="app-nowrap">${isThisWeek ? `リセットまで あと${Number(data.daysToReset)}日` : '確定済み'}</span></p>
<p class="label">${me}</p></section>
<section class="gd-card app-section app-rank-list" aria-label="順位表">${table}</section>
<section class="app-section" aria-labelledby="weeks-h"><h2 id="weeks-h" class="label">ほかの週を見る</h2>
<div class="app-weeks">${weekButtons(isThisWeek ? null : data.weekStart, data.weeks ?? [])}</div></section>`
  root.querySelector('.app-weeks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-week]')
    if (!b || b.getAttribute('aria-pressed') === 'true') return
    go(b.dataset.week ? `/ranking?week=${b.dataset.week}` : '/ranking')
  })
}
