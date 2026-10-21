// partners（T-01）
import { defaultDb, camelRow, camelRows } from './_base.js'
export async function get(persona, db = defaultDb) {
  const rows = await db.query('SELECT persona, label, default_name, image_key FROM partners WHERE persona = :persona', { persona })
  return camelRow(rows[0])
}
export async function list(db = defaultDb) {
  return camelRows(await db.query('SELECT persona, label, default_name, image_key FROM partners ORDER BY persona'))
}
export async function setImage(persona, imageKey, db = defaultDb) {
  await db.execute('UPDATE partners SET image_key = :imageKey, updated_at = now() WHERE persona = :persona', { persona, imageKey })
}
