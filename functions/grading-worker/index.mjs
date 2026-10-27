// 採点ジョブ1件の処理（詳細設計書 4.3）
import { gradeJob } from './grader.js'
import * as gradings from '../shared/db/repositories/gradings.js'
export async function runGradingJob(job, { log, now = () => new Date() }) {
  const gradingId = Number(job.payload.gradingId)
  try {
    const res = await gradeJob(gradingId, { log, now })
    return { outcome: 'done', ...res }
  } catch (err) {
    // DB の失敗など。画面は30秒で打ち切り、学習者が「もう一度採点してもらう」を押す
    log.error({ msg: 'grading.error', gradingId, code: err.code ?? 'INTERNAL_ERROR', err })
    try {
      await gradings.fail(gradingId, 'ai_error')
    } catch {
      // 採点の記録を変えられなくても、A-10 が30秒で時間切れにする
    }
    return { outcome: 'failed', error: err.message }
  }
}
