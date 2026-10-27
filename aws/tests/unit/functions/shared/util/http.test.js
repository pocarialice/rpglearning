import { describe, it, expect } from 'vitest'
import { ok, csv, parseBody, noContent } from '../../../../../functions/shared/util/http.js'
describe('M-U06 http', () => {
  it('MT-U06-01 本文（JSON）', () => {
    expect(parseBody({ body: '{"a":1}' })).toEqual({ a: 1 })
  })
  it('MT-U06-02 本文（Base64）', () => {
    expect(parseBody({ body: 'eyJhIjoxfQ==', isBase64Encoded: true })).toEqual({ a: 1 })
  })
  it('MT-U06-03 本文なし', () => {
    expect(parseBody({ body: undefined })).toEqual({})
    expect(parseBody({ body: '' })).toEqual({})
    expect(parseBody(undefined)).toEqual({})
  })
  it('MT-U06-04 壊れたJSON', () => {
    expect(() => parseBody({ body: '{a:1' })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
  })
  it('MT-U06-05 通常の応答', () => {
    const res = ok({ x: 1 }, 201)
    expect(res.statusCode).toBe(201)
    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(JSON.parse(res.body)).toEqual({ x: 1 })
    expect(ok(undefined).statusCode).toBe(200)
    expect(ok(undefined).body).toBe('{}')
    expect(noContent().statusCode).toBe(204)
  })
  it('MT-U06-06 CSVの応答', () => {
    const res = csv('a,b', 'dashboard_c_3_20261020.csv')
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="dashboard_c_3_20261020.csv"')
    expect(res.body).toBe('a,b')
  })
})
