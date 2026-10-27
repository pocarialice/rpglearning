// PostgreSQL への接続（詳細設計書 3.3 M-D01）。リポジトリは :name 形式のパラメータで SQL を書く
import pg from 'pg'
import { AppError } from '../util/errors.js'
const { Pool, types } = pg
// 列の値を、リポジトリが前提にしている形（数値・'YYYY-MM-DD'・UTCの 'YYYY-MM-DD HH:MM:SS.sss'）にそろえる
export function toUtcText(text) {
  const iso = text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '')
}
types.setTypeParser(20, (v) => Number(v)) // bigint
types.setTypeParser(1700, (v) => Number(v)) // numeric
types.setTypeParser(1082, (v) => v) // date
types.setTypeParser(1114, (v) => v) // timestamp
types.setTypeParser(1184, toUtcText) // timestamptz
let pool
// テストでは差し替える
export function setPool(p) {
  pool = p
}
export function getPool() {
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    options: '-c TimeZone=UTC'
  })
  return pool
}
function toValue(value) {
  if (value === undefined) return null
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return value
  if (typeof value === 'object' && 'date' in value) return value.date
  if (typeof value === 'object' && 'json' in value) return JSON.stringify(value.json)
  throw new AppError('INTERNAL_ERROR', 'SQLパラメータの型を変換できません')
}
// :name を $1, $2 … に置き換える。::text などの型変換は置き換えない
export function toPositional(sql, params = {}) {
  const names = []
  const text = sql.replace(/(?<![:\w]):([A-Za-z_]\w*)/g, (_, name) => {
    if (!Object.hasOwn(params, name)) throw new AppError('INTERNAL_ERROR', `SQLパラメータ ${name} がありません`)
    let i = names.indexOf(name)
    if (i < 0) i = names.push(name) - 1
    return `$${i + 1}`
  })
  return { text, values: names.map((n) => toValue(params[n])) }
}
// 57P03: cannot_connect_now（起動中）
export const NOT_READY = new Set(['57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'])
// 実行して結果と更新件数を返す。opts.client はトランザクション中の接続
export async function execute(sql, params = {}, opts = {}) {
  const { text, values } = toPositional(sql, params)
  let res
  try {
    res = await (opts.client ?? getPool()).query(text, values)
  } catch (err) {
    // 再起動中・接続できない（画面は M-01 を出して再試行する）
    if (NOT_READY.has(err?.code)) throw new AppError('DB_RESUMING', undefined, { cause: err.code })
    throw err
  }
  return { rows: res.rows ?? [], numberOfRecordsUpdated: res.rowCount ?? 0 }
}
// 結果の行だけを返す
export async function query(sql, params = {}, opts = {}) {
  return (await execute(sql, params, opts)).rows
}
