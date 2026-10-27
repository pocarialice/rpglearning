// A-13 取り込みの登録、A-14 取り込み状況と下書き
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import { assertValid, validateImportRequest } from '../../shared/util/validators.js'
import { withTx } from '../../shared/db/tx.js'
import * as imports from '../../shared/db/repositories/imports.js'
import * as questions from '../../shared/db/repositories/questions.js'
import { s3Client, presignPut } from '../lib/aws.js'
import { requireCourseAdmin } from './_admin.js'
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
    await s3Client().send(new PutObjectCommand({ Bucket: process.env.IMPORT_BUCKET, Key: key, Body: body.text, ContentType: 'text/plain; charset=utf-8' }))
  } else {
    res.uploadUrl = await presignPut(process.env.IMPORT_BUCKET, key, body.contentType)
  }
  return ok(res, 201)
}
const draftView = (q) => ({
  id: encodeId(PREFIX.question, q.questionId), bodyHead: [...q.body].slice(0, 40).join(''), body: q.body,
  choiceCount: q.choices.length, choices: q.choices, correctChoice: q.correctChoice, explanation: q.explanation,
  keywordCount: q.keywords.length, keywords: q.keywords.map((k) => k.keyword), status: q.status
})
export async function get(ctx) {
  const importId = decodeId(PREFIX.import, ctx.params.id)
  const job = await imports.find(importId)
  if (!job) throw new AppError('NOT_FOUND', '取り込みが見つかりません')
  await requireCourseAdmin(ctx, job.courseId)
  const drafts = await questions.findDraftsByImport(importId)
  return ok({
    importId: encodeId(PREFIX.import, importId), courseId: encodeId(PREFIX.course, job.courseId), sourceType: job.sourceType,
    fileName: job.fileName, status: job.status, extractedCount: job.extractedCount, errorMessage: job.errorMessage ?? null,
    drafts: drafts.map(draftView)
  })
}
export async function list(ctx) {
  const courseId = decodeId(PREFIX.course, ctx.query.course)
  await requireCourseAdmin(ctx, courseId)
  const rows = await imports.listByCourse(courseId)
  return ok({ imports: rows.map((j) => ({ importId: encodeId(PREFIX.import, j.importId), sourceType: j.sourceType, fileName: j.fileName, status: j.status, extractedCount: j.extractedCount, errorMessage: j.errorMessage ?? null, createdAt: toIsoJst(parseDbTimestamp(j.createdAt)) })) })
}
