// B-03 メール送信（詳細設計書 4.5.2）。DBを使わない。例外は投げない（二重送信を避けるため）
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { todayJst, jstSlot } from '../../shared/util/date-jst.js'
import { sendMail } from '../../shared/mail/ses.js'
import { notifyMail } from '../../shared/mail/templates.js'
import { s3Client } from '../lib/s3.js'
async function readList(today, slot) {
  try {
    const res = await s3Client().send(new GetObjectCommand({ Bucket: process.env.NOTIFY_BUCKET, Key: `notify/${today}/${slot}.json` }))
    return JSON.parse(await res.Body.transformToString())
  } catch (err) {
    if (err?.name === 'NoSuchKey') return { items: [] }
    throw err
  }
}
export async function runMail({ log, now }) {
  const today = todayJst(now)
  const slot = jstSlot(now)
  let list
  try {
    list = await readList(today, slot)
  } catch (err) {
    log.error({ msg: 'mail.read_failed', slot, err })
    return { job: 'mail', slot, sent: 0, failed: 0 }
  }
  let sent = 0
  let failed = 0
  for (const item of list.items) {
    const mail = notifyMail({ ...item, partnerPersona: item.persona ?? item.partnerPersona })
    let ok = false
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await sendMail(mail)
        ok = true
      } catch (err) {
        if (attempt === 2) log.warn({ msg: 'mail.send_failed', slot, errorName: err?.name })
      }
    }
    if (ok) sent++
    else failed++
  }
  const level = failed > 0 ? 'warn' : 'info'
  log[level]({ msg: 'mail.done', slot, sent, failed })
  return { job: 'mail', slot, sent, failed }
}
