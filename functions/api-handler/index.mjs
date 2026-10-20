// api-handler の入口（詳細設計書 4.1・4.2）
import { createLogger } from '../shared/util/logger.js'
import { AppError, toErrorResponse } from '../shared/util/errors.js'
import { getAuth, requireRole, loadUser } from '../shared/util/authz.js'
import { parseBody } from '../shared/util/http.js'
import { todayJst, weekStartJst } from '../shared/util/date-jst.js'
import { setDefaultResumeRetries } from '../shared/db/data-api.js'
import * as users from '../shared/db/repositories/users.js'
import * as courses from '../shared/db/repositories/courses.js'
import { match } from './router.js'
import { requireEnv } from '../shared/util/env.js'
export const ENV = requireEnv(['APP_ENV', 'DB_CLUSTER_ARN', 'DB_SECRET_ARN', 'DB_NAME', 'MODEL_LIGHT', 'GRADING_FUNCTION',
  'IMPORT_BUCKET', 'ASSETS_BUCKET', 'USER_POOL_ID', 'MAIL_FROM', 'APP_URL'])
setDefaultResumeRetries(0)
export const authzDb = { users, courses }
export async function main(event, { log, now = new Date() }) {
  const method = event?.requestContext?.http?.method ?? 'GET'
  const path = event?.rawPath ?? event?.requestContext?.http?.path ?? '/'
  const routeName = `${method} ${path}`
  try {
    const hit = match(method, path)
    if (!hit) throw new AppError('NOT_FOUND', 'ルートがありません')
    const { route, params } = hit
    const ctx = {
      event, params, log, now, today: todayJst(now), weekStart: weekStartJst(now),
      query: event.queryStringParameters ?? {}, body: () => parseBody(event)
    }
    if (route.roles) {
      ctx.auth = getAuth(event)
      requireRole(ctx.auth, ...route.roles)
      ctx.user = await loadUser(authzDb, ctx.auth)
      if (route.gate && !ctx.user.nickname) throw new AppError('ONBOARDING_REQUIRED')
      if (route.gate === 'course' && !ctx.user.currentCourseId) throw new AppError('COURSE_REQUIRED')
    }
    const res = await route.handler(ctx)
    log.info({ route: routeName, status: res.statusCode, userId: ctx.user?.userId })
    return res
  } catch (err) {
    const res = toErrorResponse(err)
    if (res.statusCode >= 500) log.error({ route: routeName, status: res.statusCode, code: err.code ?? 'INTERNAL_ERROR', err })
    else log.info({ route: routeName, status: res.statusCode, code: err.code })
    return res
  }
}
export const handler = async (event, context) => {
  const log = createLogger('api-handler', { requestId: context?.awsRequestId })
  const started = Date.now()
  const res = await main(event, { log, now: new Date() })
  log.info({ durationMs: Date.now() - started })
  return res
}
