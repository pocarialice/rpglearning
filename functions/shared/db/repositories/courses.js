// courses（T-06）・course_admins（T-08）
import { defaultDb, camelRow, camelRows } from './_base.js'
export async function listWithProgress(userId, db = defaultDb) {
  return camelRows(await db.query(`SELECT c.course_id, c.name, c.certification, c.description,
      (SELECT count(*) FROM questions q WHERE q.course_id = c.course_id AND q.status = 'published')::int AS question_count,
      (SELECT count(*) FROM review_items r WHERE r.course_id = c.course_id AND r.user_id = :userId AND r.kind = 'choice')::int AS learned_count,
      EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.course_id AND e.user_id = :userId) AS enrolled
    FROM courses c ORDER BY c.course_id LIMIT 100`, { userId }))
}
export async function listAll(db = defaultDb) {
  const rows = camelRows(await db.query(`SELECT c.course_id, c.name, c.certification, c.description,
      COALESCE((SELECT json_agg(a.user_id ORDER BY a.user_id) FROM course_admins a WHERE a.course_id = c.course_id), '[]') AS admin_user_ids
    FROM courses c ORDER BY c.course_id LIMIT 200`))
  return rows.map((c) => ({ ...c, adminUserIds: typeof c.adminUserIds === 'string' ? JSON.parse(c.adminUserIds) : c.adminUserIds }))
}
export async function listIds(db = defaultDb) {
  const rows = await db.query('SELECT course_id FROM courses ORDER BY course_id LIMIT 200')
  return rows.map((r) => r.course_id)
}
export async function findById(courseId, db = defaultDb) {
  const rows = await db.query('SELECT course_id, name, certification, description FROM courses WHERE course_id = :courseId', { courseId })
  return camelRow(rows[0])
}
export async function create({ name, certification, description = null }, db = defaultDb) {
  const rows = await db.query(`INSERT INTO courses (name, certification, description) VALUES (:name, :certification, :description)
    RETURNING course_id`, { name, certification, description })
  return rows[0].course_id
}
export async function update(courseId, { name, certification, description = null }, db = defaultDb) {
  const r = await db.execute(`UPDATE courses SET name = :name, certification = :certification, description = :description, updated_at = now()
    WHERE course_id = :courseId`, { courseId, name, certification, description })
  return r.numberOfRecordsUpdated === 1
}
export async function assignAdmins(courseId, userIds, db = defaultDb) {
  await db.execute('DELETE FROM course_admins WHERE course_id = :courseId', { courseId })
  for (const userId of userIds) {
    await db.execute('INSERT INTO course_admins (course_id, user_id) VALUES (:courseId, :userId) ON CONFLICT DO NOTHING', { courseId, userId })
  }
}
export async function listAdminCourses(userId, db = defaultDb) {
  return camelRows(await db.query(`SELECT c.course_id, c.name FROM course_admins a JOIN courses c ON c.course_id = a.course_id
    WHERE a.user_id = :userId ORDER BY c.course_id`, { userId }))
}
export async function isAdmin(courseId, userId, db = defaultDb) {
  const rows = await db.query('SELECT 1 AS ok FROM course_admins WHERE course_id = :courseId AND user_id = :userId', { courseId, userId })
  return rows.length > 0
}
// ダッシュボードの受講者一覧（詳細設計書 8.6）。1MB制限のため必ず LIMIT を付ける
export async function dashboardRows(courseId, { limit = 1000, offset = 0 } = {}, db = defaultDb) {
  return camelRows(await db.query(`WITH pub AS (
  SELECT count(*) AS total FROM questions WHERE course_id = :courseId AND status = 'published'
), ans AS (
  SELECT a.user_id, count(DISTINCT a.question_id) AS answered_questions, count(*) AS answer_count,
         count(*) FILTER (WHERE a.is_correct) AS correct_count
  FROM answer_logs a JOIN questions q ON q.question_id = a.question_id AND q.status = 'published'
  WHERE a.course_id = :courseId AND a.kind = 'choice' GROUP BY a.user_id
), lg AS (
  SELECT user_id, count(*) AS logins_7d FROM login_logs WHERE logged_in_at >= now() - interval '7 days' GROUP BY user_id
), ms AS (
  SELECT user_id, count(*) AS mastered FROM review_items WHERE course_id = :courseId AND kind = 'choice' AND stage = 6 GROUP BY user_id
)
SELECT u.user_id, u.full_name, u.nickname, u.email, n.enrolled_on, u.level, u.total_exp, u.last_login_at,
       CASE WHEN pub.total = 0 THEN 0 ELSE round(100.0 * coalesce(ans.answered_questions, 0) / pub.total, 1) END AS coverage_pct,
       CASE WHEN coalesce(ans.answer_count, 0) = 0 THEN NULL ELSE round(100.0 * ans.correct_count / ans.answer_count, 1) END AS correct_pct,
       coalesce(ms.mastered, 0) AS mastered, coalesce(lg.logins_7d, 0) AS logins_7d
FROM enrollments n
JOIN users u ON u.user_id = n.user_id AND u.status <> 'deleted'
CROSS JOIN pub
LEFT JOIN ans ON ans.user_id = u.user_id
LEFT JOIN lg  ON lg.user_id  = u.user_id
LEFT JOIN ms  ON ms.user_id  = u.user_id
WHERE n.course_id = :courseId
ORDER BY u.user_id
LIMIT :limit OFFSET :offset`, { courseId, limit, offset }))
}
