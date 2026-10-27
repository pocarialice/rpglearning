import { describe, it, expect, beforeEach } from 'vitest'
import { withTx } from '../../../../../functions/shared/db/tx.js'
import { dbMock, pgError } from '../../../../helpers/mocks.js'
const db = dbMock()
describe('M-D02 tx', () => {
  beforeEach(() => {
    db.reset()
  })
  it('MT-D02-01 正常', async () => {
    await withTx(async (tx) => {
      await tx.query('SELECT 1')
      await tx.execute('UPDATE x SET y = 1')
    })
    expect(db.txLog()).toEqual(['BEGIN', 'COMMIT'])
    expect(db.calls().map((c) => c.sql)).toEqual(['SELECT 1', 'UPDATE x SET y = 1'])
    expect(db.released()).toBe(1)
  })
  it('MT-D02-02 途中の例外', async () => {
    const boom = pgError('23505')
    db.once({ rows: [] }).rejectsOnce(boom)
    await expect(withTx(async (tx) => {
      await tx.query('SELECT 1')
      await tx.query('SELECT 2')
    })).rejects.toBe(boom)
    expect(db.txLog()).toEqual(['BEGIN', 'ROLLBACK'])
    expect(db.released()).toBe(1)
  })
  it('MT-D02-05 Rollback が失敗しても元の例外を投げる', async () => {
    const boom = new Error('boom')
    db.failTx('ROLLBACK', pgError('08006'))
    await expect(withTx(async () => { throw boom })).rejects.toBe(boom)
    expect(db.released()).toBe(1)
  })
  it('MT-D02-03 Commit の失敗', async () => {
    db.failTx('COMMIT', pgError('40001'))
    await expect(withTx(async () => 1)).rejects.toMatchObject({ code: '40001' })
    expect(db.released()).toBe(1)
  })
  it('MT-D02-04 戻り値', async () => {
    await expect(withTx(async () => ({ id: 1 }))).resolves.toEqual({ id: 1 })
  })
  it('MT-D02-06 並べて呼んでも1つずつ流す', async () => {
    let running = 0
    let max = 0
    db.callsFake(async () => {
      running++
      max = Math.max(max, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return { rows: [] }
    })
    await withTx(async (tx) => Promise.all([tx.query('SELECT 1'), tx.query('SELECT 2'), tx.execute('SELECT 3')]))
    expect(max).toBe(1)
    expect(db.calls()).toHaveLength(3)
  })
  it('MT-D02-07 並べた片方が失敗しても次は流れる', async () => {
    db.rejectsOnce(pgError('22P02'))
    await expect(withTx(async (tx) => {
      const a = tx.query('SELECT 1').catch((e) => e.code)
      const b = tx.query('SELECT 2')
      return Promise.all([a, b])
    })).resolves.toEqual(['22P02', []])
  })
})
