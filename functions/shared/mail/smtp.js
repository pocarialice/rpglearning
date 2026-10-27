// SMTP でのテキストメール送信（詳細設計書 9.2）。やり直しは呼び出し側で行う
import nodemailer from 'nodemailer'
let transport
// テストでは差し替える
export function setTransport(t) {
  transport = t
}
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // 465 のとき true。587 は STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  })
  return transport
}
export async function sendMail({ to, subject, text }) {
  const info = await getTransport().sendMail({ from: process.env.MAIL_FROM, to, subject, text })
  return info.messageId
}
