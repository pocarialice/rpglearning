// ワーカー（詳細設計書 4.7）。ジョブキューの採点・取り込みと、定期処理（日次・メール）を動かす
// Lambda の非同期呼び出し・SQS・EventBridge Scheduler の代わり
import { createLogger } from '../functions/shared/util/logger.js'
import { todayJst, jstSlot } from '../functions/shared/util/date-jst.js'
import { alert } from '../functions/shared/util/alert.js'
import * as jobs from '../functions/shared/db/repositories/jobs.js'
import * as schedules from '../functions/shared/db/repositories/schedules.js'
import { runGradingJob } from '../functions/grading-worker/index.mjs'
import { runImportJob } from '../functions/import-worker/index.mjs'
import { main as batch } from '../functions/batch-runner/index.mjs'
// 処理中のワーカーが落ちたとき、ほかのワーカーが取り戻すまでの時間（取り込みは最長15分）
export const LOCK_SECONDS = { grading: 120, import: 20 * 60 }
export const IDLE_MS = 1000
export const TICK_MS = 30 * 1000
export const SCHEDULE_ATTEMPTS = 3
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RUNNERS = { grading: runGradingJob, import: runImportJob }
// 1件取り出して処理する。処理したら true、待ちがなければ false
export async function runOnce(kind, { log, runners = RUNNERS, notify = alert }) {
  const job = await jobs.claimNext([kind], LOCK_SECONDS[kind])
  if (!job) return false
  const jl = log.child({ jobId: job.jobId })
  // 取り戻したジョブが回数を使い切っていたら、処理せずに失敗にする
  if (job.attempts > job.maxAttempts) {
    await jobs.fail(job.jobId, 'attempts exhausted')
    jl.error({ msg: 'job.exhausted', kind, attempts: job.attempts })
    return true
  }
  let out
  try {
    out = await runners[kind](job, { log: jl })
  } catch (err) {
    out = { outcome: job.attempts >= job.maxAttempts ? 'failed' : 'retry', error: err?.message, delaySeconds: 60 }
    jl.error({ msg: 'job.error', kind, err })
  }
  if (out.outcome === 'retry') await jobs.retry(job.jobId, out.error, out.delaySeconds ?? 60)
  else if (out.outcome === 'failed') {
    await jobs.fail(job.jobId, out.error ?? 'failed')
    if (kind === 'import') await notify('import-failed', '問題の取り込みに失敗しました', [`ジョブ ${job.jobId}：${out.error ?? ''}`], { log })
  } else await jobs.complete(job.jobId)
  jl.info({ msg: 'job.end', kind, outcome: out.outcome })
  return true
}
export async function jobLoop(kind, { log, signal, runners, notify }) {
  while (!signal.aborted) {
    let worked = false
    try {
      worked = await runOnce(kind, { log, runners, notify })
    } catch (err) {
      log.error({ msg: 'job.loop_error', kind, err })
    }
    if (!worked) await sleep(IDLE_MS)
  }
}
// その時刻に動かすべき定期処理の枠。daily は毎日0:00（JST）以降に1回、mail は6:00〜22:30の30分ごと（有効にしたときだけ）
export function dueSlots(now, { mailEnabled }) {
  const today = todayJst(now)
  const slots = [{ name: 'daily', slot: today, event: { job: 'daily' } }]
  const hh = Number(jstSlot(now).slice(0, 2))
  if (mailEnabled && hh >= 6 && hh <= 22) slots.push({ name: 'mail', slot: `${today}T${jstSlot(now)}`, event: { job: 'mail' } })
  return slots
}
// 枠ごとに1回だけ動かす。失敗したら記録を消して、次の見回りでやり直す（3回まで）
export function createScheduler({ log, runBatch = batch, notify = alert, mailEnabled = () => process.env.MAIL_SCHEDULE_ENABLED === 'true' }) {
  const failures = new Map()
  return async function tick(now = new Date()) {
    for (const s of dueSlots(now, { mailEnabled: mailEnabled() })) {
      const key = `${s.name}:${s.slot}`
      if ((failures.get(key) ?? 0) >= SCHEDULE_ATTEMPTS) continue
      if (!(await schedules.claim(s.name, s.slot))) continue
      try {
        const result = await runBatch(s.event, { log: log.child({ job: s.name }), now })
        await schedules.finish(s.name, s.slot, result)
        log.info({ msg: 'schedule.done', name: s.name, slot: s.slot })
      } catch (err) {
        const n = (failures.get(key) ?? 0) + 1
        failures.set(key, n)
        log.error({ msg: 'schedule.failed', name: s.name, slot: s.slot, attempt: n, code: err.code ?? 'INTERNAL_ERROR', err })
        if (n < SCHEDULE_ATTEMPTS) await schedules.release(s.name, s.slot)
        else await notify(`schedule-${s.name}`, `定期処理（${s.name}）が失敗しました`, [`枠 ${s.slot} を ${n} 回試しましたが失敗しました。`], { log })
      }
    }
  }
}
export function startWorker({ log = createLogger('worker'), gradingConcurrency = 2, importConcurrency = 1 } = {}) {
  const controller = new AbortController()
  const loops = []
  for (let i = 0; i < gradingConcurrency; i++) loops.push(jobLoop('grading', { log, signal: controller.signal }))
  for (let i = 0; i < importConcurrency; i++) loops.push(jobLoop('import', { log, signal: controller.signal }))
  const tick = createScheduler({ log })
  const runTick = () => tick().catch((err) => log.error({ msg: 'schedule.tick_error', err }))
  runTick()
  const timer = setInterval(runTick, TICK_MS)
  return {
    async stop() {
      clearInterval(timer)
      controller.abort()
      await Promise.allSettled(loops)
    }
  }
}
