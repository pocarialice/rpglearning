// 管理APIの共通処理
import { assertCourseAdmin } from '../../shared/util/authz.js'
import * as users from '../../shared/db/repositories/users.js'
import * as courses from '../../shared/db/repositories/courses.js'
export const authzDb = { users, courses }
export const requireCourseAdmin = (ctx, courseId) => assertCourseAdmin(authzDb, ctx.user, courseId)
