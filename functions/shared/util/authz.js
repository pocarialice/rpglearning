// 認証情報と権限の確認（詳細設計書 3.2 M-U04）
// util は db を import しないため、リポジトリは引数 db で受け取る
import { AppError } from './errors.js'
export const ROLES = ['learner', 'course_admin', 'system_admin']
export function getAuth(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims
  if (!claims || !claims.sub) throw new AppError('UNAUTHORIZED')
  return { sub: claims.sub, groups: parseGroups(claims.groups) }
}
function parseGroups(raw) {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    return raw.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean)
  }
  return []
}
export function requireRole(auth, ...roles) {
  const groups = auth?.groups ?? auth?.roles ?? []
  if (!roles.some((r) => groups.includes(r))) throw new AppError('FORBIDDEN')
}
export async function loadUser(db, auth) {
  const user = await db.users.findBySub(auth.sub)
  if (!user || user.status === 'deleted') throw new AppError('FORBIDDEN')
  let loaded = user
  if (user.status === 'invited') {
    await db.users.activate(user.userId)
    loaded = { ...user, status: 'active' }
  }
  return { ...loaded, roles: loaded.roles ?? auth.groups ?? [] }
}
export async function assertCourseAdmin(db, user, courseId) {
  const roles = user?.roles ?? []
  if (roles.includes('system_admin')) return
  if (roles.includes('course_admin') && await db.courses.isAdmin(courseId, user.userId)) return
  throw new AppError('FORBIDDEN')
}
