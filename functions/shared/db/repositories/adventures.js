// adventures（T-13）。1回の冒険は5問
import { defaultDb, camelRow, json } from './_base.js'
export const ADVENTURE_SIZE = 5
// 1問ぶんの学習時間の上限（秒）。問題を開いたまま放置しても累計が増えすぎないようにする
export const STUDY_CAP_SECONDS = 600
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
      served = served || :entry WHERE adventure_id = :adventureId AND served_count < :size AND finished_at IS NULL`,
  { adventureId, kind: entry.k, entry: json([entry]), size: ADVENTURE_SIZE })
  return r.numberOfRecordsUpdated === 1
}
export async function finish(adventureId, db = defaultDb) {
  await db.execute('UPDATE adventures SET finished_at = now() WHERE adventure_id = :adventureId AND finished_at IS NULL', { adventureId })
}
// 解答したときに、前の解答（最初は冒険の開始）からの時間を冒険と利用者の累計に足す。足した秒数を返す
export async function addStudyTime(adventureId, userId, db = defaultDb) {
  const rows = await db.query(`WITH d AS (
      SELECT adventure_id, user_id, LEAST(GREATEST(EXTRACT(EPOCH FROM (now() - last_activity_at)), 0), :cap)::int AS sec
      FROM adventures WHERE adventure_id = :adventureId AND user_id = :userId FOR UPDATE
    ), a AS (
      UPDATE adventures SET study_seconds = adventures.study_seconds + d.sec, last_activity_at = now()
      FROM d WHERE adventures.adventure_id = d.adventure_id
    ), u AS (
      UPDATE users SET total_study_seconds = users.total_study_seconds + d.sec FROM d WHERE users.user_id = d.user_id
    )
    SELECT sec FROM d`, { adventureId, userId, cap: STUDY_CAP_SECONDS })
  return rows[0]?.sec ?? 0
}
// 冒険のまとめ（S-15）。解答数・正解数・説明の平均点・解答で得たEXP・かかった時間・累計の学習時間
export async function summary(adventureId, userId, db = defaultDb) {
  const rows = await db.query(`SELECT a.study_seconds, u.total_study_seconds,
      count(l.answer_id)::int AS answered,
      count(l.answer_id) FILTER (WHERE l.is_correct)::int AS correct,
      count(l.answer_id) FILTER (WHERE l.kind = 'explain')::int AS explain_count,
      round(avg(l.score) FILTER (WHERE l.kind = 'explain'))::int AS explain_avg_score,
      COALESCE(sum(e.exp), 0)::int AS exp_gained
    FROM adventures a JOIN users u ON u.user_id = a.user_id
    LEFT JOIN answer_logs l ON l.adventure_id = a.adventure_id
    LEFT JOIN exp_logs e ON e.reason = l.kind AND e.ref_id = l.answer_id
    WHERE a.adventure_id = :adventureId AND a.user_id = :userId
    GROUP BY a.adventure_id, u.user_id`, { adventureId, userId })
  return camelRow(rows[0])
}
