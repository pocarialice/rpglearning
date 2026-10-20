// questions（T-10）・choices（T-11）・keywords（T-12）
import { defaultDb, camelRow, camelRows } from './_base.js'
function parseJsonCols(q) {
  if (!q) return q
  for (const k of ['choices', 'keywords']) if (typeof q[k] === 'string') q[k] = JSON.parse(q[k])
  return q
}
const DETAIL_COLS = `q.question_id, q.course_id, q.import_id, q.body, q.correct_choice, q.explanation, q.status, q.published_at,
  COALESCE((SELECT json_agg(c.body ORDER BY c.choice_no) FROM choices c WHERE c.question_id = q.question_id), '[]') AS choices,
  COALESCE((SELECT json_agg(json_build_object('keywordId', k.keyword_id, 'keyword', k.keyword) ORDER BY k.sort_order)
            FROM keywords k WHERE k.question_id = q.question_id), '[]') AS keywords`
export async function findForLearner(questionId, courseId, db = defaultDb) {
  const rows = await db.query(`SELECT ${DETAIL_COLS} FROM questions q
    WHERE q.question_id = :questionId AND q.course_id = :courseId AND q.status = 'published'`, { questionId, courseId })
  return parseJsonCols(camelRow(rows[0]))
}
export async function findById(questionId, db = defaultDb) {
  const rows = await db.query(`SELECT ${DETAIL_COLS} FROM questions q WHERE q.question_id = :questionId`, { questionId })
  return parseJsonCols(camelRow(rows[0]))
}
export async function findKeyword(keywordId, db = defaultDb) {
  const rows = await db.query(`SELECT k.keyword_id, k.keyword, k.question_id, q.course_id, q.body, q.explanation, q.status
    FROM keywords k JOIN questions q ON q.question_id = k.question_id WHERE k.keyword_id = :keywordId`, { keywordId })
  return camelRow(rows[0])
}
export async function findDraftsByImport(importId, db = defaultDb) {
  const rows = await db.query(`SELECT ${DETAIL_COLS} FROM questions q
    WHERE q.import_id = :importId AND q.status IN ('draft', 'needs_review') ORDER BY q.question_id LIMIT 500`, { importId })
  return camelRows(rows).map(parseJsonCols)
}
// 選択肢・キーワードは全件置き換え
export async function update(questionId, { body, choices, correct, explanation, keywords, status }, userId, db = defaultDb) {
  const r = await db.execute(`UPDATE questions SET body = :body, correct_choice = :correct, explanation = :explanation,
      status = :status, updated_by = :userId, updated_at = now()
    WHERE question_id = :questionId AND status <> 'archived'`,
  { questionId, body, correct: correct ?? null, explanation, status, userId })
  if (r.numberOfRecordsUpdated !== 1) return false
  await db.execute('DELETE FROM choices WHERE question_id = :questionId', { questionId })
  for (const [i, c] of choices.entries()) {
    await db.execute('INSERT INTO choices (question_id, choice_no, body) VALUES (:questionId, :no, :body)', { questionId, no: i + 1, body: c })
  }
  await db.execute('DELETE FROM keywords WHERE question_id = :questionId', { questionId })
  for (const [i, k] of keywords.entries()) {
    await db.execute('INSERT INTO keywords (question_id, sort_order, keyword) VALUES (:questionId, :no, :keyword)',
      { questionId, no: i + 1, keyword: k })
  }
  return true
}
export async function publish(questionId, userId, db = defaultDb) {
  const r = await db.execute(`UPDATE questions SET status = 'published', published_at = now(), updated_by = :userId, updated_at = now()
    WHERE question_id = :questionId AND status IN ('draft', 'needs_review')`, { questionId, userId })
  return r.numberOfRecordsUpdated === 1
}
// 解答履歴があれば archived、なければ物理削除
export async function deleteOrArchive(questionId, userId, db = defaultDb) {
  const used = await db.query('SELECT 1 AS used FROM answer_logs WHERE question_id = :questionId LIMIT 1', { questionId })
  if (used.length > 0) {
    await db.execute(`UPDATE questions SET status = 'archived', updated_by = :userId, updated_at = now()
      WHERE question_id = :questionId`, { questionId, userId })
    return 'archived'
  }
  await db.execute('DELETE FROM questions WHERE question_id = :questionId', { questionId })
  return 'deleted'
}
