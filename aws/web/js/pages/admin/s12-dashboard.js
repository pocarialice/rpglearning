// S-12 学習状況ダッシュボード：担当コースの集計と受講者一覧。並べ替えは画面で行い、CSVは Blob にして保存する（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDateTime, formatPct } from '../../logic/format.js'
import { pickCourse, courseSelect, bindCourseSelect, M_NO_COURSE } from './_course.js'
export const M_DASHBOARD_ERROR = '学習状況を読み込めませんでした。もう一度お試しください'
export const M_CSV_ERROR = 'CSVを出力できませんでした。もう一度お試しください'
export const COLUMNS = [
  { key: 'fullName', label: '氏名', type: 'text' },
  { key: 'nickname', label: 'ニックネーム', type: 'text' },
  { key: 'coveragePct', label: '網羅率', type: 'num', show: formatPct },
  { key: 'correctPct', label: '正答率', type: 'num', show: formatPct },
  { key: 'lastLoginAt', label: '最終ログイン', type: 'text', show: (v) => (v ? formatDateTime(v) : '-') },
  { key: 'logins7d', label: '直近7日のログイン', type: 'num', show: (v) => (v === null || v === undefined ? '-' : `${v}回`) }
]
// 値がないもの（null）はどちらの向きでも最後に並べる
export function sortLearners(rows, key, dir) {
  const col = COLUMNS.find((c) => c.key === key) ?? COLUMNS[0]
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = a[col.key]
    const y = b[col.key]
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1
    if (y === null || y === undefined) return -1
    return sign * (col.type === 'num' ? x - y : String(x).localeCompare(String(y), 'ja'))
  })
}
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '')
// fetch の text() は先頭の BOM を取り除くため付け直す（Excel が UTF-8 と判断できるように）
export const withBom = (text) => (text.startsWith('\ufeff') ? text : `\ufeff${text}`)
function download(doc, text, fileName) {
  const url = URL.createObjectURL(new Blob([withBom(text)], { type: 'text/csv;charset=utf-8' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = fileName
  doc.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function tile(label, value) {
  return `<div class="app-stat"><span class="meta">${label}</span><span class="numeral">${value}</span></div>`
}
export async function render(root, params = {}) {
  const { api, getState, setState, go } = getContext()
  const courses = getState().user?.adminCourses ?? []
  const courseId = pickCourse(courses, params, getState())
  if (!courseId) {
    root.innerHTML = `<h1 class="title app-admin-title">学習状況ダッシュボード</h1><div class="app-notice" role="status">${M_NO_COURSE}</div>`
    return
  }
  setState({ adminCourseId: courseId })
  root.innerHTML = `<h1 class="title app-admin-title">学習状況ダッシュボード</h1>${loading()}`
  let data
  try {
    data = await api.apiGet(`/admin/dashboard?course=${encodeURIComponent(courseId)}`)
  } catch (err) {
    root.innerHTML = `<h1 class="title app-admin-title">学習状況ダッシュボード</h1>${errorBand(errorMessage(err, M_DASHBOARD_ERROR))}
<div class="app-toolbar">${button({ label: 'もう一度読み込む', attrs: 'data-action="reload"' })}</div>`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root, params))
    return
  }
  const s = data.summary
  root.innerHTML = `<h1 class="title app-admin-title">学習状況ダッシュボード</h1>
<div class="app-toolbar">${courseSelect(courses, courseId)}${button({ label: 'CSVで出力する', variant: 'primary', attrs: 'data-action="csv"' })}</div>
<div class="app-error-slot"></div>
<section class="app-admin-stats" aria-label="集計">${tile('受講者数', `${Number(s.learners)}<small class="meta"> 人</small>`)}${tile('アクティブ率', formatPct(s.activeRate))}${tile('平均網羅率', formatPct(s.avgCoveragePct))}${tile('平均正答率', formatPct(s.avgCorrectPct))}</section>
<p class="meta">アクティブ率：直近7日間に2回以上ログインした受講者の割合</p>
<section aria-labelledby="learners-h"><h2 id="learners-h" class="label">受講者一覧（${data.learners.length}人）</h2><div class="app-table-wrap"></div></section>`
  const wrap = root.querySelector('.app-table-wrap')
  let sort = { key: 'fullName', dir: 'asc' }
  const drawTable = () => {
    if (data.learners.length === 0) {
      wrap.innerHTML = '<p class="body">まだ受講者がいない</p>'
      return
    }
    const head = COLUMNS.map((c) => {
      const on = c.key === sort.key
      const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      return `<th scope="col" aria-sort="${aria}"><button type="button" class="app-sort" data-sort="${c.key}">${c.label}<span aria-hidden="true">${on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button></th>`
    }).join('')
    const body = sortLearners(data.learners, sort.key, sort.dir).map((r) => `<tr>${COLUMNS.map((c) => `<td${c.type === 'num' ? ' class="app-num"' : ''}>${escapeHtml(c.show ? c.show(r[c.key]) : r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')
    wrap.innerHTML = `<table class="app-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  }
  drawTable()
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]')
    if (!b) return
    sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort && sort.dir === 'asc' ? 'desc' : 'asc' }
    drawTable()
    wrap.querySelector(`[data-sort="${sort.key}"]`).focus()
  })
  bindCourseSelect(root, { path: '/admin/dashboard', setState, go })
  const csv = root.querySelector('[data-action="csv"]')
  csv.addEventListener('click', async () => {
    csv.disabled = true
    root.querySelector('.app-error-slot').innerHTML = ''
    try {
      const text = await api.apiGet(`/admin/dashboard.csv?course=${encodeURIComponent(courseId)}`, { raw: true })
      download(root.ownerDocument, text, `dashboard_${courseId}_${today()}.csv`)
    } catch (err) {
      root.querySelector('.app-error-slot').innerHTML = errorBand(errorMessage(err, M_CSV_ERROR))
    }
    csv.disabled = false
  })
}
