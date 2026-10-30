// A-15 問題の修正・削除、A-16 問題の公開、A-15b 登録済みの問題の一覧、A-16b まとめて公開・削除
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
  const importId = ctx.query.import ? decodeId(PREFIX.import, ctx.query.import) : null
  const rows = await questions.listByCourse(courseId, { status, importId })
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
export const BULK_ACTIONS = ['publish', 'delete']
export const BULK_MAX = 500
// A-16b 選んだ問題をまとめて公開・削除する。1つのトランザクションで処理し、できなかった問題は飛ばして数を返す
// 公開：公開できる形の下書き・要確認だけ。削除：A-15 の DELETE と同じ（下書き・要確認は削除、公開済みは archived）
export async function bulk(ctx) {
  const b = ctx.body()
  if (!BULK_ACTIONS.includes(b.action)) throw invalid('action')
  if (!Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > BULK_MAX) throw invalid('ids')
  const ids = [...new Set(b.ids.map((s) => decodeId(PREFIX.question, s)))]
  const rows = (await questions.findByIds(ids)).filter((q) => q.status !== 'archived')
  for (const courseId of new Set(rows.map((q) => q.courseId))) await requireCourseAdmin(ctx, courseId)
  const done = await withTx(async (tx) => {
    const out = []
    for (const q of rows) {
      if (b.action === 'publish') {
        if (q.status === 'published' || !checkPublishable(q).ok) continue
        // 別の画面で先に公開・削除されたものは飛ばす
        if (!(await questions.publish(q.questionId, ctx.user.userId, tx))) continue
        await audit.write(ctx.user.userId, 'question.publish', { type: 'question', id: q.questionId }, { bulk: true }, tx)
      } else {
        const r = await questions.deleteOrArchive(q.questionId, q.status, ctx.user.userId, tx)
        await audit.write(ctx.user.userId, 'question.delete', { type: 'question', id: q.questionId }, { result: r, bulk: true }, tx)
      }
      out.push(q.questionId)
    }
    return out
  })
  return ok({ action: b.action, done: done.length, skipped: ids.length - done.length, ids: done.map((id) => encodeId(PREFIX.question, id)) })
}
