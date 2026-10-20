// quest_defs（T-19）・user_quests（T-20）
import { defaultDb, camelRows, date } from './_base.js'
export async function listToday(userId, today, db = defaultDb) {
  return camelRows(await db.query(`SELECT uq.user_quest_id, uq.quest_code, d.title, uq.target, uq.progress, d.reward_exp,
      (uq.achieved_at IS NOT NULL) AS achieved
    FROM user_quests uq JOIN quest_defs d ON d.quest_code = uq.quest_code
    WHERE uq.user_id = :userId AND uq.quest_on = :today ORDER BY d.sort_order`, { userId, today: date(today) }))
}
export async function insertAssignments(userId, today, quests, db = defaultDb) {
  for (const q of quests) {
    await db.execute(`INSERT INTO user_quests (user_id, quest_on, quest_code, target) VALUES (:userId, :today, :code, :target)
      ON CONFLICT (user_id, quest_on, quest_code) DO NOTHING`, { userId, today: date(today), code: q.code, target: q.target })
  }
}
export async function saveProgress(quests, db = defaultDb) {
  for (const q of quests) {
    await db.execute(`UPDATE user_quests SET progress = :progress,
        achieved_at = CASE WHEN :achieved AND achieved_at IS NULL THEN now() ELSE achieved_at END
      WHERE user_quest_id = :id`, { id: q.userQuestId, progress: q.progress, achieved: !!q.achieved })
  }
}
export async function listDefs(db = defaultDb) {
  return camelRows(await db.query('SELECT quest_code, title, target, reward_exp FROM quest_defs WHERE is_active ORDER BY sort_order'))
}
