// badge_defs（T-21）・user_badges（T-22）
import { defaultDb, camelRows } from './_base.js'
export async function listOwned(userId, db = defaultDb) {
  const rows = await db.query('SELECT badge_code FROM user_badges WHERE user_id = :userId ORDER BY badge_code', { userId })
  return rows.map((r) => r.badge_code)
}
export async function grant(userId, codes, db = defaultDb) {
  for (const code of codes) {
    await db.execute('INSERT INTO user_badges (user_id, badge_code) VALUES (:userId, :code) ON CONFLICT DO NOTHING', { userId, code })
  }
}
export async function listDefs(db = defaultDb) {
  return camelRows(await db.query(`SELECT badge_code, category, tier, name, threshold, condition_text, phase
    FROM badge_defs ORDER BY sort_order`))
}
