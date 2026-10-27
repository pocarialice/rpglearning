import { describe, it, expect, vi } from 'vitest'
import { escapeHtml, formatDate, formatDateTime, formatExp, formatPct } from '../../../../web/js/logic/format.js'
import { pollGrading } from '../../../../web/js/logic/grading-poller.js'
import { ApiError } from '../../../../web/js/core/api.js'
describe('M-F05 logic/format', () => {
  it('MT-F05-01 HTMLエスケープ', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>&"\'')).toBe('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;')
  })
  it('MT-F05-02 数値・日付の表示', () => {
    expect(formatExp(1232)).toBe('1,232')
    expect(formatDate('2026-10-21T00:30:00+09:00')).toBe('2026/10/21')
  })
  it('MT-F05-03 境界と空の値', () => {
    expect(formatDate('2026-10-20T15:00:00Z')).toBe('2026/10/21')
    expect(formatDate('2026-11-02')).toBe('2026/11/02')
    expect(formatDate(null)).toBe('')
    expect(formatDateTime('2026-10-20T23:30:00Z')).toBe('2026/10/21 08:30')
    expect(formatDateTime('')).toBe('')
    expect(formatExp(undefined)).toBe('0')
    expect(formatPct(40)).toBe('40.0%')
    expect(formatPct(null)).toBe('-')
    expect(escapeHtml(null)).toBe('')
  })
})
describe('M-F06 logic/grading-poller', () => {
  it('MT-F06-01 採点結果が返る', async () => {
    vi.useFakeTimers()
    const apiGet = vi.fn().mockResolvedValueOnce({ status: 'processing' }).mockResolvedValueOnce({ status: 'processing' }).mockResolvedValue({ status: 'done', score: 72 })
    const p = pollGrading('gr_456', { apiGet })
    await vi.advanceTimersByTimeAsync(4000)
    await expect(p).resolves.toEqual({ status: 'done', score: 72 })
    expect(apiGet).toHaveBeenCalledTimes(3)
    expect(apiGet).toHaveBeenCalledWith('/gradings/gr_456')
  })
  it('MT-F06-02 30秒で打ち切る', async () => {
    vi.useFakeTimers()
    const apiGet = vi.fn(async () => ({ status: 'processing' }))
    const p = pollGrading('gr_456', { apiGet })
    const check = expect(p).rejects.toMatchObject({ code: 'GRADING_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(30000)
    await check
    const calls = apiGet.mock.calls.length
    expect(calls).toBe(15)
    await vi.advanceTimersByTimeAsync(10000)
    expect(apiGet).toHaveBeenCalledTimes(calls)
  })
  it('MT-F06-03 504 が返る', async () => {
    vi.useFakeTimers()
    const apiGet = vi.fn().mockResolvedValueOnce({ status: 'processing' }).mockRejectedValue(new ApiError('GRADING_TIMEOUT', 504))
    const p = pollGrading('gr_456', { apiGet })
    const check = expect(p).rejects.toMatchObject({ code: 'GRADING_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(2000)
    await check
    expect(apiGet).toHaveBeenCalledTimes(2)
  })
  it('MT-F06-04 一時的な通信エラー', async () => {
    vi.useFakeTimers()
    const apiGet = vi.fn().mockResolvedValueOnce({ status: 'processing' }).mockRejectedValueOnce(new ApiError('NETWORK', 0)).mockResolvedValue({ status: 'done' })
    const p = pollGrading('gr_456', { apiGet })
    await vi.advanceTimersByTimeAsync(4000)
    await expect(p).resolves.toEqual({ status: 'done' })
  })
  it('MT-F06-05 失敗の結果・そのほかのエラー・504（コードなし）', async () => {
    await expect(pollGrading('g', { apiGet: async () => ({ status: 'failed', retryable: true }) })).resolves.toEqual({ status: 'failed', retryable: true })
    await expect(pollGrading('g', { apiGet: async () => { throw new ApiError('NOT_FOUND', 404) } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(pollGrading('g', { apiGet: async () => { throw new ApiError('HTTP_504', 504) } })).rejects.toMatchObject({ code: 'GRADING_TIMEOUT' })
    await expect(pollGrading('g', { apiGet: async () => { throw null } })).rejects.toBeNull()
  })
})
