// adventures（T-13）。1回の冒険は10問
import { defaultDb, camelRow, json } from './_base.js'
export const ADVENTURE_SIZE = 10
function parse(row) {
  const a = camelRow(row)
  if (a && typeof a.served === 'string') a.served = JSON.parse(a.served)
  return a
}
export async function start(userId, courseId, db = defaultDb) {
  const rows = await db.query(`INSERT INTO adventures (user_id, course_id) VALUES (:userId, :courseId)
    RETURNING adventure_id, user_id, course_id, served_count, last_kind, served`, { userId, courseId })
  return parse(rows[0])
}
export async function find(adventureId, userId, db = defaultDb) {
  const rows = await db.query(`SELECT adventure_id, user_id, course_id, served_count, last_kind, served, finished_at
    FROM adventures WHERE adventure_id = :adventureId AND user_id = :userId`, { adventureId, userId })
  return parse(rows[0])
}
export async function incrementServed(adventureId, entry, db = defaultDb) {
  const r = await db.execute(`UPDATE adventures SET served_count = served_count + 1, last_kind = :kind,
      served = served || :entry WHERE adventure_id = :adventureId AND served_count < 10 AND finished_at IS NULL`,
  { adventureId, kind: entry.k, entry: json([entry]) })
  return r.numberOfRecordsUpdated === 1
}
export async function finish(adventureId, db = defaultDb) {
  await db.execute('UPDATE adventures SET finished_at = now() WHERE adventure_id = :adventureId AND finished_at IS NULL', { adventureId })
}
