// マイグレーションの適用（詳細設計書 8.7）。未適用のファイルを番号順に、1ファイル＝1トランザクションで流す
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
export const FILE_RE = /^(V\d{3})__[a-z0-9_]+\.sql$/
export async function listMigrations(dir) {
  return (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort().map((f) => ({ version: FILE_RE.exec(f)[1], file: join(dir, f) }))
}
async function appliedVersions(client) {
  const t = await client.query("SELECT to_regclass('public.schema_migrations') AS t")
  if (!t.rows[0].t) return new Set()
  return new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version))
}
export async function migrate({ pool, dir, release = null, log = console }) {
  const client = await pool.connect()
  const applied = []
  try {
    // 2つのコンテナが同時に起動しても、片方だけが流す
    await client.query('SELECT pg_advisory_lock(20261027)')
    const done = await appliedVersions(client)
    for (const m of await listMigrations(dir)) {
      if (done.has(m.version)) continue
      const sql = await readFile(m.file, 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        const r = await client.query('UPDATE schema_migrations SET release_no = $1 WHERE version = $2', [release, m.version])
        if (r.rowCount !== 1) throw new Error(`${m.version} の最後で schema_migrations に1行入れてください`)
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`${m.version} の適用に失敗しました: ${err.message}`, { cause: err })
      }
      log.info?.({ msg: 'migrate.applied', version: m.version })
      applied.push(m.version)
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(20261027)').catch(() => {})
    client.release()
  }
  return applied
}
