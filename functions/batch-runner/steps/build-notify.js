// 送信時刻ごとの送信リストを S3 notify/{今日}/{HHMM}.json に置く（冪等：同じキーに上書き）
import { PutObjectCommand } from '@aws-sdk/client-s3'
import * as notify from '../../shared/db/repositories/notify.js'
import { s3Client } from '../lib/s3.js'
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
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.NOTIFY_BUCKET, Key: `notify/${today}/${slot}.json`, ContentType: 'application/json',
      Body: JSON.stringify({ date: today, slot, items })
    }))
  }
  return { files: bySlot.size, items: [...bySlot.values()].reduce((s, l) => s + l.length, 0) }
}
