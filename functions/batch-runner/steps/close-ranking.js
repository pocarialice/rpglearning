// 月曜だけ：前週のランキングを確定して weekly_rankings に保存する（冪等：ON CONFLICT DO NOTHING）
import { addDays } from '../../shared/util/date-jst.js'
import { rankRows } from '../../shared/domain/ranking.js'
import * as courses from '../../shared/db/repositories/courses.js'
import * as exp from '../../shared/db/repositories/exp.js'
import * as rankings from '../../shared/db/repositories/rankings.js'
export async function run({ today }) {
  const weekStart = addDays(today, -7)
  let inserted = 0
  for (const courseId of await courses.listIds()) {
    const rows = (await exp.weeklyTotals(courseId, weekStart)).filter((r) => r.status !== 'deleted')
    const ranked = rankRows(rows).map((r) => ({ courseId, weekStart, userId: r.userId, weeklyExp: r.weeklyExp, rank: r.rank, nickname: r.nickname }))
    if (ranked.length > 0) inserted += await rankings.closeWeek(ranked)
  }
  return { weekStart, inserted }
}
