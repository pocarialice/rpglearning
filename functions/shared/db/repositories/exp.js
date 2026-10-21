// exp_logs（T-17）
import { defaultDb, camelRows, date } from './_base.js'
export async function insertLog({ userId, courseId, reason, refId = null, exp, isReview = false, weekStart }, db = defaultDb) {
  await db.execute(`INSERT INTO exp_logs (user_id, course_id, reason, ref_id, exp, is_review, earned_week)
    VALUES (:userId, :courseId, :reason, :refId, :exp, :isReview, :weekStart)`,
  { userId, courseId, reason, refId, exp, isReview, weekStart: date(weekStart) })
}
export async function weeklyTotals(courseId, weekStart, db = defaultDb) {
  return camelRows(await db.query(`SELECT e.user_id, u.nickname, u.status, SUM(e.exp)::int AS weekly_exp
FROM exp_logs e
JOIN users u       ON u.user_id = e.user_id AND u.status = 'active'
JOIN enrollments n ON n.user_id = e.user_id AND n.course_id = e.course_id
WHERE e.course_id = :courseId AND e.earned_week = :weekStart
GROUP BY e.user_id, u.nickname, u.status`, { courseId, weekStart: date(weekStart) }))
}
export async function weeklyTotalForUser(userId, weekStart, db = defaultDb) {
  const rows = await db.query('SELECT COALESCE(SUM(exp), 0)::int AS total FROM exp_logs WHERE user_id = :userId AND earned_week = :weekStart',
    { userId, weekStart: date(weekStart) })
  return rows[0]?.total ?? 0
}
