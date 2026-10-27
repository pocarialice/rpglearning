// jobs（T-27）。SQS と Lambda の非同期呼び出しの代わりのジョブキュー（詳細設計書 3.7）
import { defaultDb, camelRow, json } from './_base.js'
export const MAX_ATTEMPTS = { grading: 1, import: 3 }
export async function enqueue(kind, payload, db = defaultDb) {
  const rows = await db.query(`INSERT INTO jobs (kind, payload, max_attempts) VALUES (:kind, :payload, :maxAttempts) RETURNING job_id`,
    { kind, payload: json(payload), maxAttempts: MAX_ATTEMPTS[kind] })
  return rows[0].job_id
}
// 待っているジョブか、ワーカーが落ちて期限が切れたジョブを1件だけ取り出す（ほかのワーカーと取り合わない）
export async function claimNext(kinds, lockSeconds, db = defaultDb) {
  const rows = await db.query(`UPDATE jobs SET status = 'running', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => :lockSeconds), updated_at = now()
    WHERE job_id = (
      SELECT job_id FROM jobs
      WHERE kind = ANY (string_to_array(:kinds, ','))
        AND ((status = 'queued' AND run_after <= now()) OR (status = 'running' AND locked_until < now()))
      ORDER BY run_after, job_id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING job_id, kind, payload, attempts, max_attempts`, { kinds: kinds.join(','), lockSeconds })
  const job = camelRow(rows[0])
  if (job && typeof job.payload === 'string') job.payload = JSON.parse(job.payload)
  return job
}
export async function complete(jobId, db = defaultDb) {
  await db.execute(`UPDATE jobs SET status = 'done', locked_until = NULL, updated_at = now() WHERE job_id = :jobId`, { jobId })
}
// やり直し（delaySeconds 秒後に、もう一度取り出せるようにする）
export async function retry(jobId, error, delaySeconds, db = defaultDb) {
  await db.execute(`UPDATE jobs SET status = 'queued', locked_until = NULL, last_error = :error,
      run_after = now() + make_interval(secs => :delaySeconds), updated_at = now() WHERE job_id = :jobId`,
  { jobId, error: String(error).slice(0, 1000), delaySeconds })
}
export async function fail(jobId, error, db = defaultDb) {
  await db.execute(`UPDATE jobs SET status = 'failed', locked_until = NULL, last_error = :error, updated_at = now() WHERE job_id = :jobId`,
    { jobId, error: String(error).slice(0, 1000) })
}
// 監視用：失敗したまま残っているジョブの数（SQS の DLQ の代わり）
export async function countFailedSince(sinceIso, db = defaultDb) {
  const rows = await db.query(`SELECT count(*)::int AS n FROM jobs WHERE status = 'failed' AND updated_at >= CAST(:since AS timestamptz)`,
    { since: sinceIso })
  return rows[0].n
}
// 30日より前の終わったジョブを消す（日次処理）
export async function deleteFinishedBefore(cutoff, db = defaultDb) {
  const r = await db.execute(`DELETE FROM jobs WHERE status IN ('done', 'failed') AND updated_at < CAST(:cutoff AS timestamptz)`, { cutoff })
  return r.numberOfRecordsUpdated
}
