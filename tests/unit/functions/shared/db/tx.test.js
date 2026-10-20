import { describe, it, expect, beforeEach } from 'vitest'
import {
  ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand
} from '@aws-sdk/client-rds-data'
import { withTx } from '../../../../../functions/shared/db/tx.js'
import { rdsMock, awsError } from '../../../../helpers/aws-mocks.js'
const rds = rdsMock()
const names = () => rds.calls().map((c) => c.args[0].constructor.name)
describe('M-D02 tx', () => {
  beforeEach(() => {
    rds.reset()
    rds.on(BeginTransactionCommand).resolves({ transactionId: 'tx-1' })
    rds.on(ExecuteStatementCommand).resolves({ formattedRecords: '[]', numberOfRecordsUpdated: 1 })
    rds.on(CommitTransactionCommand).resolves({ transactionStatus: 'Transaction Committed' })
    rds.on(RollbackTransactionCommand).resolves({})
  })
  it('MT-D02-01 正常', async () => {
    await withTx(async (tx) => {
      await tx.query('SELECT 1')
      await tx.execute('UPDATE x SET y = 1')
    })
    expect(names()).toEqual(['BeginTransactionCommand', 'ExecuteStatementCommand', 'ExecuteStatementCommand', 'CommitTransactionCommand'])
    for (const c of rds.commandCalls(ExecuteStatementCommand)) expect(c.args[0].input.transactionId).toBe('tx-1')
    expect(rds.commandCalls(CommitTransactionCommand)[0].args[0].input.transactionId).toBe('tx-1')
  })
  it('MT-D02-02 途中の例外', async () => {
    const boom = awsError('BadRequestException')
    rds.on(ExecuteStatementCommand).resolvesOnce({ formattedRecords: '[]' }).rejectsOnce(boom)
    await expect(withTx(async (tx) => {
      await tx.query('SELECT 1')
      await tx.query('SELECT 2')
    })).rejects.toBe(boom)
    expect(rds.commandCalls(RollbackTransactionCommand)).toHaveLength(1)
    expect(rds.commandCalls(CommitTransactionCommand)).toHaveLength(0)
  })
  it('MT-D02-05 Rollback が失敗しても元の例外を投げる', async () => {
    const boom = new Error('boom')
    rds.on(RollbackTransactionCommand).rejects(awsError('ServiceUnavailableError'))
    await expect(withTx(async () => { throw boom })).rejects.toBe(boom)
  })
  it('MT-D02-03 Commit の失敗', async () => {
    rds.on(CommitTransactionCommand).rejects(awsError('StatementTimeoutException'))
    await expect(withTx(async () => 1)).rejects.toMatchObject({ name: 'StatementTimeoutException' })
  })
  it('MT-D02-04 戻り値', async () => {
    await expect(withTx(async () => ({ id: 1 }))).resolves.toEqual({ id: 1 })
  })
})
