// A-15 問題の修正・削除、A-16 問題の公開、A-15b 登録済みの問題の一覧
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { validateQuestionDraft } from '../../shared/util/validators.js'
import { withTx } from '../../shared/db/tx.js'
import * as questions from '../../shared/db/repositories/questions.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { requireCourseAdmin } from './_admin.js'
const filled = (s, max) => typeof s === 'string' && s.trim() !== '' && [...s].length <= max
const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
async function loadOwned(ctx) {
  const questionId = decodeId(PREFIX.question, ctx.params.id)
  const q = await questions.findById(questionId)
  if (!q || q.status === 'archived') throw new AppError('NOT_FOUND', '問題が見つかりません')
  await requireCourseAdmin(ctx, q.courseId)
  return q
}
// 公開できる形か（選択肢4つ・正解・解説がそろっているか）を確かめる
export const checkPublishable = (q) => validateQuestionDraft({ body: q.body, choices: q.choices, correct: q.correctChoice, explanation: q.explanation, keywords: q.keywords.map((k) => k.keyword) })
// 一覧に返す1問の形（A-14 の下書き・A-15b で共通）
export const questionView = (q) => ({
  id: encodeId(PREFIX.question, q.questionId), bodyHead: [...q.body].slice(0, 40).join(''), body: q.body,
  choiceCount: q.choices.length, choices: q.choices, correctChoice: q.correctChoice, explanation: q.explanation,
  keywordCount: q.keywords.length, keywords: q.keywords.map((k) => k.keyword), status: q.status
})
export const LIST_STATUSES = ['draft', 'needs_review', 'published']
export async function list(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.query.course)
  await requireCourseAdmin(ctx, courseId)
  const status = ctx.query.status || null
  if (status !== null && !LIST_STATUSES.includes(status)) throw invalid('status')
  const rows = await questions.listByCourse(courseId, status)
  return ok({ courseId: encodeId(PREFIX.course, courseId), questions: rows.map(questionView) })
}
export async function put(ctx) {
  const q = await loadOwned(ctx)
  const b = ctx.body()
  if (!filled(b.body, 4000)) throw invalid('body')
  if (!Array.isArray(b.choices) || b.choices.length < 2 || b.choices.length > 10 || !b.choices.every((c) => filled(c, 1000))) throw invalid('choices')
  if (b.correctChoice !== null && b.correctChoice !== undefined && !(Number.isInteger(b.correctChoice) && b.correctChoice >= 1 && b.correctChoice <= 4)) throw invalid('correctChoice')
  const keywords = b.keywords ?? []
  if (!Array.isArray(keywords) || keywords.length > 3 || !keywords.every((k) => filled(k, 50))) throw invalid('keywords')
  const draft = { body: b.body, choices: b.choices, correct: b.correctChoice ?? null, explanation: b.explanation ?? '', keywords }
  const complete = validateQuestionDraft(draft)
  // 公開済みの問題は公開できる形のままでなければならない
  if (q.status === 'published' && !complete.ok) throw new AppError('VALIDATION_ERROR', '選択肢を4つそろえてから公開してください', { details: [{ field: complete.field, code: 'M-12' }] })
  const status = q.status === 'published' ? 'published' : complete.ok ? 'draft' : 'needs_review'
  await withTx(async (tx) => {
    const updated = await questions.update(q.questionId, { ...draft, status }, ctx.user.userId, tx)
    if (!updated) throw new AppError('CONFLICT', '問題の状態が変わりました')
    await audit.write(ctx.user.userId, 'question.update', { type: 'question', id: q.questionId }, { status }, tx)
  })
  return ok({ id: encodeId(PREFIX.question, q.questionId), status })
}
export async function remove(ctx) {
  const q = await loadOwned(ctx)
  const result = await withTx(async (tx) => {
    const r = await questions.deleteOrArchive(q.questionId, q.status, ctx.user.userId, tx)
    await audit.write(ctx.user.userId, 'question.delete', { type: 'question', id: q.questionId }, { result: r }, tx)
    return r
  })
  return ok({ id: encodeId(PREFIX.question, q.questionId), result })
}
export async function publish(ctx) {
  const q = await loadOwned(ctx)
  if (q.status === 'published') return ok({ id: encodeId(PREFIX.question, q.questionId), status: 'published' })
  const v = checkPublishable(q)
  if (!v.ok) throw new AppError('VALIDATION_ERROR', '選択肢を4つそろえてから公開してください', { details: [{ field: v.field, code: 'M-12' }] })
  await withTx(async (tx) => {
    if (!(await questions.publish(q.questionId, ctx.user.userId, tx))) throw new AppError('CONFLICT', '問題の状態が変わりました')
    await audit.write(ctx.user.userId, 'question.publish', { type: 'question', id: q.questionId }, {}, tx)
  })
  return ok({ id: encodeId(PREFIX.question, q.questionId), status: 'published' })
}
