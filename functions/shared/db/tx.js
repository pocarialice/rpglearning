// トランザクション（詳細設計書 3.3 M-D02）
import { getPool, query, execute } from './client.js'
export async function withTx(fn) {
  const client = await getPool().connect()
  // 1つの接続では1つずつしか実行できないため、Promise.all で並べて呼ばれても順番に流す
  let chain = Promise.resolve()
  const serial = (fn) => {
    const p = chain.then(fn)
    chain = p.catch(() => {})
    return p
  }
  const tx = {
    query: (sql, params) => serial(() => query(sql, params, { client })),
    execute: (sql, params) => serial(() => execute(sql, params, { client }))
  }
  try {
    await client.query('BEGIN')
    const result = await fn(tx)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
