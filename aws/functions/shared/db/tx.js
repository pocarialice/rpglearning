// トランザクション（詳細設計書 3.3 M-D02）
import { BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data'
import { dataClient, query, execute } from './data-api.js'
export async function withTx(fn, opts = {}) {
  const base = { resourceArn: process.env.DB_CLUSTER_ARN, secretArn: process.env.DB_SECRET_ARN }
  const { transactionId } = await dataClient().send(new BeginTransactionCommand({ ...base, database: process.env.DB_NAME }))
  const txOpts = { ...opts, transactionId }
  const tx = {
    transactionId,
    query: (sql, params) => query(sql, params, txOpts),
    execute: (sql, params) => execute(sql, params, txOpts)
  }
  let result
  try {
    result = await fn(tx)
  } catch (err) {
    await dataClient().send(new RollbackTransactionCommand({ ...base, transactionId })).catch(() => {})
    throw err
  }
  await dataClient().send(new CommitTransactionCommand({ ...base, transactionId }))
  return result
}
