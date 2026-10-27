// DB（pg の接続プールの代わり）・メール・AWS SDK（S3・Bedrock）のモック
import { vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { S3Client } from '@aws-sdk/client-s3'
import { setPool } from '../../functions/shared/db/client.js'
import { setTransport } from '../../functions/shared/mail/smtp.js'
export const bedrockMock = () => mockClient(BedrockRuntimeClient)
export const s3Mock = () => mockClient(S3Client)
export function awsError(name, message = name) {
  return Object.assign(new Error(message), { name })
}
export const pgError = (code, message = code) => Object.assign(new Error(message), { code })
const TX = /^(BEGIN|COMMIT|ROLLBACK)$/
// 応答：records(rows) / { updated: n } / { rows, rowCount } / Error（例外にする）
function normalize(res) {
  if (res instanceof Error) throw res
  if (res && 'updated' in res) return { rows: res.rows ?? [], rowCount: res.updated }
  return { rows: res?.rows ?? [], rowCount: res?.rowCount ?? res?.rows?.length ?? 1 }
}
// 呼び出しを記録し、表（[正規表現, 応答 or ({ sql, values }) => 応答]）か既定の応答で返す。sql は $1 形式に置き換えたあとの文
export function dbMock() {
  const state = { calls: [], tx: [], table: [], once: [], fallback: { rows: [], rowCount: 1 } }
  async function run(sql, values = []) {
    if (TX.test(sql)) {
      state.tx.push(sql)
      if (state.txFail?.[sql]) throw state.txFail[sql]
      return { rows: [], rowCount: 0 }
    }
    const call = { sql, values }
    state.calls.push(call)
    if (state.once.length) return normalize(typeof state.once[0] === 'function' ? state.once.shift()(call) : state.once.shift())
    for (const [re, res] of state.table) if (re.test(sql)) return normalize(typeof res === 'function' ? await res(call) : res)
    return normalize(typeof state.fallback === 'function' ? await state.fallback(call) : state.fallback)
  }
  const client = { query: run, release: () => { state.released = (state.released ?? 0) + 1 } }
  const db = {
    query: run,
    connect: async () => client,
    end: async () => {},
    calls: () => state.calls,
    txLog: () => state.tx,
    commits: () => state.tx.filter((t) => t === 'COMMIT').length,
    rollbacks: () => state.tx.filter((t) => t === 'ROLLBACK').length,
    released: () => state.released ?? 0,
    resolves(res) { state.fallback = res; return db },
    callsFake(fn) { state.fallback = fn; return db },
    rejects(err) { state.fallback = () => { throw err }; return db },
    once(res) { state.once.push(res); return db },
    rejectsOnce(err) { state.once.push(() => { throw err }); return db },
    failTx(sql, err) { state.txFail = { ...state.txFail, [sql]: err }; return db },
    route(table) { state.table = table; return db },
    reset() {
      Object.assign(state, { calls: [], tx: [], table: [], once: [], fallback: { rows: [], rowCount: 1 }, txFail: undefined, released: 0 })
      setPool(db)
      return db
    }
  }
  setPool(db)
  return db
}
export const routeSql = (db, table) => db.route(table)
export const records = (rows) => ({ rows, rowCount: rows.length })
export const executed = (db) => db.calls()
// nodemailer の transport の代わり。fail(n) で最初の n 回を失敗させる
export function mailMock() {
  const state = { sent: [], failures: [] }
  const transport = {
    async sendMail(msg) {
      if (state.failures.length) throw state.failures.shift()
      state.sent.push(msg)
      return { messageId: `<m${state.sent.length}@test>` }
    }
  }
  const m = {
    sent: () => state.sent,
    fail(n = 1, err = Object.assign(new Error('smtp down'), { name: 'SMTPError' })) { for (let i = 0; i < n; i++) state.failures.push(err); return m },
    reset() { state.sent = []; state.failures = []; setTransport(transport); return m }
  }
  setTransport(transport)
  return m
}
// リポジトリへ渡す db（呼び出しを記録するだけ）
export function fakeDb({ rows = [], updated = 1 } = {}) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => ({ rows, numberOfRecordsUpdated: updated }))
  }
}
