// users（T-02）・user_roles（T-03）・login_logs（T-05）
import { AppError } from '../../util/errors.js'
import { defaultDb, camelRow, camelRows, date } from './_base.js'
const USER_COLS = `u.user_id, u.auth_sub, u.email, u.full_name, u.nickname, u.status, u.partner_persona, u.partner_name,
  u.current_course_id, u.total_exp, u.level, u.streak_days, u.streak_checked_on, u.last_active_on, u.last_login_at,
  u.daily_message, u.daily_message_on, u.delete_scheduled_on,
  COALESCE((SELECT json_agg(r.role ORDER BY r.role) FROM user_roles r WHERE r.user_id = u.user_id), '[]') AS roles`
function withRoles(row) {
  const u = camelRow(row)
  if (u && typeof u.roles === 'string') u.roles = JSON.parse(u.roles)
  return u
}
export async function findBySub(sub, db = defaultDb) {
  const rows = await db.query(`SELECT ${USER_COLS} FROM users u WHERE u.auth_sub = :sub`, { sub })
  return withRoles(rows[0])
}
export async function findById(userId, db = defaultDb) {
  const rows = await db.query(`SELECT ${USER_COLS} FROM users u WHERE u.user_id = :userId`, { userId })
  return withRoles(rows[0])
}
export async function activate(userId, db = defaultDb) {
  const r = await db.execute(`UPDATE users SET status = 'active', updated_at = now() WHERE user_id = :userId AND status = 'invited'`, { userId })
  return r.numberOfRecordsUpdated === 1
}
export async function touchLogin(userId, db = defaultDb) {
  await db.execute('UPDATE users SET last_login_at = now() WHERE user_id = :userId', { userId })
  await db.execute('INSERT INTO login_logs (user_id) VALUES (:userId)', { userId })
}
export async function updateNickname(userId, nickname, db = defaultDb) {
  await db.execute('UPDATE users SET nickname = :nickname, updated_at = now() WHERE user_id = :userId', { userId, nickname })
}
export async function updatePartner(userId, persona, name, db = defaultDb) {
  await db.execute('UPDATE users SET partner_persona = :persona, partner_name = :name, updated_at = now() WHERE user_id = :userId',
    { userId, persona, name })
}
export async function setCurrentCourse(userId, courseId, db = defaultDb) {
  await db.execute('UPDATE users SET current_course_id = :courseId, updated_at = now() WHERE user_id = :userId', { userId, courseId })
}
export async function addExp(userId, { exp, level, today }, db = defaultDb) {
  await db.execute(`UPDATE users SET total_exp = total_exp + :exp, level = :level, last_active_on = :today, updated_at = now()
    WHERE user_id = :userId`, { userId, exp, level, today: date(today) })
}
export async function setDailyMessage(userId, message, today, db = defaultDb) {
  await db.execute('UPDATE users SET daily_message = :message, daily_message_on = :today WHERE user_id = :userId',
    { userId, message, today: date(today) })
}
export async function updateStreak(userId, streakDays, today, db = defaultDb) {
  await db.execute('UPDATE users SET streak_days = :streakDays, streak_checked_on = :today WHERE user_id = :userId',
    { userId, streakDays, today: date(today) })
}
// 並べ替えは許可リストからだけ選ぶ（SQLインジェクション対策。詳細設計書 9.1）
export const ADMIN_SORTS = {
  id: 'u.user_id', name: 'u.full_name', nickname: 'u.nickname', email: 'u.email', status: 'u.status', lastLogin: 'u.last_login_at'
}
export async function listForAdmin({ q = '', status = null, sort = 'id', order = 'asc', limit = 50, offset = 0 } = {}, db = defaultDb) {
  const col = ADMIN_SORTS[sort]
  if (!col) throw new AppError('VALIDATION_ERROR', undefined, { details: [{ field: 'sort' }] })
  const dir = order === 'desc' ? 'DESC' : 'ASC'
  const rows = await db.query(`SELECT ${USER_COLS}, u.deleted_at FROM users u
    WHERE (:q = '' OR u.full_name ILIKE '%' || :q || '%' OR u.nickname ILIKE '%' || :q || '%' OR u.email ILIKE '%' || :q || '%')
      AND (:status::text IS NULL OR u.status = :status)
    ORDER BY ${col} ${dir}, u.user_id LIMIT :limit OFFSET :offset`, { q, status, limit, offset })
  return rows.map(withRoles)
}
export async function create({ sub, email, fullName, roles }, db = defaultDb) {
  const rows = await db.query(`INSERT INTO users (auth_sub, email, full_name) VALUES (:sub, :email, :fullName) RETURNING user_id`,
    { sub, email, fullName })
  const userId = rows[0].user_id
  await setRoles(userId, roles, db)
  await db.execute('INSERT INTO notify_settings (user_id) VALUES (:userId) ON CONFLICT DO NOTHING', { userId })
  return userId
}
export async function setRoles(userId, roles, db = defaultDb) {
  await db.execute('DELETE FROM user_roles WHERE user_id = :userId', { userId })
  for (const role of roles) {
    await db.execute('INSERT INTO user_roles (user_id, role) VALUES (:userId, :role)', { userId, role })
  }
}
export async function markDeleted(userId, deleteOn, db = defaultDb) {
  const r = await db.execute(`UPDATE users SET status = 'deleted', deleted_at = now(), delete_scheduled_on = :deleteOn, updated_at = now()
    WHERE user_id = :userId AND status <> 'deleted'`, { userId, deleteOn: date(deleteOn) })
  return r.numberOfRecordsUpdated === 1
}
export async function restore(userId, db = defaultDb) {
  const r = await db.execute(`UPDATE users SET status = 'active', deleted_at = NULL, delete_scheduled_on = NULL, updated_at = now()
    WHERE user_id = :userId AND status = 'deleted'`, { userId })
  return r.numberOfRecordsUpdated === 1
}
export async function listPurgeTargets(today, db = defaultDb) {
  return camelRows(await db.query(`SELECT user_id, auth_sub FROM users
    WHERE status = 'deleted' AND delete_scheduled_on <= :today ORDER BY user_id LIMIT 100`, { today: date(today) }))
}
export async function purge(userId, db = defaultDb) {
  const r = await db.execute(`DELETE FROM users WHERE user_id = :userId AND status = 'deleted'`, { userId })
  return r.numberOfRecordsUpdated === 1
}
export async function lastLoginLogAt(userId, db = defaultDb) {
  const rows = await db.query('SELECT max(logged_in_at) AS last_at FROM login_logs WHERE user_id = :userId', { userId })
  return rows[0]?.last_at ?? null
}
export async function listForStreak(today, db = defaultDb) {
  return camelRows(await db.query(`SELECT user_id, streak_days, last_active_on, streak_checked_on FROM users
    WHERE status = 'active' AND (streak_checked_on IS NULL OR streak_checked_on < :today) ORDER BY user_id LIMIT 1000`,
  { today: date(today) }))
}
