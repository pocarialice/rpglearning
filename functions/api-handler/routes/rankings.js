// A-11 週間ランキング
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, PREFIX } from '../../shared/util/ids.js'
import { addDays, diffDays } from '../../shared/util/date-jst.js'
import { rankRows } from '../../shared/domain/ranking.js'
import * as enrollments from '../../shared/db/repositories/enrollments.js'
import * as exp from '../../shared/db/repositories/exp.js'
import * as rankings from '../../shared/db/repositories/rankings.js'
export const TOP_N = 10
function isMonday(week) {
  try {
    return addDays(week, 0) === week && new Date(`${week}T00:00:00Z`).getUTCDay() === 1
  } catch {
    return false
  }
}
export async function get(ctx) {
  const { user, today, weekStart: thisWeek, query } = ctx
  const courseId = query.course ? decodeId(PREFIX.course, query.course) : user.currentCourseId
  if (!courseId) throw new AppError('COURSE_REQUIRED')
  if (!(await enrollments.isEnrolled(user.userId, courseId))) throw new AppError('FORBIDDEN', '受講していないコースです')
  const week = query.week ?? thisWeek
  if (!isMonday(week)) throw new AppError('VALIDATION_ERROR', '週は月曜日の日付で指定してください', { details: [{ field: 'week', code: 'INVALID' }] })
  let ranked
  if (week === thisWeek) {
    const rows = await exp.weeklyTotals(courseId, week)
    ranked = rankRows(rows.filter((r) => r.status !== 'deleted'))
  } else {
    ranked = await rankings.history(courseId, week)
  }
  const view = (r) => ({ rank: r.rank, nickname: r.nickname, weeklyExp: r.weeklyExp, isMe: r.userId === user.userId })
  const rows = ranked.slice(0, TOP_N).map(view)
  const mine = ranked.find((r) => r.userId === user.userId)
  if (mine && !rows.some((r) => r.isMe)) rows.push(view(mine))
  return ok({
    weekStart: week,
    weekEnd: addDays(week, 6),
    daysToReset: diffDays(today, addDays(thisWeek, 7)),
    rows,
    me: mine ? view(mine) : null,
    weeks: await rankings.weeks(courseId)
  })
}
