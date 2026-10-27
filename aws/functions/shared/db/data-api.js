// RDS Data API の呼び出し（詳細設計書 3.3 M-D01）
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { AppError } from '../util/errors.js'
export const RESUME_WAIT_MS = 5000
// api-handler は0（すぐ DB_RESUMING を返す）、ほかの関数は6を index.mjs で設定する
let defaultResumeRetries = 0
export function setDefaultResumeRetries(n) {
  defaultResumeRetries = n
}
let client
function getClient() {
  client ??= new RDSDataClient({})
  return client
}
function toField(value) {
  if (value === null || value === undefined) return { isNull: true }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { longValue: value } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'object' && 'date' in value) return { stringValue: value.date }
  if (typeof value === 'object' && 'json' in value) return { stringValue: JSON.stringify(value.json) }
  throw new AppError('INTERNAL_ERROR', 'SQLパラメータの型を変換できません')
}
export function toParameters(params = {}) {
  return Object.entries(params).map(([name, value]) => {
    const p = { name, value: toField(value) }
    if (value && typeof value === 'object') {
      if ('date' in value) p.typeHint = 'DATE'
      else if ('json' in value) p.typeHint = 'JSON'
    }
    return p
  })
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function send(input, resumeRetries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getClient().send(new ExecuteStatementCommand(input))
    } catch (err) {
      if (err?.name !== 'DatabaseResumingException') throw err
      if (attempt >= resumeRetries) throw new AppError('DB_RESUMING', undefined, { cause: err })
      await sleep(RESUME_WAIT_MS)
    }
  }
}
// 実行して結果と更新件数を返す
export async function execute(sql, params = {}, opts = {}) {
  const input = {
    resourceArn: process.env.DB_CLUSTER_ARN,
    secretArn: process.env.DB_SECRET_ARN,
    database: process.env.DB_NAME,
    sql,
    parameters: toParameters(params),
    formatRecordsAs: 'JSON'
  }
  if (opts.transactionId) input.transactionId = opts.transactionId
  const res = await send(input, opts.resumeRetries ?? defaultResumeRetries)
  return {
    rows: res.formattedRecords ? JSON.parse(res.formattedRecords) : [],
    numberOfRecordsUpdated: res.numberOfRecordsUpdated ?? 0
  }
}
// 結果の行だけを返す
export async function query(sql, params = {}, opts = {}) {
  return (await execute(sql, params, opts)).rows
}
export { getClient as dataClient }
