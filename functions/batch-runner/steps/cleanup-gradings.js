// 作成から30日を過ぎた採点と、終わったジョブ（jobs）の削除
import { addDays } from '../../shared/util/date-jst.js'
import * as gradings from '../../shared/db/repositories/gradings.js'
import * as jobs from '../../shared/db/repositories/jobs.js'
export const KEEP_DAYS = 30
export async function run({ today }) {
  const cutoff = `${addDays(today, -KEEP_DAYS)}T00:00:00+09:00`
  return { cutoff, deleted: await gradings.deleteOlderThan(cutoff), jobsDeleted: await jobs.deleteFinishedBefore(cutoff) }
}
