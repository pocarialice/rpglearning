import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { migrate, listMigrations } from '../../../../../functions/shared/db/migrate.js'
// 適用済みのバージョンと、流した SQL を覚える接続
function fakePool({ applied = [], hasTable = true, fail = null, noRecord = false } = {}) {
  const log = []
  const client = {
    async query(sql, values) {
      log.push(sql)
      if (sql.includes('to_regclass')) return { rows: [{ t: hasTable ? 'schema_migrations' : null }] }
      if (sql.startsWith('SELECT version FROM')) return { rows: applied.map((version) => ({ version })) }
      if (fail && sql.includes(fail)) throw new Error('syntax error')
      if (sql.startsWith('UPDATE schema_migrations')) return { rowCount: noRecord ? 0 : 1, values }
      return { rows: [], rowCount: 0 }
    },
    release() { log.push('release') }
  }
  return { pool: { connect: async () => client }, log }
}
let dir
const silent = { info: () => {} }
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mig-'))
  await writeFile(join(dir, 'V001__create.sql'), 'CREATE TABLE a (x int);')
  await writeFile(join(dir, 'V002__seed.sql'), 'INSERT INTO a VALUES (1);')
  await writeFile(join(dir, 'V002__seed.down.sql'), 'DELETE FROM a;')
  await writeFile(join(dir, 'README.md'), 'x')
})
describe('M-D05 migrate', () => {
  it('MT-D05-01 ファイルを番号順に並べる（*.down.sql などは除く）', async () => {
    expect((await listMigrations(dir)).map((m) => m.version)).toEqual(['V001', 'V002'])
    expect((await listMigrations(resolve(import.meta.dirname, '../../../../../db/migrations'))).map((m) => m.version)).toEqual(['V001', 'V002', 'V003'])
  })
  it('MT-D05-02 未適用だけを1ファイル＝1トランザクションで流す', async () => {
    const { pool, log } = fakePool({ applied: ['V001'] })
    expect(await migrate({ pool, dir, release: 'r1', log: silent })).toEqual(['V002'])
    expect(log).toEqual(['SELECT pg_advisory_lock(20261027)', "SELECT to_regclass('public.schema_migrations') AS t", 'SELECT version FROM schema_migrations',
      'BEGIN', 'INSERT INTO a VALUES (1);', 'UPDATE schema_migrations SET release_no = $1 WHERE version = $2', 'COMMIT', 'SELECT pg_advisory_unlock(20261027)', 'release'])
  })
  it('MT-D05-03 初めての DB（schema_migrations がない）', async () => {
    const { pool } = fakePool({ hasTable: false })
    expect(await migrate({ pool, dir, log: silent })).toEqual(['V001', 'V002'])
  })
  it('MT-D05-04 失敗したらそのファイルを取り消して止める', async () => {
    const { pool, log } = fakePool({ fail: 'INSERT INTO a' })
    await expect(migrate({ pool, dir, log: silent })).rejects.toThrow('V002 の適用に失敗しました: syntax error')
    expect(log).toContain('ROLLBACK')
    expect(log.at(-1)).toBe('release')
    expect(log.at(-2)).toBe('SELECT pg_advisory_unlock(20261027)')
  })
  it('MT-D05-05 schema_migrations に記録しないファイルは失敗', async () => {
    const { pool } = fakePool({ noRecord: true })
    await expect(migrate({ pool, dir, log: {} })).rejects.toThrow('schema_migrations に1行入れてください')
  })
})
