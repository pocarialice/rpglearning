// A-06 コース一覧・受講の開始
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import * as courses from '../../shared/db/repositories/courses.js'
import * as enrollments from '../../shared/db/repositories/enrollments.js'
import * as users from '../../shared/db/repositories/users.js'
const round1 = (n) => Math.round(n * 10) / 10
// 網羅率（%、小数1桁）。問題がなければ 0
export const coveragePct = (learned, total) => (total === 0 ? 0 : round1((100 * learned) / total))
export async function list(ctx) {
  const rows = await courses.listWithProgress(ctx.user.userId)
  return ok({
    courses: rows.map((c) => ({
      id: encodeId(PREFIX.course, c.courseId), name: c.name, certification: c.certification, description: c.description ?? null,
      questionCount: c.questionCount,
      coveragePct: coveragePct(c.learnedCount, c.questionCount),
      enrolled: !!c.enrolled, current: c.courseId === ctx.user.currentCourseId
    }))
  })
}
export async function enroll(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.body().courseId)
  const { user, today } = ctx
  const course = await courses.findById(courseId)
  if (!course) throw new AppError('NOT_FOUND', 'コースが見つかりません')
  const body = { courseId: encodeId(PREFIX.course, courseId), enrolled: true }
  if (await enrollments.isEnrolled(user.userId, courseId)) {
    await users.setCurrentCourse(user.userId, courseId)
    return ok(body)
  }
  if (await enrollments.nicknameTaken([courseId], user.nickname, user.userId)) {
    throw new AppError('CONFLICT', 'このニックネームはすでに使われています', { details: [{ field: 'nickname', code: 'M-08' }] })
  }
  await enrollments.enroll(user.userId, courseId, today)
  await users.setCurrentCourse(user.userId, courseId)
  return ok(body, 201)
}
