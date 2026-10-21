// grading-worker の入口（詳細設計書 4.1・4.3）。api-handler から非同期で起動される
import { createLogger } from '../shared/util/logger.js'
import { setDefaultResumeRetries } from '../shared/db/data-api.js'
import { requireEnv } from '../shared/util/env.js'
import { gradeJob } from './grader.js'
export const ENV = requireEnv(['APP_ENV', 'DB_CLUSTER_ARN', 'DB_SECRET_ARN', 'DB_NAME', 'MODEL_HIGH'])
export const RESUME_RETRIES = 6
setDefaultResumeRetries(RESUME_RETRIES)
export async function main(event, { log, now = () => new Date() }) {
  return gradeJob(Number(event.gradingId), { log, now })
}
export const handler = async (event, context) => {
  const log = createLogger('grading-worker', { requestId: context?.awsRequestId })
  const started = Date.now()
  try {
    const res = await main(event, { log })
    log.info({ durationMs: Date.now() - started, status: res.status })
    return res
  } catch (err) {
    log.error({ code: err.code ?? 'INTERNAL_ERROR', err })
    throw err
  }
}
