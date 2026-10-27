// enrollments（T-07）
import { defaultDb, date } from './_base.js'
export async function enroll(userId, courseId, today, db = defaultDb) {
  await db.execute(`INSERT INTO enrollments (user_id, course_id, enrolled_on) VALUES (:userId, :courseId, :today)
    ON CONFLICT (user_id, course_id) DO NOTHING`, { userId, courseId, today: date(today) })
}
export async function isEnrolled(userId, courseId, db = defaultDb) {
  const rows = await db.query('SELECT 1 AS ok FROM enrollments WHERE user_id = :userId AND course_id = :courseId', { userId, courseId })
  return rows.length > 0
}
export async function listCourseIds(userId, db = defaultDb) {
  const rows = await db.query('SELECT course_id FROM enrollments WHERE user_id = :userId ORDER BY course_id', { userId })
  return rows.map((r) => r.course_id)
}
// 同じコースの受講者に同じニックネームがいないか（DBの一意制約は付けない。詳細設計書 1.2）
export async function nicknameTaken(courseIds, nickname, exceptUserId, db = defaultDb) {
  if (courseIds.length === 0) return false
  const rows = await db.query(`SELECT 1 AS taken FROM enrollments e JOIN users u ON u.user_id = e.user_id
    WHERE e.course_id = ANY(string_to_array(:courseIds, ',')::bigint[]) AND u.nickname = :nickname
      AND u.user_id <> :exceptUserId AND u.status <> 'deleted' LIMIT 1`,
  { courseIds: courseIds.join(','), nickname, exceptUserId })
  return rows.length > 0
}
