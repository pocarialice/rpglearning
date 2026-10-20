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
// 選択肢・キーワードは番号（choice_no・sort_order）ごとに更新し、行を作り直さない（詳細設計書 5.3 A-15）
// 公開後も学習者の復習段階（keyword_id にひもづく）を残すため。減った番号の行だけ削除する
export async function update(questionId, { body, choices, correct, explanation, keywords, status }, userId, db = defaultDb) {
  const r = await db.execute(`UPDATE questions SET body = :body, correct_choice = :correct, explanation = :explanation,
      status = :status, updated_by = :userId, updated_at = now()
    WHERE question_id = :questionId AND status <> 'archived'`,
  { questionId, body, correct: correct ?? null, explanation, status, userId })
  if (r.numberOfRecordsUpdated !== 1) return false
  await syncNumbered(db, { table: 'choices', noCol: 'choice_no', valueCol: 'body', questionId, values: choices })
  await syncNumbered(db, { table: 'keywords', noCol: 'sort_order', valueCol: 'keyword', questionId, values: keywords, touch: true })
  return true
}
async function syncNumbered(db, { table, noCol, valueCol, questionId, values, touch = false }) {
  const rows = await db.query(`SELECT ${noCol} AS no FROM ${table} WHERE question_id = :questionId`, { questionId })
  const existing = new Set(rows.map((x) => x.no))
  for (const [i, value] of values.entries()) {
    const no = i + 1
    if (existing.has(no)) {
      await db.execute(`UPDATE ${table} SET ${valueCol} = :value${touch ? ', updated_at = now()' : ''}
        WHERE question_id = :questionId AND ${noCol} = :no`, { questionId, no, value })
    } else {
      await db.execute(`INSERT INTO ${table} (question_id, ${noCol}, ${valueCol}) VALUES (:questionId, :no, :value)`, { questionId, no, value })
    }
  }
  if ([...existing].some((no) => no > values.length)) {
    await db.execute(`DELETE FROM ${table} WHERE question_id = :questionId AND ${noCol} > :count`, { questionId, count: values.length })
  }
}
export async function publish(questionId, userId, db = defaultDb) {
  const r = await db.execute(`UPDATE questions SET status = 'published', published_at = now(), updated_by = :userId, updated_at = now()
    WHERE question_id = :questionId AND status IN ('draft', 'needs_review')`, { questionId, userId })
  return r.numberOfRecordsUpdated === 1
}
// 下書き・要確認は行ごと削除、公開済みは archived にして出題対象から外す（解答履歴を残す）
export async function deleteOrArchive(questionId, status, userId, db = defaultDb) {
  if (status === 'draft' || status === 'needs_review') {
    await db.execute("DELETE FROM questions WHERE question_id = :questionId AND status IN ('draft', 'needs_review')", { questionId })
    return 'deleted'
  }
  await db.execute(`UPDATE questions SET status = 'archived', updated_by = :userId, updated_at = now()
    WHERE question_id = :questionId AND status = 'published'`, { questionId, userId })
  return 'archived'
}
