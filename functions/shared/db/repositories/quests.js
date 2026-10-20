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
// 日次のクエスト割り当ての対象（有効な学習者）と、0:00時点の復習対象数（全コース）
export async function listAssignTargets(today, db = defaultDb) {
  return camelRows(await db.query(`SELECT u.user_id,
      (SELECT count(*) FROM review_items r JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
        WHERE r.user_id = u.user_id AND r.stage < 6 AND r.next_review_on <= :today)::int AS due_count,
      EXISTS (SELECT 1 FROM user_quests uq WHERE uq.user_id = u.user_id AND uq.quest_on = :today) AS assigned
    FROM users u JOIN user_roles ur ON ur.user_id = u.user_id AND ur.role = 'learner'
    WHERE u.status = 'active' ORDER BY u.user_id LIMIT 2000`, { today: date(today) }))
}
export async function listDefs(db = defaultDb) {
  return camelRows(await db.query('SELECT quest_code, title, target, reward_exp FROM quest_defs WHERE is_active ORDER BY sort_order'))
}
