// 管理局のコースの切り替え（S-11・S-12）。選べるのは A-01 の adminCourses（担当コース）だけ
import { escapeHtml } from '../../logic/format.js'
export const M_NO_COURSE = '担当しているコースがない。システム管理者にコースの割り当てを頼んでください'
// URL の ?course= → 前に選んだコース → 一覧の先頭、の順に決める。担当外の ID は使わない
export function pickCourse(courses, params, state) {
  const ids = courses.map((c) => c.id)
  return [params.course, state.adminCourseId].find((id) => id && ids.includes(id)) ?? ids[0] ?? null
}
export function courseSelect(courses, current) {
  return `<label class="app-field app-course-select"><span class="label">コース</span>
<select class="app-input body" data-course-select>${courses.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === current ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>`
}
// 選び直したら URL に残し、もう一方の画面でも同じコースを開く
export function bindCourseSelect(root, { path, setState, go }) {
  root.querySelector('[data-course-select]')?.addEventListener('change', (e) => {
    setState({ adminCourseId: e.target.value })
    go(`${path}?course=${e.target.value}`)
  })
}
