// batch-runner の入口（詳細設計書 4.1・4.5）。{"job":"daily"|"mail"} で振り分ける
import { createLogger } from '../shared/util/logger.js'
import { AppError } from '../shared/util/errors.js'
import { requireEnv } from '../shared/util/env.js'
import { setDefaultResumeRetries } from '../shared/db/data-api.js'
import { runDaily } from './jobs/daily.js'
import { runMail } from './jobs/mail.js'
export const ENV = requireEnv(['APP_ENV', 'DB_CLUSTER_ARN', 'DB_SECRET_ARN', 'DB_NAME', 'NOTIFY_BUCKET', 'USER_POOL_ID', 'MAIL_FROM', 'APP_URL'])
setDefaultResumeRetries(6)
export async function main(event, { log, now = new Date() }) {
  if (event?.job === 'daily') return runDaily({ log, now })
  if (event?.job === 'mail') return runMail({ log, now })
  throw new AppError('VALIDATION_ERROR', `知らないジョブです: ${event?.job}`)
}
export const handler = async (event, context) => {
  const log = createLogger('batch-runner', { requestId: context?.awsRequestId })
  const started = Date.now()
  try {
    const res = await main(event, { log, now: new Date() })
    log.info({ durationMs: Date.now() - started, job: event?.job })
    return res
  } catch (err) {
    log.error({ code: err.code ?? 'INTERNAL_ERROR', job: event?.job, err })
    throw err
  }
}
