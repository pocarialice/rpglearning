// audit_logs（T-23）。detail に氏名・メールは入れない
import { defaultDb, json } from './_base.js'
export async function write(actorId, action, target, detail = {}, db = defaultDb) {
  await db.execute(`INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, detail)
    VALUES (:actorId, :action, :targetType, :targetId, :detail)`,
  { actorId, action, targetType: target.type, targetId: target.id ?? null, detail: json(detail) })
}
