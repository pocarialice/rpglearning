// 送信時刻ごとの送信リストをオブジェクトストレージの notify/{今日}/{HHMM}.json に置く（冪等：同じキーに上書き）
import * as notify from '../../shared/db/repositories/notify.js'
import { putObject } from '../../shared/storage/object-storage.js'
export async function run({ today }) {
  const bySlot = new Map()
  for (const r of await notify.listForSlotBuild(today)) {
    if (r.status !== 'active' || !r.emailEnabled) continue
    const quests = typeof r.quests === 'string' ? JSON.parse(r.quests) : r.quests
    const item = { to: r.email, nickname: r.nickname, partnerName: r.partnerName, persona: r.partnerPersona, reviewCount: r.reviewCount, quests }
    if (!bySlot.has(r.slot)) bySlot.set(r.slot, [])
    bySlot.get(r.slot).push(item)
  }
  for (const [slot, items] of bySlot) {
    await putObject(process.env.NOTIFY_BUCKET, `notify/${today}/${slot}.json`, JSON.stringify({ date: today, slot, items }), 'application/json')
  }
  return { files: bySlot.size, items: [...bySlot.values()].reduce((s, l) => s + l.length, 0) }
}
