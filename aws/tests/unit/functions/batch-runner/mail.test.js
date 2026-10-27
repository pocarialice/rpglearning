import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { SendEmailCommand } from '@aws-sdk/client-ses'
import { ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { main } from '../../../../functions/batch-runner/index.mjs'
import { memoryLogger } from '../../../helpers/logger.js'
import { s3Mock, sesMock, rdsMock, awsError } from '../../../helpers/aws-mocks.js'
const s3 = s3Mock()
const ses = sesMock()
const rds = rdsMock()
const jst = (s) => new Date(`2026-10-20T${s}+09:00`)
const item = (n) => ({ to: `u${n}@example.co.jp`, nickname: `n${n}`, partnerName: 'ミナ', persona: 'encourage', reviewCount: n, quests: ['択一を5問解く'] })
const list = (count) => ({ Body: { transformToString: async () => JSON.stringify({ date: '2026-10-20', slot: '0730', items: Array.from({ length: count }, (_, i) => item(i + 1)) }) } })
let log
const mail = (at = '07:30:00') => main({ job: 'mail' }, { log, now: jst(at) })
describe('M-W04 batch-runner mail', () => {
  beforeEach(() => {
    log = memoryLogger()
    s3.reset()
    ses.reset()
    rds.reset()
    s3.on(GetObjectCommand).resolves(list(3))
    ses.on(SendEmailCommand).resolves({ MessageId: 'm' })
  })
  it('MT-W04-01 送信', async () => {
    expect(await mail()).toEqual({ job: 'mail', slot: '0730', sent: 3, failed: 0 })
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({ Bucket: 'rpg-test-notify', Key: 'notify/2026-10-20/0730.json' })
    const sent = ses.commandCalls(SendEmailCommand)
    expect(sent).toHaveLength(3)
    expect(sent[0].args[0].input.Destination.ToAddresses).toEqual(['u1@example.co.jp'])
    expect(sent[0].args[0].input.Message.Body.Text.Data).toContain('n1さん')
    expect(log.lines.find((l) => l.msg === 'mail.done')).toMatchObject({ level: 'INFO', sent: 3, failed: 0 })
  })
  it('MT-W04-02 ファイルがない', async () => {
    s3.on(GetObjectCommand).rejects(awsError('NoSuchKey'))
    expect(await mail('22:30:00')).toEqual({ job: 'mail', slot: '2230', sent: 0, failed: 0 })
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0)
  })
  it('MT-W04-03 1回失敗して成功', async () => {
    let second = 0
    ses.on(SendEmailCommand).callsFake((input) => {
      if (input.Destination.ToAddresses[0] === 'u2@example.co.jp' && second++ === 0) throw awsError('Throttling')
      return { MessageId: 'm' }
    })
    expect(await mail()).toMatchObject({ sent: 3, failed: 0 })
    expect(ses.commandCalls(SendEmailCommand).filter((c) => c.args[0].input.Destination.ToAddresses[0] === 'u2@example.co.jp')).toHaveLength(2)
  })
  it('MT-W04-04 2回とも失敗', async () => {
    ses.on(SendEmailCommand).callsFake((input) => {
      if (input.Destination.ToAddresses[0] === 'u2@example.co.jp') throw awsError('MessageRejected')
      return { MessageId: 'm' }
    })
    expect(await mail()).toMatchObject({ sent: 2, failed: 1 })
    expect(ses.commandCalls(SendEmailCommand).at(-1).args[0].input.Destination.ToAddresses).toEqual(['u3@example.co.jp'])
    expect(log.lines.find((l) => l.msg === 'mail.done')).toMatchObject({ level: 'WARN', failed: 1 })
    expect(log.lines.some((l) => l.msg === 'mail.send_failed' && l.level === 'WARN')).toBe(true)
  })
  it('MT-W04-05 DBを使わない', async () => {
    await mail()
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(0)
    expect(rds.calls()).toHaveLength(0)
  })
  it('MT-W04-06 枠の丸め', async () => {
    await mail('07:44:00')
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input.Key).toBe('notify/2026-10-20/0730.json')
  })
  it('MT-W04-07 S3 のほかのエラーでも例外を投げない', async () => {
    s3.on(GetObjectCommand).rejects(awsError('AccessDenied'))
    expect(await mail()).toEqual({ job: 'mail', slot: '0730', sent: 0, failed: 0 })
    expect(log.lines.some((l) => l.level === 'ERROR' && l.msg === 'mail.read_failed')).toBe(true)
  })
})
