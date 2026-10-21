// SES でのテキストメール送信（詳細設計書 9.2）。やり直しは呼び出し側で行う
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
let client
function getClient() {
  client ??= new SESClient({})
  return client
}
export async function sendMail({ to, subject, text }) {
  const res = await getClient().send(new SendEmailCommand({
    Source: process.env.MAIL_FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: text, Charset: 'UTF-8' } }
    }
  }))
  return res.MessageId
}
