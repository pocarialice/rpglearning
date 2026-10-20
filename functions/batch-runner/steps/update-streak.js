// 継続日数の更新と継続バッジ（冪等：streak_checked_on = 今日 の利用者は飛ばす）
import { addDays } from '../../shared/util/date-jst.js'
import { judgeStreakBadges } from '../../shared/domain/badge.js'
import * as users from '../../shared/db/repositories/users.js'
import * as badges from '../../shared/db/repositories/badges.js'
export async function run({ today }) {
  const yesterday = addDays(today, -1)
  let updated = 0
  let granted = 0
  for (const u of await users.listForStreak(today)) {
    if (u.streakCheckedOn === today) continue
    const streak = u.lastActiveOn === yesterday ? u.streakDays + 1 : 0
    await users.updateStreak(u.userId, streak, today)
    updated++
    if (streak > 0) {
      const add = judgeStreakBadges(streak, await badges.listOwned(u.userId))
      if (add.length > 0) {
        await badges.grant(u.userId, add)
        granted += add.length
      }
    }
  }
  return { updated, granted }
}
