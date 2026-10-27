// ログインまわり（T-02 の認証の列・T-25 auth_refresh_tokens・T-26 password_resets）
import { defaultDb, camelRow } from './_base.js'
export const LOCK_AFTER_FAILURES = 5
export const LOCK_MINUTES = 15
const ROLES = `COALESCE((SELECT json_agg(r.role ORDER BY r.role) FROM user_roles r WHERE r.user_id = u.user_id), '[]') AS roles`
function withRoles(row) {
  const u = camelRow(row)
  if (u && typeof u.roles === 'string') u.roles = JSON.parse(u.roles)
  return u
}
export async function findByEmail(email, db = defaultDb) {
  const rows = await db.query(`SELECT u.user_id, u.auth_sub, u.email, u.full_name, u.status, u.password_hash, u.must_change_password,
      u.temp_password_expires_at, u.failed_login_count, u.locked_until, (u.locked_until > now()) AS locked, ${ROLES}
    FROM users u WHERE lower(u.email) = lower(:email)`, { email })
  return withRoles(rows[0])
}
export async function findById(userId, db = defaultDb) {
  const rows = await db.query(`SELECT u.user_id, u.auth_sub, u.email, u.full_name, u.status, u.must_change_password, ${ROLES}
    FROM users u WHERE u.user_id = :userId`, { userId })
  return withRoles(rows[0])
}
// 失敗を数え、続けて5回失敗したら15分ロックする
export async function recordFailure(userId, db = defaultDb) {
  await db.execute(`UPDATE users SET failed_login_count = failed_login_count + 1,
      locked_until = CASE WHEN failed_login_count + 1 >= ${LOCK_AFTER_FAILURES} THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END
    WHERE user_id = :userId`, { userId })
}
export async function recordSuccess(userId, db = defaultDb) {
  await db.execute('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = :userId', { userId })
}
// 仮パスワード（mustChange=true、期限つき）か、本人が決めたパスワードを保存する。ロックも解く
export async function setPassword(userId, hash, { mustChange, tempValidDays = 7 }, db = defaultDb) {
  await db.execute(`UPDATE users SET password_hash = :hash, must_change_password = :mustChange,
      temp_password_expires_at = CASE WHEN :mustChange THEN now() + make_interval(days => :days) ELSE NULL END,
      password_changed_at = now(), failed_login_count = 0, locked_until = NULL, updated_at = now()
    WHERE user_id = :userId`, { userId, hash, mustChange, days: tempValidDays })
}
export async function tempPasswordExpired(userId, db = defaultDb) {
  const rows = await db.query(`SELECT (must_change_password AND temp_password_expires_at < now()) AS expired FROM users WHERE user_id = :userId`, { userId })
  return rows[0]?.expired === true
}
export async function saveRefreshToken(tokenHash, userId, days, db = defaultDb) {
  await db.execute(`INSERT INTO auth_refresh_tokens (token_hash, user_id, expires_at) VALUES (:tokenHash, :userId, now() + make_interval(days => :days))`,
    { tokenHash, userId, days })
}
// 使えるリフレッシュトークンを無効にして、持ち主を返す（使い回しの防止。1回使ったら新しいものに替える）
export async function consumeRefreshToken(tokenHash, db = defaultDb) {
  const rows = await db.query(`UPDATE auth_refresh_tokens SET revoked_at = now()
    WHERE token_hash = :tokenHash AND revoked_at IS NULL AND expires_at > now() RETURNING user_id`, { tokenHash })
  return rows[0]?.user_id ?? null
}
export async function revokeRefreshToken(tokenHash, db = defaultDb) {
  await db.execute('UPDATE auth_refresh_tokens SET revoked_at = now() WHERE token_hash = :tokenHash AND revoked_at IS NULL', { tokenHash })
}
export async function revokeAllForUser(userId, db = defaultDb) {
  await db.execute('UPDATE auth_refresh_tokens SET revoked_at = now() WHERE user_id = :userId AND revoked_at IS NULL', { userId })
}
// 直近 seconds 秒以内に再設定リンクを出していたら true（メールの連打を防ぐ）
export async function recentResetExists(userId, seconds, db = defaultDb) {
  const rows = await db.query(`SELECT 1 FROM password_resets WHERE user_id = :userId AND created_at > now() - make_interval(secs => :seconds) LIMIT 1`,
    { userId, seconds })
  return rows.length > 0
}
export async function saveReset(tokenHash, userId, minutes, db = defaultDb) {
  await db.execute(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (:tokenHash, :userId, now() + make_interval(mins => :minutes))`,
    { tokenHash, userId, minutes })
}
// 期限内で未使用なら使用済みにして持ち主を返す
export async function consumeReset(tokenHash, db = defaultDb) {
  const rows = await db.query(`UPDATE password_resets SET used_at = now()
    WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > now() RETURNING user_id`, { tokenHash })
  return rows[0]?.user_id ?? null
}
// 期限切れの記録の削除（日次処理）
export async function deleteExpired(db = defaultDb) {
  const a = await db.execute(`DELETE FROM auth_refresh_tokens WHERE expires_at < now() - interval '1 day'`)
  const b = await db.execute(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`)
  return a.numberOfRecordsUpdated + b.numberOfRecordsUpdated
}
