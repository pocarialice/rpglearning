// A-13 取り込みの登録、A-13b アップロード完了、A-14 取り込み状況と下書き、A-16b 下書きの一括公開
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import { assertValid, validateImportRequest } from '../../shared/util/validators.js'
import { withTx } from '../../shared/db/tx.js'
import * as imports from '../../shared/db/repositories/imports.js'
import * as questions from '../../shared/db/repositories/questions.js'
import * as jobs from '../../shared/db/repositories/jobs.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { putObject, presignPut } from '../../shared/storage/object-storage.js'
import { requireCourseAdmin } from './_admin.js'
import { checkPublishable, questionView } from './admin-questions.js'
// 英数字・.・-・_ 以外を _ に置き換え、100文字まで
export function safeFileName(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(-100)
}
export async function create(ctx) {
  const body = ctx.body()
  const courseId = decodeId(PREFIX.course, body.courseId)
  await requireCourseAdmin(ctx, courseId)
  assertValid(validateImportRequest(body))
  const isText = body.sourceType === 'text'
  const fileName = isText ? 'source.txt' : safeFileName(body.fileName)
  // キーに取り込みIDを含めるため、仮の値で登録してから書き換える。途中で失敗したら登録ごと取り消し、仮の値を残さない
  const { importId, key } = await withTx(async (tx) => {
    const id = await imports.create({ courseId, userId: ctx.user.userId, sourceType: body.sourceType, fileName: isText ? 'テキスト' : body.fileName, s3Key: 'pending' }, tx)
    const k = `uploads/${id}/${fileName}`
    await imports.setKey(id, k, tx)
    return { importId: id, key: k }
  })
  const res = { importId: encodeId(PREFIX.import, importId) }
  if (isText) {
    await putObject(process.env.IMPORT_BUCKET, key, body.text, 'text/plain; charset=utf-8')
    await jobs.enqueue('import', { importId })
  } else {
    res.uploadUrl = await presignPut(process.env.IMPORT_BUCKET, key, body.contentType)
  }
  return ok(res, 201)
}
// A-13b 画面が署名付きURLでファイルを置き終えたら呼ぶ（S3 のイベント通知の代わり）。待ち状態のときだけキューに入れる
export async function uploaded(ctx) {
  const importId = decodeId(PREFIX.import, ctx.params.id)
  const job = await imports.find(importId)
  if (!job || job.sourceType === 'text') throw new AppError('NOT_FOUND', '取り込みが見つかりません')
  await requireCourseAdmin(ctx, job.courseId)
  if (job.status !== 'waiting') throw new AppError('CONFLICT', 'すでに取り込みを始めています')
  await jobs.enqueue('import', { importId })
  return ok({ importId: encodeId(PREFIX.import, importId), status: 'waiting' }, 202)
}
export async function get(ctx) {
  const importId = decodeId(PREFIX.import, ctx.params.id)
  const job = await imports.find(importId)
  if (!job) throw new AppError('NOT_FOUND', '取り込みが見つかりません')
  await requireCourseAdmin(ctx, job.courseId)
  const drafts = await questions.findDraftsByImport(importId)
  return ok({
    importId: encodeId(PREFIX.import, importId), courseId: encodeId(PREFIX.course, job.courseId), sourceType: job.sourceType,
    fileName: job.fileName, status: job.status, extractedCount: job.extractedCount, errorMessage: job.errorMessage ?? null,
    drafts: drafts.map(questionView)
  })
}
export async function list(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.query.course)
  await requireCourseAdmin(ctx, courseId)
  const rows = await imports.listByCourse(courseId)
  return ok({ imports: rows.map((j) => ({ importId: encodeId(PREFIX.import, j.importId), sourceType: j.sourceType, fileName: j.fileName, status: j.status, extractedCount: j.extractedCount, errorMessage: j.errorMessage ?? null, createdAt: toIsoJst(parseDbTimestamp(j.createdAt)) })) })
}
// A-16b 取り込みの下書きのうち、公開できる形のものをまとめて公開する。要確認・足りない下書きは残して件数を返す
export async function publishAll(ctx) {
  const importId = decodeId(PREFIX.import, ctx.params.id)
  const job = await imports.find(importId)
  if (!job) throw new AppError('NOT_FOUND', '取り込みが見つかりません')
  await requireCourseAdmin(ctx, job.courseId)
  const drafts = await questions.findDraftsByImport(importId)
  const targets = drafts.filter((q) => checkPublishable(q).ok)
  const published = await withTx(async (tx) => {
    let n = 0
    for (const q of targets) {
      // 別の画面で先に公開・削除されたものは飛ばす
      if (!(await questions.publish(q.questionId, ctx.user.userId, tx))) continue
      await audit.write(ctx.user.userId, 'question.publish', { type: 'question', id: q.questionId }, { bulk: true, importId }, tx)
      n += 1
    }
    return n
  })
  return ok({ importId: encodeId(PREFIX.import, importId), published, skipped: drafts.length - published })
}
