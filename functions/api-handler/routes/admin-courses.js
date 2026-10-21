// A-21 コースの一覧・登録・担当者の割り当て
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { withTx } from '../../shared/db/tx.js'
import * as courses from '../../shared/db/repositories/courses.js'
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
const len = (s) => [...s].length
function validateCourse(b) {
  if (typeof b.name !== 'string' || b.name.trim() === '' || len(b.name) > 50) throw invalid('name')
  if (typeof b.certification !== 'string' || b.certification.trim() === '' || len(b.certification) > 100) throw invalid('certification')
  if (b.description !== undefined && b.description !== null && (typeof b.description !== 'string' || len(b.description) > 1000)) throw invalid('description')
  return { name: b.name.trim(), certification: b.certification.trim(), description: b.description ?? null }
}
// 担当者は course_admin ロールを持つ有効な利用者だけ
async function validateAdmins(ids) {
  if (ids === undefined) return null
  if (!Array.isArray(ids)) throw invalid('adminUserIds')
  const userIds = [...new Set(ids.map((id) => decodeId(PREFIX.user, id)))]
  for (const userId of userIds) {
    const u = await users.findById(userId)
    if (!u || u.status === 'deleted' || !u.roles.includes('course_admin')) throw invalid('adminUserIds')
  }
  return userIds
}
export async function list() {
  const rows = await courses.listAll()
  return ok({ courses: rows.map((c) => ({ id: encodeId(PREFIX.course, c.courseId), name: c.name, certification: c.certification, description: c.description ?? null, adminUserIds: c.adminUserIds.map((id) => encodeId(PREFIX.user, id)) })) })
}
export async function create(ctx) {
  const b = ctx.body()
  const course = validateCourse(b)
  const admins = await validateAdmins(b.adminUserIds)
  const courseId = await withTx(async (tx) => {
    const id = await courses.create(course, tx)
    await audit.write(ctx.user.userId, 'course.create', { type: 'course', id }, {}, tx)
    if (admins) {
      await courses.assignAdmins(id, admins, tx)
      await audit.write(ctx.user.userId, 'course.assign', { type: 'course', id }, { adminUserIds: admins }, tx)
    }
    return id
  })
  return ok({ id: encodeId(PREFIX.course, courseId) }, 201)
}
export async function update(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.params.id)
  const b = ctx.body()
  const course = validateCourse(b)
  const admins = await validateAdmins(b.adminUserIds)
  await withTx(async (tx) => {
    if (!(await courses.update(courseId, course, tx))) throw new AppError('NOT_FOUND', 'コースが見つかりません')
    await audit.write(ctx.user.userId, 'course.update', { type: 'course', id: courseId }, {}, tx)
    if (admins) {
      await courses.assignAdmins(courseId, admins, tx)
      await audit.write(ctx.user.userId, 'course.assign', { type: 'course', id: courseId }, { adminUserIds: admins }, tx)
    }
  })
  return ok({ id: encodeId(PREFIX.course, courseId) })
}
