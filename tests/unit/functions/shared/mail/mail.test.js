import { describe, it, expect, beforeEach, vi } from 'vitest'
import nodemailer from 'nodemailer'
import { sendMail, setTransport } from '../../../../../functions/shared/mail/smtp.js'
import { deletionMail, inviteMail, resetMail, signupMail, signupExistsMail, SUPPORT_CONTACT } from '../../../../../functions/shared/mail/templates.js'
import { mailMock } from '../../../../helpers/mocks.js'
const mail = mailMock()
describe('M-M01 mail', () => {
  beforeEach(() => {
    mail.reset()
  })
  it.each([['dev', '[dev]'], ['prod', '']])('MT-M01-02 環境名の付与（%s）', (env, prefix) => {
    process.env.APP_ENV = env
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
  it('MT-M01-04 SMTP での送信', async () => {
    expect(await sendMail({ to: 'taro@example.co.jp', subject: '件名', text: '本文' })).toBe('<m1@test>')
    expect(mail.sent()).toEqual([{ from: 'no-reply@app.example.co.jp', to: 'taro@example.co.jp', subject: '件名', text: '本文' }])
  })
  it('MT-M01-05 送信の失敗', async () => {
    mail.fail(1)
    await expect(sendMail({ to: 'x@example.co.jp', subject: 's', text: 't' })).rejects.toMatchObject({ name: 'SMTPError' })
    expect(mail.sent()).toHaveLength(0)
  })
  it('MT-M01-06 SMTP の接続設定', async () => {
    const spy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: async () => ({ messageId: 'x' }) })
    Object.assign(process.env, { SMTP_HOST: 'smtp.example.jp', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASS: 'p' })
    setTransport(undefined)
    await sendMail({ to: 'a@x.jp', subject: 's', text: 't' })
    expect(spy).toHaveBeenCalledWith({ host: 'smtp.example.jp', port: 465, secure: true, auth: { user: 'u', pass: 'p' } })
    for (const k of ['SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS']) delete process.env[k]
    setTransport(undefined)
    await sendMail({ to: 'a@x.jp', subject: 's', text: 't' })
    expect(spy).toHaveBeenLastCalledWith({ host: 'smtp.example.jp', port: 587, secure: false, auth: undefined })
  })
  it('MT-M01-07 招待メール', () => {
    process.env.APP_ENV = 'dev'
    const m = inviteMail({ email: 'a@x.jp', tempPassword: 'Abcd2345efgh', validDays: 7 })
    expect(m.to).toBe('a@x.jp')
    expect(m.subject).toBe('[dev]【RPG学習アプリ】ギルドへの招待')
    expect(m.text).toContain('ログインURL：https://app.example.co.jp/')
    expect(m.text).toContain('仮パスワード：Abcd2345efgh')
    expect(m.text).toContain('期限は7日')
  })
  it('MT-M01-08 再設定メール', () => {
    process.env.APP_ENV = 'prod'
    const m = resetMail({ email: 'a@x.jp', token: 'a+b/c', validMinutes: 60 })
    expect(m.subject).toBe('【RPG学習アプリ】パスワードの再設定')
    expect(m.text).toContain('https://app.example.co.jp/#/reset?token=a%2Bb%2Fc')
    expect(m.text).toContain('60分以内')
    expect(m.text).toContain(SUPPORT_CONTACT)
  })
  it('MT-M01-09 アカウント作成の確認メール・登録済みの案内', () => {
    process.env.APP_ENV = 'prod'
    const m = signupMail({ email: 'a@x.jp', fullName: '山田 花子', token: 'a+b/c', validHours: 24 })
    expect(m.to).toBe('a@x.jp')
    expect(m.subject).toBe('【RPG学習アプリ】アカウント作成の確認')
    expect(m.text).toContain('山田 花子さん')
    expect(m.text).toContain('https://app.example.co.jp/#/signup?token=a%2Bb%2Fc')
    expect(m.text).toContain('期限は24時間')
    const e = signupExistsMail({ email: 'a@x.jp' })
    expect(e.subject).toBe('【RPG学習アプリ】アカウント作成の受付')
    expect(e.text).toContain('ログインURL：https://app.example.co.jp/')
    expect(e.text).toContain(SUPPORT_CONTACT)
  })
})
