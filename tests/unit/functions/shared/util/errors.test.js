import { describe, it, expect } from 'vitest'
import { AppError, toErrorResponse, ERROR_STATUS } from '../../../../../functions/shared/util/errors.js'
describe('M-U01 errors', () => {
  it('MT-U01-01 AppError の属性', () => {
    const e = new AppError('NOT_FOUND', '見つかりません', { status: 404 })
    expect(e.code).toBe('NOT_FOUND')
    expect(e.status).toBe(404)
    expect(e.message).toBe('見つかりません')
    expect(e).toBeInstanceOf(Error)
  })
  it('MT-U01-02 応答への変換（想定エラー）', () => {
    const e = new AppError('NOT_FOUND', '見つかりません', { status: 404, details: [{ field: 'text' }] })
    const res = toErrorResponse(e)
    expect(res.statusCode).toBe(404)
    expect(res.body).toBe('{"error":{"code":"NOT_FOUND","message":"見つかりません","details":[{"field":"text"}]}}')
  })
  it('MT-U01-03 応答への変換（想定外）', () => {
    const res = toErrorResponse(new TypeError('x is undefined'))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error.code).toBe('INTERNAL_ERROR')
    expect(res.body).not.toContain('x is undefined')
  })
  it.each([
    ['VALIDATION_ERROR', 400], ['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['CONFLICT', 409],
    ['ONBOARDING_REQUIRED', 409], ['COURSE_REQUIRED', 409], ['DB_RESUMING', 503], ['GRADING_TIMEOUT', 504], ['INTERNAL_ERROR', 500]
  ])('MT-U01-04 コードからHTTPの既定 %s → %i', (code, status) => {
    const e = new AppError(code)
    expect(e.status).toBe(status)
    expect(ERROR_STATUS[code]).toBe(status)
    expect(e.message).not.toBe('')
  })
  it('MT-U01-04 補足 表にないコードは500、details なしの応答には details を出さない', () => {
    const e = new AppError('SOMETHING')
    expect(e.status).toBe(500)
    expect(e.message).toBe('SOMETHING')
    expect(JSON.parse(toErrorResponse(e).body).error).toEqual({ code: 'SOMETHING', message: 'SOMETHING' })
  })
})
