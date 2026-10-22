// コースを選んで受講を始める（A-06）。初回の流れと、あとで作る S-03 で使う
import { button } from '../components/button.js'
import { loading, errorBand, errorMessage } from '../components/status.js'
import { escapeHtml, formatPct } from '../logic/format.js'
export const M_COURSES_ERROR = 'コースを読み込めませんでした。もう一度お試しください'
export const M_ENROLL_ERROR = 'コースを選べませんでした。もう一度お試しください'
function courseCard(c) {
  const mark = c.current ? '<span class="app-chip">受講中</span>' : ''
  const desc = c.description ? `<p class="body">${escapeHtml(c.description)}</p>` : ''
  return `<article class="gd-card app-section app-course" aria-labelledby="course-${escapeHtml(c.id)}">
<div class="app-course-head"><h3 id="course-${escapeHtml(c.id)}" class="title">${escapeHtml(c.name)}</h3>${mark}</div>
<p class="meta">${escapeHtml(c.certification)}・問題 ${Number(c.questionCount)}問・網羅率 ${formatPct(c.coveragePct)}</p>${desc}
${button({ label: 'このコースで冒険する', block: true, attrs: `data-course="${escapeHtml(c.id)}"` })}</article>`
}
// onDone(courseId) は受講を始めたとき、onNicknameTaken() はそのコースにニックネームの重複（M-08）があったときに呼ぶ
export async function mountCourseStep(el, { api, onDone, onNicknameTaken }) {
  el.innerHTML = loading('コースを読み込み中')
  let courses
  try {
    courses = (await api.apiGet('/courses')).courses ?? []
  } catch (err) {
    el.innerHTML = `${errorBand(errorMessage(err, M_COURSES_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    el.querySelector('[data-action="reload"]').addEventListener('click', () => mountCourseStep(el, { api, onDone, onNicknameTaken }))
    return
  }
  el.innerHTML = `<h2 class="title">挑む資格を選ぶ</h2><div class="app-error-slot"></div>
<div class="app-stack">${courses.map(courseCard).join('') || '<p class="body">いま選べるコースがない。ギルド管理局に問い合わせてください</p>'}</div>`
  const slot = el.querySelector('.app-error-slot')
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-course]')
    if (!btn) return
    const all = el.querySelectorAll('[data-course]')
    all.forEach((b) => { b.disabled = true })
    slot.innerHTML = ''
    try {
      await api.apiPost('/enrollments', { courseId: btn.dataset.course })
      onDone(btn.dataset.course)
    } catch (err) {
      all.forEach((b) => { b.disabled = false })
      if (err?.status === 409) return onNicknameTaken()
      slot.innerHTML = errorBand(errorMessage(err, M_ENROLL_ERROR))
    }
  })
}
