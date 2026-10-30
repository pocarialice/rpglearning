// パスとメソッドからハンドラを選ぶ（詳細設計書 4.2.2）
import * as health from './routes/health.js'
import * as authRoutes from './routes/auth.js'
import * as me from './routes/me.js'
import * as home from './routes/home.js'
import * as courses from './routes/courses.js'
import * as quests from './routes/quests.js'
import * as answers from './routes/answers.js'
import * as gradings from './routes/gradings.js'
import * as rankings from './routes/rankings.js'
import * as adminImports from './routes/admin-imports.js'
import * as adminQuestions from './routes/admin-questions.js'
import * as adminDashboard from './routes/admin-dashboard.js'
import * as adminUsers from './routes/admin-users.js'
import * as adminCourses from './routes/admin-courses.js'
import * as adminPartners from './routes/admin-partners.js'
const ALL = ['learner', 'course_admin', 'system_admin']
const LEARNER = ['learner']
const COURSE_ADMIN = ['course_admin', 'system_admin']
const SYSTEM_ADMIN = ['system_admin']
// gate：学習者APIの前提（nickname＝ニックネーム登録済み、course＝受講中のコースあり）
const r = (method, path, handler, roles, gate = null) => ({ method, path, handler, roles, gate })
export const ROUTES = [
  r('GET', '/api/health', health.get, null),
  r('POST', '/api/auth/login', authRoutes.login, null),
  r('POST', '/api/auth/new-password', authRoutes.newPassword, null),
  r('POST', '/api/auth/refresh', authRoutes.refresh, null),
  r('POST', '/api/auth/logout', authRoutes.logout, null),
  r('POST', '/api/auth/forgot', authRoutes.forgot, null),
  r('POST', '/api/auth/reset', authRoutes.reset, null),
  r('GET', '/api/me', me.get, ALL),
  r('PUT', '/api/me/profile', me.putProfile, LEARNER),
  r('PUT', '/api/me/partner', me.putPartner, LEARNER),
  r('GET', '/api/me/notify', me.getNotify, LEARNER),
  r('PUT', '/api/me/notify', me.putNotify, LEARNER),
  r('GET', '/api/home', home.get, LEARNER, 'course'),
  r('GET', '/api/courses', courses.list, LEARNER, 'nickname'),
  r('POST', '/api/enrollments', courses.enroll, LEARNER, 'nickname'),
  r('GET', '/api/quests/next', quests.next, LEARNER, 'course'),
  r('POST', '/api/answers/choice', answers.choice, LEARNER, 'course'),
  r('POST', '/api/gradings', gradings.create, LEARNER, 'course'),
  r('GET', '/api/gradings/{id}', gradings.get, LEARNER, 'nickname'),
  r('GET', '/api/rankings', rankings.get, LEARNER, 'nickname'),
  r('GET', '/api/me/stats', me.stats, LEARNER, 'course'),
  r('GET', '/api/me/badges', me.badges, LEARNER, 'nickname'),
  r('POST', '/api/admin/imports', adminImports.create, COURSE_ADMIN),
  r('GET', '/api/admin/imports', adminImports.list, COURSE_ADMIN),
  r('GET', '/api/admin/imports/{id}', adminImports.get, COURSE_ADMIN),
  r('POST', '/api/admin/imports/{id}/uploaded', adminImports.uploaded, COURSE_ADMIN),
  r('POST', '/api/admin/imports/{id}/publish', adminImports.publishAll, COURSE_ADMIN),
  r('GET', '/api/admin/questions', adminQuestions.list, COURSE_ADMIN),
  r('PUT', '/api/admin/questions/{id}', adminQuestions.put, COURSE_ADMIN),
  r('DELETE', '/api/admin/questions/{id}', adminQuestions.remove, COURSE_ADMIN),
  r('POST', '/api/admin/questions/{id}/publish', adminQuestions.publish, COURSE_ADMIN),
  r('GET', '/api/admin/dashboard', adminDashboard.get, COURSE_ADMIN),
  r('GET', '/api/admin/dashboard.csv', adminDashboard.csv, COURSE_ADMIN),
  r('GET', '/api/admin/users', adminUsers.list, SYSTEM_ADMIN),
  r('POST', '/api/admin/users', adminUsers.create, SYSTEM_ADMIN),
  r('PUT', '/api/admin/users/{id}', adminUsers.update, SYSTEM_ADMIN),
  r('POST', '/api/admin/users/{id}/delete', adminUsers.remove, SYSTEM_ADMIN),
  r('POST', '/api/admin/users/{id}/restore', adminUsers.restore, SYSTEM_ADMIN),
  r('POST', '/api/admin/users/{id}/reinvite', adminUsers.reinvite, SYSTEM_ADMIN),
  r('GET', '/api/admin/courses', adminCourses.list, SYSTEM_ADMIN),
  r('POST', '/api/admin/courses', adminCourses.create, SYSTEM_ADMIN),
  r('PUT', '/api/admin/courses/{id}', adminCourses.update, SYSTEM_ADMIN),
  r('GET', '/api/admin/partners/{persona}/image', adminPartners.get, SYSTEM_ADMIN),
  r('PUT', '/api/admin/partners/{persona}/image', adminPartners.put, SYSTEM_ADMIN),
  r('DELETE', '/api/admin/partners/{persona}/image', adminPartners.remove, SYSTEM_ADMIN)
].map((route) => ({ ...route, re: toRegExp(route.path) }))
function toRegExp(path) {
  const src = path.replace(/[.]/g, '\\.').replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')
  return new RegExp(`^${src}$`)
}
// 一致したルートとパスのパラメータを返す。なければ null
export function match(method, path) {
  for (const route of ROUTES) {
    if (route.method !== method) continue
    const m = route.re.exec(path)
    if (m) return { route, params: { ...m.groups } }
  }
  return null
}
