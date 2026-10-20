// import_jobs（T-09）と取り込んだ下書きの保存
import { defaultDb, camelRow } from './_base.js'
export async function create({ courseId, userId, sourceType, fileName, s3Key }, db = defaultDb) {
  const rows = await db.query(`INSERT INTO import_jobs (course_id, created_by, source_type, file_name, s3_key)
    VALUES (:courseId, :userId, :sourceType, :fileName, :s3Key) RETURNING import_id`, { courseId, userId, sourceType, fileName, s3Key })
  return rows[0].import_id
}
export async function find(importId, db = defaultDb) {
  const rows = await db.query(`SELECT import_id, course_id, created_by, source_type, file_name, s3_key, status, extracted_count,
      error_message, created_at, updated_at FROM import_jobs WHERE import_id = :importId`, { importId })
  return camelRow(rows[0])
}
export async function findByKey(s3Key, db = defaultDb) {
  const rows = await db.query(`SELECT import_id, course_id, source_type, file_name, s3_key, status FROM import_jobs WHERE s3_key = :s3Key`, { s3Key })
  return camelRow(rows[0])
}
// from を指定すると、その状態のときだけ変える（状態遷移の食い違い防止）
export async function setStatus(importId, status, { from = null, extractedCount = null, errorMessage = null } = {}, db = defaultDb) {
  const r = await db.execute(`UPDATE import_jobs SET status = :status,
      extracted_count = COALESCE(:extractedCount, extracted_count), error_message = :errorMessage, updated_at = now()
    WHERE import_id = :importId AND (:from::text IS NULL OR status = :from)`, { importId, status, from, extractedCount, errorMessage })
  return r.numberOfRecordsUpdated === 1
}
export async function insertDrafts(importId, courseId, drafts, db = defaultDb) {
  for (const d of drafts) {
    const rows = await db.query(`INSERT INTO questions (course_id, import_id, body, correct_choice, explanation, status)
      VALUES (:courseId, :importId, :body, :correct, :explanation, :status) RETURNING question_id`,
    { courseId, importId, body: d.body, correct: d.correct ?? null, explanation: d.explanation ?? '', status: d.status })
    const questionId = rows[0].question_id
    for (const [i, c] of d.choices.entries()) {
      await db.execute('INSERT INTO choices (question_id, choice_no, body) VALUES (:questionId, :no, :body)', { questionId, no: i + 1, body: c })
    }
    for (const [i, k] of d.keywords.entries()) {
      await db.execute('INSERT INTO keywords (question_id, sort_order, keyword) VALUES (:questionId, :no, :keyword)',
        { questionId, no: i + 1, keyword: k })
    }
  }
  return drafts.length
}
