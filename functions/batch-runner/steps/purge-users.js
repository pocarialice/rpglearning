// 削除予定日を過ぎた利用者の物理削除（リフレッシュトークンなどは外部キーの ON DELETE CASCADE で一緒に消える）
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
import * as auth from '../../shared/db/repositories/auth.js'
export async function run({ today }) {
  let purged = 0
  for (const u of await users.listPurgeTargets(today)) {
    if (await users.purge(u.userId)) {
      await audit.write(null, 'user.purge', { type: 'user', id: u.userId }, {})
      purged++
    }
  }
  return { purged, expiredTokens: await auth.deleteExpired() }
}
