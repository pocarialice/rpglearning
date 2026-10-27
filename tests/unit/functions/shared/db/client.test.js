import { describe, it, expect, beforeEach } from 'vitest'
import pg from 'pg'
import { query, execute, toPositional, toUtcText, getPool, setPool, NOT_READY } from '../../../../../functions/shared/db/client.js'
import { dbMock, pgError } from '../../../../helpers/mocks.js'
const db = dbMock()
describe('M-D01 client', () => {
  beforeEach(() => {
    db.reset()
  })
  it('MT-D01-01 :name を $1 に置き換える', async () => {
    await query('SELECT :a, :b, :a', { a: 1, b: 'x' })
    expect(db.calls()[0]).toEqual({ sql: 'SELECT $1, $2, $1', values: [1, 'x'] })
  })
  it('MT-D01-02 型変換（::text）とキャストは置き換えない', () => {
    expect(toPositional('WHERE (:s::text IS NULL OR s = :s) AND x = CAST(:c AS timestamptz)', { s: null, c: '2026-10-20' }))
      .toEqual({ text: 'WHERE ($1::text IS NULL OR s = $1) AND x = CAST($2 AS timestamptz)', values: [null, '2026-10-20'] })
  })
  it('MT-D01-03 パラメータの型（真偽・null・undefined）', () => {
    expect(toPositional(':t :n :u', { t: true, n: null, u: undefined }).values).toEqual([true, null, null])
  })
  it('MT-D01-05 日付・JSON', () => {
    expect(toPositional(':d :j', { d: { date: '2026-10-20' }, j: { json: { a: 1 } } }).values).toEqual(['2026-10-20', '{"a":1}'])
  })
  it('MT-D01-12 変換できない型・足りないパラメータは例外', () => {
    expect(() => toPositional(':x', { x: { foo: 1 } })).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }))
    expect(() => toPositional(':missing', {})).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }))
  })
  it('MT-D01-06 結果の行', async () => {
    db.resolves({ rows: [{ user_id: 15 }] })
    expect(await query('SELECT user_id FROM users')).toEqual([{ user_id: 15 }])
  })
  it('MT-D01-07 更新件数', async () => {
    db.resolves({ updated: 3 })
    expect(await execute('UPDATE x SET y = 1')).toEqual({ rows: [], numberOfRecordsUpdated: 3 })
    db.resolves({ rows: undefined, rowCount: undefined })
    expect(await execute('UPDATE x SET y = 1')).toMatchObject({ rows: [] })
  })
  it('MT-D01-08 起動中・接続できないときは DB_RESUMING', async () => {
    for (const code of NOT_READY) {
      db.rejectsOnce(pgError(code))
      await expect(query('SELECT 1')).rejects.toMatchObject({ code: 'DB_RESUMING', status: 503 })
    }
  })
  it('MT-D01-09 そのほかの失敗はそのまま投げる', async () => {
    const err = pgError('23505')
    db.rejects(err)
    await expect(query('INSERT')).rejects.toBe(err)
  })
  it('MT-D01-10 トランザクションの接続を使う', async () => {
    const calls = []
    const client = { query: async (text, values) => { calls.push(text); return { rows: [], rowCount: 0 } } }
    await execute('SELECT :a', { a: 1 }, { client })
    expect(calls).toEqual(['SELECT $1'])
    expect(db.calls()).toHaveLength(0)
  })
  it('MT-D01-11 日時の列は UTC の文字にそろえる', () => {
    expect(toUtcText('2026-10-20 10:02:03.456+09')).toBe('2026-10-20 01:02:03.456')
    expect(toUtcText('2026-10-20 01:02:03+00')).toBe('2026-10-20 01:02:03.000')
    expect(toUtcText('2026-10-20 01:02:03.5+05:30')).toBe('2026-10-19 19:32:03.500')
    expect(pg.types.getTypeParser(20)('9007199254740991')).toBe(9007199254740991)
    expect(pg.types.getTypeParser(1082)('2026-10-20')).toBe('2026-10-20')
  })
  it('MT-D01-04 接続プールは DATABASE_URL から1つだけ作る', async () => {
    setPool(undefined)
    const a = getPool()
    expect(a).toBeInstanceOf(pg.Pool)
    expect(getPool()).toBe(a)
    expect(a.options.connectionString).toBe(process.env.DATABASE_URL)
    await a.end()
    db.reset()
  })
})
