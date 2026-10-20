// notify_settings（T-04）
import { defaultDb, camelRow, camelRows, date } from './_base.js'
export async function get(userId, db = defaultDb) {
  const rows = await db.query(`SELECT email_enabled, to_char(send_time, 'HH24:MI') AS send_time, push_enabled
    FROM notify_settings WHERE user_id = :userId`, { userId })
  return camelRow(rows[0])
}
export async function put(userId, { emailEnabled, sendTime }, db = defaultDb) {
  await db.execute(`INSERT INTO notify_settings (user_id, email_enabled, send_time) VALUES (:userId, :emailEnabled, :sendTime::time)
    ON CONFLICT (user_id) DO UPDATE SET email_enabled = EXCLUDED.email_enabled, send_time = EXCLUDED.send_time, updated_at = now()`,
  { userId, emailEnabled, sendTime })
}
// その日の送信リストを作るための一覧（通知オンの有効な学習者）
export async function listForSlotBuild(today, db = defaultDb) {
  return camelRows(await db.query(`SELECT u.user_id, u.email, u.nickname, u.partner_persona, u.partner_name,
      to_char(s.send_time, 'HH24MI') AS slot,
      (SELECT count(*) FROM review_items r WHERE r.user_id = u.user_id AND r.course_id = u.current_course_id
         AND r.stage < 6 AND r.next_review_on <= :today)::int AS review_count,
      COALESCE((SELECT json_agg(d.title ORDER BY d.sort_order) FROM user_quests q JOIN quest_defs d ON d.quest_code = q.quest_code
         WHERE q.user_id = u.user_id AND q.quest_on = :today), '[]') AS quests
    FROM users u JOIN notify_settings s ON s.user_id = u.user_id
    WHERE u.status = 'active' AND s.email_enabled AND u.nickname IS NOT NULL
    ORDER BY u.user_id LIMIT 2000`, { today: date(today) }))
}
