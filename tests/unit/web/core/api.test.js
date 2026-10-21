import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApi, ApiError } from '../../../../web/js/core/api.js'
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) })
const resuming = () => json(503, { error: { code: 'DB_RESUMING', message: '起動中' } })
let auth
let fetchFn
let onResuming
let onLoginRequired
const make = () => createApi({ auth, fetchFn, onResuming, onLoginRequired })
beforeEach(() => {
  auth = { getIdToken: vi.fn(async () => 'tok1'), refresh: vi.fn(async () => { auth.getIdToken.mockResolvedValue('tok2') }), login: vi.fn() }
  fetchFn = vi.fn(async () => json(200, { ok: 1 }))
  onResuming = vi.fn()
  onLoginRequired = vi.fn()
})
describe('M-F02 core/api', () => {
  it('MT-F02-01 ヘッダー', async () => {
    expect(await make().apiPost('/answers/choice', { a: 1 })).toEqual({ ok: 1 })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/answers/choice')
    expect(init).toEqual({ method: 'POST', headers: { Authorization: 'Bearer tok1', 'Content-Type': 'application/json' }, body: '{"a":1}' })
  })
  it('MT-F02-02 DB起動中から復帰', async () => {
    vi.useFakeTimers()
    fetchFn.mockResolvedValueOnce(resuming()).mockResolvedValueOnce(resuming()).mockResolvedValue(json(200, { home: 1 }))
    const p = make().apiGet('/home')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    await expect(p).resolves.toEqual({ home: 1 })
    expect(onResuming.mock.calls.map((c) => c[0])).toEqual([1, 2])
  })
  it('MT-F02-03 再試行が尽きる', async () => {
    vi.useFakeTimers()
    fetchFn.mockImplementation(async () => resuming())
    const p = make().apiGet('/home')
    const check = expect(p).rejects.toMatchObject({ code: 'DB_RESUMING', status: 503 })
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000)
    await check
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })
  it('MT-F02-04 401 で1回だけ更新', async () => {
    fetchFn.mockResolvedValueOnce(json(401, {})).mockResolvedValue(json(200, { me: 1 }))
    expect(await make().apiGet('/me')).toEqual({ me: 1 })
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('Bearer tok2')
  })
  it('MT-F02-05 401 が続く', async () => {
    fetchFn.mockResolvedValue(json(401, {}))
    await expect(make().apiGet('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    expect(onLoginRequired).toHaveBeenCalledTimes(1)
    auth.refresh.mockRejectedValue(new Error('x'))
    await expect(make().apiGet('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(onLoginRequired).toHaveBeenCalledTimes(2)
  })
  it('MT-F02-06 入力エラー', async () => {
    fetchFn.mockResolvedValue(json(400, { error: { code: 'VALIDATION_ERROR', message: '説明は50文字以上', details: [{ field: 'text' }] } }))
    const err = await make().apiPost('/gradings', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR', status: 400, message: '説明は50文字以上', details: [{ field: 'text' }] })
  })
  it('MT-F02-07 通信エラー', async () => {
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(make().apiGet('/home')).rejects.toMatchObject({ name: 'ApiError', code: 'NETWORK', status: 0 })
  })
  it('MT-F02-08 JSONでない応答・204・CSV・PUT・DELETE・既定の引数', async () => {
    fetchFn.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('x') } })
    await expect(make().apiGet('/home')).rejects.toMatchObject({ code: 'HTTP_502', status: 502 })
    fetchFn.mockResolvedValueOnce({ ok: true, status: 204 })
    expect(await make().apiDelete('/admin/questions/q_1')).toBeNull()
    fetchFn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '﻿a,b' })
    expect(await make().apiGet('/admin/dashboard.csv?course=c_3', { raw: true })).toBe('﻿a,b')
    await make().apiPut('/me/profile', { nickname: 'たろう' })
    expect(fetchFn.mock.calls.at(-1)[1].method).toBe('PUT')
    expect(fetchFn.mock.calls[1][1]).toEqual({ method: 'DELETE', headers: { Authorization: 'Bearer tok1' } })
    globalThis.fetch = vi.fn(async () => json(401, {}))
    const api = createApi({ auth: { ...auth, refresh: vi.fn(async () => { throw new Error('x') }) } })
    await expect(api.apiGet('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(auth.login).toHaveBeenCalled()
    expect(new ApiError('X', 1).message).toBe('X')
    globalThis.fetch = vi.fn(async () => resuming())
    vi.useFakeTimers()
    const p = createApi({ auth }).apiGet('/x')
    const check = expect(p).rejects.toMatchObject({ code: 'DB_RESUMING' })
    await vi.advanceTimersByTimeAsync(14000)
    await check
  })
})
