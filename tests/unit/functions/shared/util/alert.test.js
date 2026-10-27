import { describe, it, expect, vi, beforeEach } from 'vitest'
import { alert, resetAlerts, ALERT_INTERVAL_MS } from '../../../../../functions/shared/util/alert.js'
import { mailMock } from '../../../../helpers/mocks.js'
import { memoryLogger } from '../../../../helpers/logger.js'
const mail = mailMock()
beforeEach(() => {
  mail.reset()
  resetAlerts()
  process.env.ALERT_EMAIL = 'ops@example.co.jp'
})
describe('M-U08 util/alert（監視のお知らせメール）', () => {
  it('MT-U08-01 送る', async () => {
    expect(await alert('k', '件名', ['1行目'], { now: 0 })).toBe(true)
    expect(mail.sent()[0]).toMatchObject({ to: 'ops@example.co.jp', subject: '[prod]【RPG学習アプリ 監視】件名' })
    expect(mail.sent()[0].text).toBe('1行目\n\nログで詳しい内容を確認してください。')
  })
  it('MT-U08-02 同じ key は1時間に1通', async () => {
    await alert('k', 's', [], { now: 0 })
    expect(await alert('k', 's', [], { now: ALERT_INTERVAL_MS - 1 })).toBe(false)
    expect(await alert('other', 's', [], { now: 1 })).toBe(true)
    expect(await alert('k', 's', [], { now: ALERT_INTERVAL_MS })).toBe(true)
    expect(mail.sent()).toHaveLength(3)
  })
  it('MT-U08-03 宛先がない・送れない・環境名がない', async () => {
    delete process.env.ALERT_EMAIL
    expect(await alert('k', 's', [])).toBe(false)
    process.env.ALERT_EMAIL = 'ops@example.co.jp'
    const log = memoryLogger()
    mail.fail(1)
    expect(await alert('k', 's', [], { log })).toBe(false)
    expect(log.lines.some((l) => l.msg === 'alert.send_failed')).toBe(true)
    expect(await alert('k2', 's', [])).toBe(true)
    delete process.env.APP_ENV
    const send = vi.fn(async () => {})
    await alert('k3', 's', [], { send })
    expect(send.mock.calls[0][0].subject.startsWith('[local]')).toBe(true)
    send.mockRejectedValueOnce(new Error('x'))
    expect(await alert('k4', 's', [], { send })).toBe(false)
  })
})
