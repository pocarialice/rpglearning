// 定期処理（詳細設計書 4.5）。ワーカーのスケジューラが {"job":"daily"|"mail"} で呼ぶ
import { AppError } from '../shared/util/errors.js'
import { runDaily } from './jobs/daily.js'
import { runMail } from './jobs/mail.js'
export async function main(event, { log, now = new Date() }) {
  if (event?.job === 'daily') return runDaily({ log, now })
  if (event?.job === 'mail') return runMail({ log, now })
  throw new AppError('VALIDATION_ERROR', `知らないジョブです: ${event?.job}`)
}
