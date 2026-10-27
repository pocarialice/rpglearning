// A-17 ダッシュボード、A-18 受講者一覧のCSV（外部設計書 5.4）
import { ok, csv as csvResponse } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import * as courses from '../../shared/db/repositories/courses.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { requireCourseAdmin } from './_admin.js'
export const PAGE = 1000
export const CSV_HEADER = ['氏名', 'ニックネーム', 'メールアドレス', '受講開始日', '網羅率(%)', '正答率(%)', '習得済み問題数', 'レベル', '累計EXP', '最終ログイン日時', '直近7日のログイン回数']
const round1 = (n) => Math.round(n * 10) / 10
const num = (v) => (v === null || v === undefined ? null : Number(v))
async function loadAll(courseId) {
  const all = []
  for (let offset = 0; ; offset += PAGE) {
    const rows = await courses.dashboardRows(courseId, { limit: PAGE, offset })
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}
export function summarize(rows) {
  const n = rows.length
  const avg = (key) => {
    const vals = rows.map((r) => num(r[key])).filter((v) => v !== null)
    return vals.length === 0 ? null : round1(vals.reduce((s, v) => s + v, 0) / vals.length)
  }
  return {
    learners: n,
    activeRate: n === 0 ? null : round1((100 * rows.filter((r) => num(r.logins7d) >= 2).length) / n),
    avgCoveragePct: avg('coveragePct'),
    avgCorrectPct: avg('correctPct')
  }
}
const lastLogin = (v) => (v ? toIsoJst(parseDbTimestamp(v)).slice(0, 16).replace('T', ' ') : '')
export async function get(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.query.course)
  await requireCourseAdmin(ctx, courseId)
  const rows = await loadAll(courseId)
  return ok({
    courseId: encodeId(PREFIX.course, courseId),
    summary: summarize(rows),
    learners: rows.map((r) => ({
      userId: encodeId(PREFIX.user, r.userId), fullName: r.fullName, nickname: r.nickname, email: r.email, enrolledOn: r.enrolledOn,
      coveragePct: num(r.coveragePct), correctPct: num(r.correctPct), mastered: num(r.mastered), level: r.level,
      totalExp: r.totalExp, lastLoginAt: r.lastLoginAt ? toIsoJst(parseDbTimestamp(r.lastLoginAt)) : null, logins7d: num(r.logins7d)
    }))
  })
}
// 値の囲みと数式対策（詳細設計書 5.3 A-17・A-18）
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}
export function buildCsv(rows) {
  const lines = [CSV_HEADER, ...rows.map((r) => [
    r.fullName, r.nickname, r.email, r.enrolledOn, num(r.coveragePct), num(r.correctPct), num(r.mastered), r.level, r.totalExp,
    lastLogin(r.lastLoginAt), num(r.logins7d)
  ])].map((cols) => cols.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n')
}
export async function csv(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.query.course)
  await requireCourseAdmin(ctx, courseId)
  const rows = await loadAll(courseId)
  await audit.write(ctx.user.userId, 'dashboard.csv', { type: 'course', id: courseId }, { rows: rows.length })
  return csvResponse(buildCsv(rows), `dashboard_${encodeId(PREFIX.course, courseId)}_${ctx.today.replaceAll('-', '')}.csv`)
}
