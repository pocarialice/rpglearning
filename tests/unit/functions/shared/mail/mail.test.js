import { describe, it, expect, beforeEach } from 'vitest'
import { SendEmailCommand } from '@aws-sdk/client-ses'
import { sendMail } from '../../../../../functions/shared/mail/ses.js'
import { notifyMail, deletionMail, SUPPORT_CONTACT } from '../../../../../functions/shared/mail/templates.js'
import { sesMock, awsError } from '../../../../helpers/aws-mocks.js'
const ses = sesMock()
const item = { to: 'taro@example.co.jp', nickname: 'たろう', partnerPersona: 'encourage', partnerName: 'ミナ', reviewCount: 5,
  quests: ['択一を5問解く', '今日の復習をすべて終える', '新しい問題に3問挑戦する'] }
describe('M-M01 mail', () => {
  beforeEach(() => {
    ses.reset()
    ses.on(SendEmailCommand).resolves({ MessageId: 'mid-1' })
  })
  it('MT-M01-01 通知メールの本文', () => {
    process.env.APP_ENV = 'prod'
    const m = notifyMail(item)
    expect(m.subject).toBe('【RPG学習アプリ】今日の依頼が届いています')
    expect(m.to).toBe('taro@example.co.jp')
    expect(m.text).toContain('たろうさん')
    expect(m.text).toContain('ミナ「')
    expect(m.text).toContain('今日の復習：5問')
    for (const q of item.quests) expect(m.text).toContain(`・${q}`)
    expect(m.text).toContain('https://app.example.co.jp/#/home')
    expect(m.text.trimEnd().endsWith('https://app.example.co.jp/#/notify')).toBe(true)
    expect(notifyMail({ ...item, partnerPersona: 'unknown' }).text).toContain('いっしょにがんばろう')
  })
  it.each([['dev', '[dev]'], ['stg', '[stg]']])('MT-M01-02 環境名の付与（%s）', (env, prefix) => {
    process.env.APP_ENV = env
    expect(notifyMail(item).subject.startsWith(`${prefix}【RPG学習アプリ】`)).toBe(true)
    expect(deletionMail({ email: 'a@x.jp', fullName: '山田', deleteScheduledOn: '2026-11-19' }).subject.startsWith(prefix)).toBe(true)
  })
  it('MT-M01-03 削除予定の通知', () => {
    process.env.APP_ENV = 'prod'
    const m = deletionMail({ email: 'a@x.jp', fullName: '山田', deleteScheduledOn: '2026-11-19' })
    expect(m.subject).toBe('【RPG学習アプリ】アカウント停止のお知らせ')
    expect(m.text).toContain('2026年11月19日')
    expect(m.text).toContain(SUPPORT_CONTACT)
    delete process.env.APP_ENV
    expect(deletionMail({ email: 'a@x.jp', fullName: '山田', deleteScheduledOn: '2026-11-19' }).subject.startsWith('【')).toBe(true)
  })
  it('MT-M01-04 SES への送信', async () => {
    expect(await sendMail({ to: 'taro@example.co.jp', subject: '件名', text: '本文' })).toBe('mid-1')
    const input = ses.commandCalls(SendEmailCommand)[0].args[0].input
    expect(input.Source).toBe('no-reply@app.example.co.jp')
    expect(input.Destination).toEqual({ ToAddresses: ['taro@example.co.jp'] })
    expect(input.Message.Body).toEqual({ Text: { Data: '本文', Charset: 'UTF-8' } })
    expect(input.Message.Body.Html).toBeUndefined()
  })
  it('MT-M01-05 送信の失敗', async () => {
    ses.on(SendEmailCommand).rejects(awsError('MessageRejected'))
    await expect(sendMail({ to: 'x@example.co.jp', subject: 's', text: 't' })).rejects.toMatchObject({ name: 'MessageRejected' })
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1)
  })
})
