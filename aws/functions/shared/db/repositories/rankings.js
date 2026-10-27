// weekly_rankings（T-18）。今週分は exp_logs から集計する（exp.weeklyTotals）
import { defaultDb, camelRows, date } from './_base.js'
import { weeklyTotals } from './exp.js'
export async function currentWeek(courseId, weekStart, db = defaultDb) {
  return weeklyTotals(courseId, weekStart, db)
}
export async function history(courseId, weekStart, db = defaultDb) {
  return camelRows(await db.query(`SELECT user_id, nickname, weekly_exp, rank FROM weekly_rankings
    WHERE course_id = :courseId AND week_start = :weekStart ORDER BY rank, nickname LIMIT 1000`,
  { courseId, weekStart: date(weekStart) }))
}
export async function weeks(courseId, db = defaultDb) {
  const rows = await db.query(`SELECT DISTINCT week_start FROM weekly_rankings WHERE course_id = :courseId
    ORDER BY week_start DESC LIMIT 12`, { courseId })
  return rows.map((r) => r.week_start)
}
export async function closeWeek(rows, db = defaultDb) {
  let inserted = 0
  for (const r of rows) {
    const res = await db.execute(`INSERT INTO weekly_rankings (course_id, week_start, user_id, weekly_exp, rank, nickname)
      VALUES (:courseId, :weekStart, :userId, :weeklyExp, :rank, :nickname)
      ON CONFLICT (course_id, week_start, user_id) DO NOTHING`,
    { courseId: r.courseId, weekStart: date(r.weekStart), userId: r.userId, weeklyExp: r.weeklyExp, rank: r.rank, nickname: r.nickname })
    inserted += res.numberOfRecordsUpdated
  }
  return inserted
}
