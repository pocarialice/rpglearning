// A-12b 冒険の学習サマリ、A-12c 1日の学習サマリ。ノートアプリに貼れる Markdown と、AIパートナーの200字くらいのコメントを返す
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { diffDays, todayJst, parseDbTimestamp } from '../../shared/util/date-jst.js'
import { converse } from '../../shared/ai/client.js'
import { buildSummaryCommentPrompt, fallbackSummaryComment } from '../../shared/ai/prompts/summary-comment.js'
import { buildMarkdown, formatStudyTime, reviewPoints, studySeconds, tally } from '../../shared/domain/summary.js'
import * as adventures from '../../shared/db/repositories/adventures.js'
import * as summaries from '../../shared/db/repositories/summaries.js'
// コメントの AI の設定。上限は推論モデルの考える分も含む
export const SUMMARY_AI = { maxTokens: 1500, temperature: 0.7, timeoutMs: 10000 }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
async function partnerComment({ user, log, scope, rows, seconds }) {
  const persona = user.partnerPersona ?? 'encourage'
  const t = tally(rows)
  const points = reviewPoints(rows)
  const studyTime = formatStudyTime(seconds)
  let text = fallbackSummaryComment(persona, { tally: t, weak: points.map((p) => p.label) })
  try {
    const weak = points.map((p) => (p.missing?.length ? `${p.label}（足りない観点：${p.missing.join('、')}）` : p.label))
    const p = buildSummaryCommentPrompt({ persona, name: user.partnerName ?? '', scope, studyTime, tally: t, weak })
    const res = await converse({
      modelId: process.env.MODEL_LIGHT, system: p.system, messages: [{ role: 'user', content: [{ text: p.user }] }],
      ...SUMMARY_AI, purpose: 'summary', logger: log
    })
    if (res.text.trim()) text = res.text.trim()
  } catch (err) {
    log.warn({ msg: 'summary.fallback', code: err.code ?? 'AI_ERROR' })
  }
  return { partnerName: user.partnerName ?? null, persona, text }
}
// seconds：学習時間（秒）。省くと解答の時刻から数える
async function respond(ctx, { scope, title, date, rows, extra, seconds = studySeconds(rows) }) {
  const t = tally(rows)
  const comment = rows.length ? await partnerComment({ user: ctx.user, log: ctx.log, scope, rows, seconds }) : null
  return ok({
    ...extra, scope, date, studySeconds: seconds, studyTime: formatStudyTime(seconds),
    answerCount: t.answerCount, correctCount: t.correctCount, comment,
    markdown: rows.length ? buildMarkdown({ title, date, rows, seconds, comment }) : null
  })
}
export async function adventure(ctx) {
  const { user } = ctx
  const adventureId = decodeId(PREFIX.adventure, ctx.params.id)
  if (!(await adventures.find(adventureId, user.userId))) throw new AppError('NOT_FOUND', '冒険が見つかりません')
  const [rows, s] = await Promise.all([summaries.listForAdventure(user.userId, adventureId), adventures.summary(adventureId, user.userId)])
  // 学習時間は冒険のまとめ（S-15）と同じ値（adventures.study_seconds）を使う
  const seconds = s?.studySeconds ?? studySeconds(rows)
  // 学習日は冒険を始めた日（解答がなければ今日）
  const first = rows[0]
  const date = first?.adventureStartedAt ? todayJst(parseDbTimestamp(first.adventureStartedAt)) : (first?.answeredOn ?? ctx.today)
  return respond(ctx, { scope: 'adventure', title: '冒険のまとめ', date, rows, seconds, extra: { adventureId: encodeId(PREFIX.adventure, adventureId) } })
}
export async function day(ctx) {
  const { user, today } = ctx
  const date = ctx.query.date ?? today
  if (!DATE_RE.test(date) || diffDays(date, today) < 0) {
    throw new AppError('VALIDATION_ERROR', '日付の形式が正しくありません', { details: [{ field: 'date', code: 'INVALID' }] })
  }
  const rows = await summaries.listForDate(user.userId, date)
  return respond(ctx, { scope: 'day', title: '1日のまとめ', date, rows, extra: {} })
}
