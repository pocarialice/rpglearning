import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { query, execute, toParameters, setDefaultResumeRetries } from '../../../../../functions/shared/db/data-api.js'
import { rdsMock, awsError } from '../../../../helpers/aws-mocks.js'
const rds = rdsMock()
const resuming = () => awsError('DatabaseResumingException', 'resuming')
const sentParams = () => rds.commandCalls(ExecuteStatementCommand)[0].args[0].input.parameters
describe('M-D01 data-api', () => {
  beforeEach(() => {
    rds.reset()
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[]' })
  })
  afterEach(() => {
    vi.useRealTimers()
    setDefaultResumeRetries(0)
  })
  it('MT-D01-01 接続情報', async () => {
    await query('SELECT 1')
    const input = rds.commandCalls(ExecuteStatementCommand)[0].args[0].input
    expect(input).toMatchObject({
      resourceArn: process.env.DB_CLUSTER_ARN, secretArn: process.env.DB_SECRET_ARN, database: 'rpg',
      sql: 'SELECT 1', formatRecordsAs: 'JSON', parameters: []
    })
    expect(input.transactionId).toBeUndefined()
  })
  it('MT-D01-02 パラメータの型（整数・小数）', async () => {
    await query('SELECT :a, :b', { a: 42, b: 1.5 })
    expect(sentParams()).toEqual([{ name: 'a', value: { longValue: 42 } }, { name: 'b', value: { doubleValue: 1.5 } }])
  })
  it('MT-D01-03 パラメータの型（文字・真偽）', async () => {
    await query('SELECT :s, :t', { s: 'x', t: true })
    expect(sentParams()).toEqual([{ name: 's', value: { stringValue: 'x' } }, { name: 't', value: { booleanValue: true } }])
  })
  it('MT-D01-04 パラメータの型（null）', async () => {
    await query('SELECT :n', { n: null, u: undefined })
    expect(sentParams()).toEqual([{ name: 'n', value: { isNull: true } }, { name: 'u', value: { isNull: true } }])
  })
  it('MT-D01-05 日付・JSON', async () => {
    await query('SELECT :d, :j', { d: { date: '2026-10-20' }, j: { json: { a: 1 } } })
    expect(sentParams()).toEqual([
      { name: 'd', value: { stringValue: '2026-10-20' }, typeHint: 'DATE' },
      { name: 'j', value: { stringValue: '{"a":1}' }, typeHint: 'JSON' }
    ])
  })
  it('MT-D01-12 変換できない型は例外', () => {
    expect(() => toParameters({ x: { foo: 1 } })).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }))
  })
  it('MT-D01-06 結果の変換', async () => {
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[{"user_id":15}]' })
    expect(await query('SELECT user_id FROM users')).toEqual([{ user_id: 15 }])
  })
  it('MT-D01-07 結果なし', async () => {
    rds.on(ExecuteStatementCommand).resolves({ numberOfRecordsUpdated: 3 })
    expect(await query('UPDATE x SET y = 1')).toEqual([])
    expect(await execute('UPDATE x SET y = 1')).toEqual({ rows: [], numberOfRecordsUpdated: 3 })
    rds.on(ExecuteStatementCommand).resolves({})
    expect((await execute('UPDATE x SET y = 1')).numberOfRecordsUpdated).toBe(0)
  })
  it('MT-D01-08 DB起動中・再試行0回', async () => {
    rds.on(ExecuteStatementCommand).rejects(resuming())
    await expect(query('SELECT 1', {}, { resumeRetries: 0 })).rejects.toMatchObject({ code: 'DB_RESUMING', status: 503 })
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(1)
  })
  it('MT-D01-09 DB起動中から復帰', async () => {
    vi.useFakeTimers()
    rds.on(ExecuteStatementCommand)
      .rejectsOnce(resuming()).rejectsOnce(resuming()).resolves({ formattedRecords: '[{"ok":1}]' })
    const p = query('SELECT 1', {}, { resumeRetries: 6 })
    await vi.advanceTimersByTimeAsync(4999)
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toEqual([{ ok: 1 }])
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(3)
  })
  it('MT-D01-10 再試行が尽きる', async () => {
    vi.useFakeTimers()
    setDefaultResumeRetries(6)
    rds.on(ExecuteStatementCommand).rejects(resuming())
    const p = query('SELECT 1')
    const check = expect(p).rejects.toMatchObject({ code: 'DB_RESUMING' })
    await vi.advanceTimersByTimeAsync(6 * 5000)
    await check
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(7)
  })
  it('MT-D01-11 ほかのエラー', async () => {
    rds.on(ExecuteStatementCommand).rejects(awsError('BadRequestException'))
    await expect(query('SELEC 1', {}, { resumeRetries: 6 })).rejects.toMatchObject({ name: 'BadRequestException' })
    expect(rds.commandCalls(ExecuteStatementCommand)).toHaveLength(1)
  })
})
