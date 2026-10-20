// answer_logs（T-14）
import { defaultDb, camelRow, date } from './_base.js'
export async function insert(a, db = defaultDb) {
  const rows = await db.query(`INSERT INTO answer_logs (user_id, course_id, question_id, keyword_id, adventure_id, kind,
      selected_choice, is_correct, score, explanation_text, is_review, is_new, answered_on)
    VALUES (:userId, :courseId, :questionId, :keywordId, :adventureId, :kind, :selectedChoice, :isCorrect, :score,
      :explanationText, :isReview, :isNew, :answeredOn)
    RETURNING answer_id`, {
    userId: a.userId, courseId: a.courseId, questionId: a.questionId, keywordId: a.keywordId ?? null,
    adventureId: a.adventureId ?? null, kind: a.kind, selectedChoice: a.selectedChoice ?? null, isCorrect: a.isCorrect,
    score: a.score ?? null, explanationText: a.explanationText ?? null, isReview: !!a.isReview, isNew: !!a.isNew,
    answeredOn: date(a.answeredOn)
  })
  return rows[0].answer_id
}
export async function statsForUser(userId, courseId, db = defaultDb) {
  const rows = await db.query(`SELECT count(*)::int AS answer_count, count(*) FILTER (WHERE is_correct)::int AS correct_count,
      count(DISTINCT question_id) FILTER (WHERE kind = 'choice')::int AS answered_questions,
      count(*) FILTER (WHERE kind = 'explain')::int AS explain_count
    FROM answer_logs WHERE user_id = :userId AND course_id = :courseId`, { userId, courseId })
  return camelRow(rows[0])
}
export async function countOnDate(userId, day, db = defaultDb) {
  const rows = await db.query('SELECT count(*)::int AS cnt FROM answer_logs WHERE user_id = :userId AND answered_on = :day',
    { userId, day: date(day) })
  return rows[0]?.cnt ?? 0
}
export async function masteredCount(userId, db = defaultDb) {
  const rows = await db.query("SELECT count(*)::int AS cnt FROM review_items WHERE user_id = :userId AND kind = 'choice' AND stage = 6", { userId })
  return rows[0]?.cnt ?? 0
}
