// 管理者へのお知らせメール（CloudWatch アラームと SNS の代わり。詳細設計書 10.4）。ALERT_EMAIL がなければ送らない
import { sendMail } from '../mail/smtp.js'
export const ALERT_INTERVAL_MS = 60 * 60 * 1000
const lastSent = new Map()
// 同じ key は1時間に1通まで。送れなくても例外は投げない
export async function alert(key, subject, lines, { log, now = Date.now(), send = sendMail } = {}) {
  const to = process.env.ALERT_EMAIL
  if (!to) return false
  const last = lastSent.get(key)
  if (last !== undefined && now - last < ALERT_INTERVAL_MS) return false
  lastSent.set(key, now)
  try {
    const env = process.env.APP_ENV ?? 'local'
    await send({ to, subject: `[${env}]【RPG学習アプリ 監視】${subject}`, text: [...lines, '', 'ログで詳しい内容を確認してください。'].join('\n') })
    return true
  } catch (err) {
    log?.warn({ msg: 'alert.send_failed', key, errorName: err?.name })
    return false
  }
}
export function resetAlerts() {
  lastSent.clear()
}
