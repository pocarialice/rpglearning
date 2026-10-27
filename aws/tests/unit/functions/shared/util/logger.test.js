import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLogger } from '../../../../../functions/shared/util/logger.js'
let spy
beforeEach(() => {
  spy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
const lastLine = () => JSON.parse(spy.mock.calls.at(-1)[0])
describe('M-U05 logger', () => {
  it('MT-U05-01 1行のJSON', () => {
    const log = createLogger('api-handler', { requestId: 'c0ffee', userId: 15 })
    log.info({ route: 'GET /api/home', status: 200 })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = lastLine()
    expect(line).toMatchObject({ level: 'INFO', fn: 'api-handler', requestId: 'c0ffee', userId: 15, route: 'GET /api/home', status: 200 })
    expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/)
  })
  it('MT-U05-02 prod の DEBUG', () => {
    process.env.APP_ENV = 'prod'
    createLogger('f').debug({ a: 1 })
    expect(spy).not.toHaveBeenCalled()
  })
  it('MT-U05-03 dev の DEBUG', () => {
    process.env.APP_ENV = 'dev'
    createLogger('f').debug({ a: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(lastLine()).toMatchObject({ level: 'DEBUG', requestId: null })
  })
  it('MT-U05-04 伏せ字', () => {
    createLogger('f').warn({ text: '説明文', email: 'a@x.jp', nested: { fullName: '山田' }, list: [{ idToken: 't' }, 1] })
    const raw = spy.mock.calls[0][0]
    const line = JSON.parse(raw)
    expect(line.text).toBe('[REDACTED]')
    expect(line.email).toBe('[REDACTED]')
    expect(line.nested.fullName).toBe('[REDACTED]')
    expect(line.list[0].idToken).toBe('[REDACTED]')
    expect(raw).not.toContain('説明文')
    expect(raw).not.toContain('山田')
  })
  it('MT-U05-05 エラーのスタック', () => {
    const circ = {}
    circ.self = circ
    createLogger('f').child({ requestId: 'r1' }).error({ err: new Error('x'), circ })
    const raw = spy.mock.calls[0][0]
    expect(raw).not.toContain('[object Object]')
    const line = JSON.parse(raw)
    expect(typeof line.err.stack).toBe('string')
    expect(line.err.stack).toContain('Error: x')
    expect(line.requestId).toBe('r1')
    expect(line.circ.self).toBe('[Circular]')
  })
})
