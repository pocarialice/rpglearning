// grading_jobs（T-16）
import { defaultDb, camelRow, json } from './_base.js'
export async function create({ userId, courseId, keywordId, adventureId = null, explanationText }, db = defaultDb) {
  const rows = await db.query(`INSERT INTO grading_jobs (user_id, course_id, keyword_id, adventure_id, explanation_text)
    VALUES (:userId, :courseId, :keywordId, :adventureId, :explanationText) RETURNING grading_id, created_at`,
  { userId, courseId, keywordId, adventureId, explanationText })
  return camelRow(rows[0])
}
// 他人の採点は見せない（user_id で絞る）。userId を省くとワーカー用に全件から引く
export async function find(gradingId, userId = null, db = defaultDb) {
  const rows = await db.query(`SELECT grading_id, user_id, course_id, keyword_id, adventure_id, explanation_text, status, failure_reason,
      result, created_at, completed_at
    FROM grading_jobs WHERE grading_id = :gradingId AND (:userId::bigint IS NULL OR user_id = :userId)`, { gradingId, userId })
  const g = camelRow(rows[0])
  if (g && typeof g.result === 'string') g.result = JSON.parse(g.result)
  return g
}
// processing のときだけ完了にする（二重処理の防止）
export async function complete(gradingId, result, db = defaultDb) {
  const r = await db.execute(`UPDATE grading_jobs SET status = 'done', result = :result, completed_at = now()
    WHERE grading_id = :gradingId AND status = 'processing'`, { gradingId, result: json(result) })
  return r.numberOfRecordsUpdated === 1
}
export async function fail(gradingId, reason, db = defaultDb) {
  const r = await db.execute(`UPDATE grading_jobs SET status = 'failed', failure_reason = :reason, completed_at = now()
    WHERE grading_id = :gradingId AND status = 'processing'`, { gradingId, reason })
  return r.numberOfRecordsUpdated === 1
}
export async function deleteOlderThan(days, db = defaultDb) {
  const r = await db.execute("DELETE FROM grading_jobs WHERE created_at < now() - make_interval(days => :days)", { days })
  return r.numberOfRecordsUpdated
}
