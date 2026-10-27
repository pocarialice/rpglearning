// コンテナの入口（詳細設計書 4.1）。ROLE=api（HTTP サーバー）/ worker（ジョブと定期処理）/ all（両方。小さな環境向け）
import { resolve } from 'node:path'
import { createLogger } from '../functions/shared/util/logger.js'
import { getPool } from '../functions/shared/db/client.js'
import { migrate } from '../functions/shared/db/migrate.js'
import { createHttpServer } from './http.mjs'
import { startWorker } from './worker.mjs'
export const COMMON_ENV = ['APP_ENV', 'DATABASE_URL', 'APP_URL', 'MAIL_FROM', 'SMTP_HOST', 'MODEL_HIGH', 'MODEL_LIGHT', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
export const ROLE_ENV = {
  api: ['AUTH_SECRET', 'IMPORT_BUCKET', 'ASSETS_BUCKET'],
  worker: ['IMPORT_BUCKET', 'NOTIFY_BUCKET']
}
// AI_PROVIDER ごとに要る設定（bedrock は AWS の認証情報を AWS_* で渡す）
export const AI_ENV = { sakura: ['AI_API_KEY'], bedrock: ['AWS_REGION'] }
export function checkEnv(role, env = process.env) {
  const roles = role === 'all' ? ['api', 'worker'] : [role]
  if (!roles.every((r) => ROLE_ENV[r])) throw new Error(`ROLE は api・worker・all のどれかにしてください: ${role}`)
  const provider = env.AI_PROVIDER || 'sakura'
  if (!AI_ENV[provider]) throw new Error(`AI_PROVIDER は sakura・bedrock のどちらかにしてください: ${provider}`)
  const names = [...new Set([...COMMON_ENV, ...roles.flatMap((r) => ROLE_ENV[r]), ...AI_ENV[provider]])]
  const missing = names.filter((n) => !env[n])
  if (missing.length) throw new Error(`環境変数がありません: ${missing.join(', ')}`)
  if (roles.includes('api') && env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET は32文字以上にしてください')
  return roles
}
export async function start({ env = process.env, log = createLogger('server') } = {}) {
  const role = env.ROLE || 'all'
  const roles = checkEnv(role, env)
  if (env.MIGRATE_ON_START === 'true') {
    const applied = await migrate({ pool: getPool(), dir: resolve(import.meta.dirname, '../db/migrations'), release: env.RELEASE_NO ?? null, log })
    log.info({ msg: 'migrate.done', applied })
  }
  const stops = []
  if (roles.includes('api')) {
    const port = Number(env.PORT || 8080)
    const server = createHttpServer({ webRoot: resolve(env.WEB_ROOT || resolve(import.meta.dirname, '../web')) })
    await new Promise((r) => server.listen(port, r))
    log.info({ msg: 'http.listen', port, release: env.RELEASE_NO ?? null })
    stops.push(() => new Promise((r) => server.close(r)))
  }
  if (roles.includes('worker')) {
    const worker = startWorker({
      gradingConcurrency: Number(env.WORKER_GRADING_CONCURRENCY || 2), importConcurrency: Number(env.WORKER_IMPORT_CONCURRENCY || 1)
    })
    log.info({ msg: 'worker.start' })
    stops.push(() => worker.stop())
  }
  return async function stop() {
    await Promise.allSettled(stops.map((s) => s()))
    await getPool().end()
  }
}
// node server/main.mjs で起動したときだけ動かす（テストでは読み込むだけ）
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const log = createLogger('server')
  start({ log }).then((stop) => {
    // コンテナの停止（SIGTERM）では、処理中のジョブを終えてから止まる
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => stop().finally(() => process.exit(0)))
  }).catch((err) => {
    log.error({ msg: 'server.start_failed', err })
    process.exit(1)
  })
}
