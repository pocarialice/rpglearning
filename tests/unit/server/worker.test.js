import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../../functions/shared/db/repositories/jobs.js')
vi.mock('../../../functions/shared/db/repositories/schedules.js')
import * as jobs from '../../../functions/shared/db/repositories/jobs.js'
import * as schedules from '../../../functions/shared/db/repositories/schedules.js'
import { runOnce, jobLoop, dueSlots, createScheduler, startWorker, LOCK_SECONDS, SCHEDULE_ATTEMPTS } from '../../../server/worker.mjs'
import { memoryLogger } from '../../helpers/logger.js'
let log, notify
const job = (patch = {}) => ({ jobId: 7, kind: 'import', payload: { importId: 8 }, attempts: 1, maxAttempts: 3, ...patch })
beforeEach(() => {
  log = memoryLogger()
  notify = vi.fn()
  for (const m of [jobs, schedules]) for (const fn of Object.values(m)) if (vi.isMockFunction(fn)) fn.mockReset()
})
describe('M-S02 server/worker（ジョブ）', () => {
  it('MT-S02-01 取り出して処理し、完了にする', async () => {
    jobs.claimNext.mockResolvedValue(job())
    const runners = { import: vi.fn(async () => ({ outcome: 'done' })) }
    expect(await runOnce('import', { log, runners, notify })).toBe(true)
    expect(jobs.claimNext).toHaveBeenCalledWith(['import'], LOCK_SECONDS.import)
    expect(runners.import).toHaveBeenCalledWith(job(), expect.objectContaining({ log: expect.anything() }))
    expect(jobs.complete).toHaveBeenCalledWith(7)
    expect(log.lines.some((l) => l.msg === 'job.end' && l.outcome === 'done')).toBe(true)
  })
  it('MT-S02-02 待ちがない', async () => {
    jobs.claimNext.mockResolvedValue(null)
    expect(await runOnce('grading', { log })).toBe(false)
  })
  it('MT-S02-03 やり直し・失敗（取り込みの失敗は知らせる）', async () => {
    jobs.claimNext.mockResolvedValue(job())
    await runOnce('import', { log, notify, runners: { import: async () => ({ outcome: 'retry', error: 'busy', delaySeconds: 30 }) } })
    expect(jobs.retry).toHaveBeenCalledWith(7, 'busy', 30)
    await runOnce('import', { log, notify, runners: { import: async () => ({ outcome: 'retry' }) } })
    expect(jobs.retry).toHaveBeenLastCalledWith(7, undefined, 60)
    await runOnce('import', { log, notify, runners: { import: async () => ({ outcome: 'failed', error: 'bad pdf' }) } })
    expect(jobs.fail).toHaveBeenCalledWith(7, 'bad pdf')
    expect(notify).toHaveBeenCalledWith('import-failed', '問題の取り込みに失敗しました', ['ジョブ 7：bad pdf'], { log })
    jobs.claimNext.mockResolvedValue(job({ kind: 'grading', payload: { gradingId: 1 }, maxAttempts: 1 }))
    await runOnce('grading', { log, notify, runners: { grading: async () => ({ outcome: 'failed' }) } })
    expect(jobs.fail).toHaveBeenLastCalledWith(7, 'failed')
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('MT-S02-04 処理の例外（回数が残っていればやり直し）', async () => {
    const boom = async () => { throw new Error('boom') }
    jobs.claimNext.mockResolvedValue(job({ attempts: 1 }))
    await runOnce('import', { log, notify, runners: { import: boom } })
    expect(jobs.retry).toHaveBeenCalledWith(7, 'boom', 60)
    jobs.claimNext.mockResolvedValue(job({ attempts: 3 }))
    await runOnce('import', { log, notify, runners: { import: boom } })
    expect(jobs.fail).toHaveBeenCalledWith(7, 'boom')
    expect(log.lines.filter((l) => l.msg === 'job.error')).toHaveLength(2)
  })
  it('MT-S02-05 落ちたワーカーから取り戻したジョブが回数を使い切っていたら失敗', async () => {
    jobs.claimNext.mockResolvedValue(job({ kind: 'grading', attempts: 2, maxAttempts: 1 }))
    const runners = { grading: vi.fn() }
    await runOnce('grading', { log, runners })
    expect(runners.grading).not.toHaveBeenCalled()
    expect(jobs.fail).toHaveBeenCalledWith(7, 'attempts exhausted')
  })
  it('MT-S02-06 ループ（止める・例外でも続ける・待つ）', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let n = 0
    jobs.claimNext.mockImplementation(async () => {
      n++
      if (n === 1) throw new Error('db down')
      if (n === 2) return job()
      if (n >= 4) controller.abort()
      return null
    })
    const p = jobLoop('import', { log, signal: controller.signal, runners: { import: async () => ({ outcome: 'done' }) }, notify })
    await vi.advanceTimersByTimeAsync(5000)
    await p
    expect(log.lines.some((l) => l.msg === 'job.loop_error')).toBe(true)
    expect(jobs.complete).toHaveBeenCalledTimes(1)
  })
})
describe('M-S02 server/worker（定期処理）', () => {
  const at = (s) => new Date(`2026-10-20T${s}+09:00`)
  it('MT-S02-07 動かす枠', () => {
    expect(dueSlots(at('00:00:30'), { mailEnabled: true })).toEqual([{ name: 'daily', slot: '2026-10-20', event: { job: 'daily' } }])
    expect(dueSlots(at('07:44:00'), { mailEnabled: true }).map((s) => s.slot)).toEqual(['2026-10-20', '2026-10-20T0730'])
    expect(dueSlots(at('22:30:00'), { mailEnabled: true })[1].slot).toBe('2026-10-20T2230')
    expect(dueSlots(at('23:00:00'), { mailEnabled: true })).toHaveLength(1)
    expect(dueSlots(at('05:59:00'), { mailEnabled: true })).toHaveLength(1)
    expect(dueSlots(at('07:44:00'), { mailEnabled: false })).toHaveLength(1)
  })
  it('MT-S02-08 枠ごとに1回だけ動かす', async () => {
    schedules.claim.mockResolvedValueOnce(true).mockResolvedValue(false)
    const runBatch = vi.fn(async (event) => ({ job: event.job }))
    const tick = createScheduler({ log, runBatch, notify, mailEnabled: () => false })
    await tick(at('03:00:00'))
    await tick(at('03:00:30'))
    expect(runBatch).toHaveBeenCalledTimes(1)
    expect(runBatch.mock.calls[0][0]).toEqual({ job: 'daily' })
    expect(schedules.finish).toHaveBeenCalledWith('daily', '2026-10-20', { job: 'daily' })
  })
  it('MT-S02-09 失敗したら次の見回りでやり直し、3回失敗したら知らせる', async () => {
    schedules.claim.mockResolvedValue(true)
    const runBatch = vi.fn(async () => { throw Object.assign(new Error('step failed'), { code: '40P01' }) })
    const tick = createScheduler({ log, runBatch, notify, mailEnabled: () => false })
    for (let i = 0; i < SCHEDULE_ATTEMPTS + 2; i++) await tick(at('03:00:00'))
    expect(runBatch).toHaveBeenCalledTimes(SCHEDULE_ATTEMPTS)
    expect(schedules.release).toHaveBeenCalledTimes(SCHEDULE_ATTEMPTS - 1)
    expect(notify).toHaveBeenCalledWith('schedule-daily', '定期処理（daily）が失敗しました', ['枠 2026-10-20 を 3 回試しましたが失敗しました。'], { log })
    expect(log.lines.filter((l) => l.msg === 'schedule.failed')).toHaveLength(3)
    runBatch.mockRejectedValueOnce(new Error('no code'))
    await createScheduler({ log, runBatch, notify, mailEnabled: () => false })(at('03:00:00'))
    expect(log.lines.at(-1)).toMatchObject({ msg: 'schedule.failed', code: 'INTERNAL_ERROR' })
  })
  it('MT-S02-10 メール送信は MAIL_SCHEDULE_ENABLED のときだけ', async () => {
    schedules.claim.mockResolvedValue(true)
    const runBatch = vi.fn(async () => ({}))
    process.env.MAIL_SCHEDULE_ENABLED = 'true'
    await createScheduler({ log, runBatch, notify })(at('07:30:00'))
    expect(runBatch.mock.calls.map((c) => c[0].job)).toEqual(['daily', 'mail'])
    delete process.env.MAIL_SCHEDULE_ENABLED
    runBatch.mockClear()
    await createScheduler({ log, runBatch, notify })(at('07:30:00'))
    expect(runBatch.mock.calls.map((c) => c[0].job)).toEqual(['daily'])
  })
  it('MT-S02-11 起動と停止', async () => {
    jobs.claimNext.mockResolvedValue(null)
    schedules.claim.mockResolvedValue(false)
    const w = startWorker({ log, gradingConcurrency: 2, importConcurrency: 1 })
    await new Promise((r) => setTimeout(r, 20))
    await w.stop()
    const kinds = jobs.claimNext.mock.calls.map((c) => c[0][0])
    expect(kinds.filter((k) => k === 'grading').length).toBeGreaterThanOrEqual(2)
    expect(kinds).toContain('import')
    expect(schedules.claim).toHaveBeenCalled()
    schedules.claim.mockRejectedValue(new Error('db down'))
    const w2 = startWorker({ log, gradingConcurrency: 0, importConcurrency: 0 })
    await new Promise((r) => setTimeout(r, 20))
    await w2.stop()
    expect(log.lines.some((l) => l.msg === 'schedule.tick_error')).toBe(true)
  })
})
