// A-12d コースごとの実績（一覧・詳細）、A-12e コースの実績へのパートナーコメント（S-16・S-17）
// 受講したコースと、解答したことのあるコースが対象。学習時間はコースごとの冒険の学習時間の合計
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { formatStudyTime, snippet } from '../../shared/domain/summary.js'
import { generateComment } from './summaries.js'
import * as records from '../../shared/db/repositories/course-records.js'
export const WEAK_LIMIT = 3
const round1 = (n) => Math.round(n * 10) / 10
const pct = (num, den) => (den ? round1((100 * num) / den) : null)
// 一覧・プロフィールの受講中のコースに出す形
export function courseItem(row, currentCourseId) {
  return {
    id: encodeId(PREFIX.course, row.courseId),
    name: row.name,
    certification: row.certification ?? null,
    current: row.courseId === currentCourseId,
    enrolled: !!row.enrolledOn,
    enrolledOn: row.enrolledOn ?? null,
    lastStudiedOn: row.lastStudiedOn ?? null,
    studySeconds: row.studySeconds ?? 0,
    studyTime: formatStudyTime(row.studySeconds ?? 0),
    coveragePct: row.publishedCount ? round1((100 * (row.answeredQuestions ?? 0)) / row.publishedCount) : 0,
    correctPct: pct(row.choiceCorrect ?? 0, row.choiceCount ?? 0)
  }
}
function weakItem(w) {
  if (w.kind === 'choice') return { kind: 'choice', label: snippet(w.questionBody), missCount: w.missCount, score: null, missingPoints: [] }
  const missing = (w.missingPoints ?? []).map((m) => snippet(m)).filter(Boolean)
  return { kind: 'explain', label: snippet(w.keyword ?? ''), missCount: w.missCount, score: w.lastScore ?? null, missingPoints: missing }
}
async function load(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.params.id)
  const row = await records.findForUser(ctx.user.userId, courseId)
  if (!row) throw new AppError('NOT_FOUND', 'コースが見つかりません')
  return { courseId, row }
}
export async function list(ctx) {
  const rows = await records.listForUser(ctx.user.userId)
  const courses = rows.map((r) => courseItem(r, ctx.user.currentCourseId))
  const total = ctx.user.totalStudySeconds ?? 0
  return ok({ totalStudySeconds: total, totalStudyTime: formatStudyTime(total), courses })
}
export async function detail(ctx) {
  const { courseId, row } = await load(ctx)
  const [c, weak] = await Promise.all([
    records.detailCounts(ctx.user.userId, courseId, ctx.today),
    records.listWeak(ctx.user.userId, courseId, WEAK_LIMIT)
  ])
  return ok({
    ...courseItem(row, ctx.user.currentCourseId),
    adventureCount: c?.adventureCount ?? 0,
    answerCount: c?.answerCount ?? 0,
    choice: { count: c?.choiceCount ?? 0, correct: c?.choiceCorrect ?? 0 },
    explain: { count: c?.explainCount ?? 0, passed: c?.explainPassed ?? 0, avgScore: c?.explainAvgScore ?? null },
    mastered: c?.mastered ?? 0,
    dueToday: c?.dueToday ?? 0,
    weak: weak.map(weakItem)
  })
}
// 開いたときに作る（保存しない）。解答がなければ AI を呼ばず comment は null
export async function comment(ctx) {
  const { courseId, row } = await load(ctx)
  const [c, weak] = await Promise.all([
    records.detailCounts(ctx.user.userId, courseId, ctx.today),
    records.listWeak(ctx.user.userId, courseId, WEAK_LIMIT)
  ])
  if (!c?.answerCount) return ok({ courseId: encodeId(PREFIX.course, courseId), comment: null })
  const item = courseItem(row, ctx.user.currentCourseId)
  const t = {
    answerCount: c.answerCount, correctCount: c.correctCount, reviewCount: c.reviewAnswerCount,
    choiceCount: c.choiceCount, choiceCorrect: c.choiceCorrect, explainCount: c.explainCount, explainPassed: c.explainPassed
  }
  const items = weak.map(weakItem)
  const extra = [
    `冒険の回数：${c.adventureCount}回`,
    `網羅率：${item.coveragePct}%`,
    `習得済み：${c.mastered}問`,
    `今日の復習：${c.dueToday}問`
  ]
  const result = await generateComment({
    user: ctx.user, log: ctx.log, scope: 'course', studyTime: item.studyTime, tally: t, courseName: row.name, extra,
    weak: items.map((w) => w.label),
    weakDetail: items.map((w) => {
      const misses = `${w.missCount}回まちがい`
      return w.missingPoints.length ? `${w.label}（${misses}・足りない観点：${w.missingPoints.join('、')}）` : `${w.label}（${misses}）`
    })
  })
  return ok({ courseId: encodeId(PREFIX.course, courseId), comment: result })
}
