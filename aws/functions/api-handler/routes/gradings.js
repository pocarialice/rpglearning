// A-09 採点依頼、A-10 採点結果
import { InvokeCommand } from '@aws-sdk/client-lambda'
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { parseDbTimestamp } from '../../shared/util/date-jst.js'
import { assertValid, validateExplanation } from '../../shared/util/validators.js'
import * as questions from '../../shared/db/repositories/questions.js'
import * as gradings from '../../shared/db/repositories/gradings.js'
import * as adventures from '../../shared/db/repositories/adventures.js'
import { lambdaClient } from '../lib/aws.js'
export const GRADING_LIMIT_MS = 30 * 1000
export async function create(ctx) {
  const { user, log } = ctx
  const body = ctx.body()
  assertValid(validateExplanation(body.text))
  const keywordId = decodeId(PREFIX.keyword, body.keywordId)
  const kw = await questions.findKeyword(keywordId)
  if (!kw || kw.courseId !== user.currentCourseId || kw.status !== 'published') throw new AppError('NOT_FOUND', 'キーワードが見つかりません')
  let adventureId = null
  if (body.adventureId) {
    adventureId = decodeId(PREFIX.adventure, body.adventureId)
    if (!(await adventures.find(adventureId, user.userId))) throw new AppError('NOT_FOUND', '冒険が見つかりません')
  }
  const job = await gradings.create({ userId: user.userId, courseId: user.currentCourseId, keywordId, adventureId, explanationText: body.text })
  try {
    await lambdaClient().send(new InvokeCommand({
      FunctionName: process.env.GRADING_FUNCTION, InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify({ gradingId: job.gradingId }))
    }))
  } catch (err) {
    await gradings.fail(job.gradingId, 'ai_error')
    log.error({ msg: 'grading.invoke_failed', gradingId: job.gradingId, err })
    throw new AppError('INTERNAL_ERROR', '採点を開始できませんでした')
  }
  return ok({ gradingId: encodeId(PREFIX.grading, job.gradingId), status: 'processing' }, 202)
}
export async function get(ctx) {
  const { user, now, log } = ctx
  const gradingId = decodeId(PREFIX.grading, ctx.params.id)
  const g = await gradings.find(gradingId, user.userId)
  if (!g) throw new AppError('NOT_FOUND', '採点が見つかりません')
  if (g.status === 'done') return ok(g.result)
  if (g.status === 'processing') {
    if (now.getTime() - parseDbTimestamp(g.createdAt).getTime() <= GRADING_LIMIT_MS) return ok({ status: 'processing' })
    await gradings.fail(gradingId, 'timeout')
    log.warn({ code: 'GRADING_TIMEOUT', gradingId })
    throw new AppError('GRADING_TIMEOUT')
  }
  if (g.failureReason === 'timeout') throw new AppError('GRADING_TIMEOUT')
  return ok({ status: 'failed', retryable: true })
}
