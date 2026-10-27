// リポジトリ共通：列名の変換と既定の実行先
import { query, execute } from '../client.js'
export const defaultDb = { query, execute }
export function camel(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}
export function camelRow(row) {
  if (!row) return null
  const out = {}
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v
  return out
}
export function camelRows(rows) {
  return rows.map(camelRow)
}
export const date = (d) => (d === null || d === undefined ? null : { date: d })
export const json = (obj) => ({ json: obj })
