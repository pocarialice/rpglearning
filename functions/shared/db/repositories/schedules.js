// schedule_runs（T-28）。EventBridge Scheduler の代わりに、ワーカーが枠ごとに1回だけ定期処理を動かす（詳細設計書 3.8）
import { defaultDb, json } from './_base.js'
// その枠を自分が動かすことになったら true（ほかのワーカーがすでに動かしていたら false）
export async function claim(name, slot, db = defaultDb) {
  const rows = await db.query(`INSERT INTO schedule_runs (name, slot) VALUES (:name, :slot) ON CONFLICT DO NOTHING RETURNING name`, { name, slot })
  return rows.length === 1
}
export async function finish(name, slot, result, db = defaultDb) {
  await db.execute(`UPDATE schedule_runs SET finished_at = now(), result = :result WHERE name = :name AND slot = :slot`,
    { name, slot, result: json(result) })
}
// 失敗した枠の記録を消して、もう一度動かせるようにする
export async function release(name, slot, db = defaultDb) {
  await db.execute('DELETE FROM schedule_runs WHERE name = :name AND slot = :slot AND finished_at IS NULL', { name, slot })
}
