// review_items（T-15）
import { defaultDb, camelRow, camelRows, date } from './_base.js'
const COLS = 'r.review_id, r.kind, r.question_id, r.keyword_id, r.stage, r.next_review_on, r.answer_count, r.correct_count'
export async function findItem({ userId, kind, questionId, keywordId }, db = defaultDb) {
  const rows = kind === 'choice'
    ? await db.query(`SELECT ${COLS} FROM review_items r WHERE r.user_id = :userId AND r.kind = 'choice' AND r.question_id = :questionId`,
      { userId, questionId })
    : await db.query(`SELECT ${COLS} FROM review_items r WHERE r.user_id = :userId AND r.kind = 'explain' AND r.keyword_id = :keywordId`,
      { userId, keywordId })
  return camelRow(rows[0])
}
export async function upsertItem({ userId, courseId, kind, questionId, keywordId = null, stage, nextReviewOn, correct, today, mastered }, db = defaultDb) {
  const conflict = kind === 'choice' ? "(user_id, question_id) WHERE kind = 'choice'" : "(user_id, keyword_id) WHERE kind = 'explain'"
  await db.execute(`INSERT INTO review_items (user_id, course_id, kind, question_id, keyword_id, stage, next_review_on,
      answer_count, correct_count, last_answered_on, mastered_at)
    VALUES (:userId, :courseId, :kind, :questionId, :keywordId, :stage, :nextReviewOn, 1, :correctInc, :today,
      CASE WHEN :mastered THEN now() END)
    ON CONFLICT ${conflict} DO UPDATE SET stage = EXCLUDED.stage, next_review_on = EXCLUDED.next_review_on,
      answer_count = review_items.answer_count + 1, correct_count = review_items.correct_count + EXCLUDED.correct_count,
      last_answered_on = EXCLUDED.last_answered_on, mastered_at = COALESCE(review_items.mastered_at, EXCLUDED.mastered_at),
      updated_at = now()`,
  { userId, courseId, kind, questionId, keywordId, stage, nextReviewOn: date(nextReviewOn), correctInc: correct ? 1 : 0, today: date(today), mastered: !!mastered })
}
export async function countDue(userId, courseId, today, db = defaultDb) {
  const rows = await db.query(`SELECT count(*)::int AS cnt FROM review_items r
    JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
    WHERE r.user_id = :userId AND r.course_id = :courseId AND r.stage < 6 AND r.next_review_on <= :today`,
  { userId, courseId, today: date(today) })
  return rows[0]?.cnt ?? 0
}
export async function listDue(userId, courseId, kind, today, db = defaultDb) {
  return camelRows(await db.query(`SELECT r.review_id, r.kind, r.question_id, r.keyword_id, r.stage, r.next_review_on
FROM review_items r
JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
WHERE r.user_id = :userId AND r.course_id = :courseId AND r.kind = :kind
  AND r.stage < 6 AND r.next_review_on <= :today
ORDER BY r.next_review_on, r.review_id
LIMIT 20`, { userId, courseId, kind, today: date(today) }))
}
export async function listUnlearned(userId, courseId, kind, db = defaultDb) {
  const sql = kind === 'choice'
    ? `SELECT q.question_id, NULL::bigint AS keyword_id FROM questions q
WHERE q.course_id = :courseId AND q.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM review_items r WHERE r.user_id = :userId AND r.kind = 'choice' AND r.question_id = q.question_id)
ORDER BY q.question_id
LIMIT 20`
    : `SELECT DISTINCT ON (q.question_id) q.question_id, k.keyword_id
FROM questions q
JOIN keywords k ON k.question_id = q.question_id
WHERE q.course_id = :courseId AND q.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM review_items r
                  WHERE r.user_id = :userId AND r.kind = 'explain' AND r.keyword_id = k.keyword_id)
ORDER BY q.question_id, k.sort_order
LIMIT 20`
  return camelRows(await db.query(sql, { userId, courseId }))
}
export async function listLearned(userId, courseId, kind, db = defaultDb) {
  return camelRows(await db.query(`SELECT r.question_id, r.keyword_id, r.stage,
      CASE WHEN r.answer_count = 0 THEN 0 ELSE r.correct_count::float / r.answer_count END AS correct_rate
    FROM review_items r JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
    WHERE r.user_id = :userId AND r.course_id = :courseId AND r.kind = :kind
    ORDER BY correct_rate, r.question_id LIMIT 20`, { userId, courseId, kind }))
}
