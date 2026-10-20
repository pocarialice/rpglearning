// デイリークエストの割り当て（冪等：今日の行がある学習者は飛ばす）
import { pickDailyQuests } from '../../shared/domain/quest.js'
import * as quests from '../../shared/db/repositories/quests.js'
export async function run({ today, rand = Math.random }) {
  let assigned = 0
  for (const t of await quests.listAssignTargets(today)) {
    if (t.assigned) continue
    await quests.insertAssignments(t.userId, today, pickDailyQuests(t.dueCount, rand))
    assigned++
  }
  return { assigned }
}
