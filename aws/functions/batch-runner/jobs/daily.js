// B-01・B-02 日次処理（詳細設計書 4.5.1）。ステップは順に実行し、失敗したらそこで例外を投げる
import { todayJst } from '../../shared/util/date-jst.js'
import * as closeRanking from '../steps/close-ranking.js'
import * as updateStreak from '../steps/update-streak.js'
import * as assignQuests from '../steps/assign-quests.js'
import * as purgeUsers from '../steps/purge-users.js'
import * as cleanupGradings from '../steps/cleanup-gradings.js'
import * as buildNotify from '../steps/build-notify.js'
export const STEPS = [
  ['close-ranking', closeRanking, { mondayOnly: true }],
  ['update-streak', updateStreak, {}],
  ['assign-quests', assignQuests, {}],
  ['purge-users', purgeUsers, {}],
  ['cleanup-gradings', cleanupGradings, {}],
  ['build-notify', buildNotify, {}]
]
export function isMonday(today) {
  return new Date(`${today}T00:00:00Z`).getUTCDay() === 1
}
export async function runDaily({ log, now }) {
  const today = todayJst(now)
  const ran = []
  for (const [name, step, opt] of STEPS) {
    if (opt.mondayOnly && !isMonday(today)) continue
    log.info({ msg: 'step.start', step: name, today })
    const result = await step.run({ today, log })
    log.info({ msg: 'step.end', step: name, ...result })
    ran.push(name)
  }
  return { job: 'daily', today, steps: ran }
}
