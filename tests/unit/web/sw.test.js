import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
// sw.js を Service Worker の代わりの入れ物で読み込み、fetch のハンドラを取り出す
function loadSw({ cached = null, fetchImpl = async () => ({ ok: true, status: 200, clone: () => 'copy' }) } = {}) {
  const handlers = {}
  const cache = { match: vi.fn(async () => cached), put: vi.fn(async () => {}) }
  const fetch = vi.fn(fetchImpl)
  // Response の代わり（本文と状態とヘッダーを持つだけ）
  class Response { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = init.headers ?? {} } }
  const self = { location: { origin: 'https://rpg.example' }, addEventListener: (type, fn) => { handlers[type] = fn }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } }
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn() }
  runInNewContext(readFileSync('web/sw.js', 'utf8'), { self, caches, fetch, URL, Response })
  const request = (path, method = 'GET', mode = 'no-cors') => {
    let responded = null
    handlers.fetch({ request: { url: `https://rpg.example${path}`, method, mode }, respondWith: (p) => { responded = p } })
    return responded
  }
  return { request, fetch, cache }
}
describe('M-F24 sw.js', () => {
  it('MT-F24-01 キャッシュにないファイルは HTTP キャッシュを使わずに取り、キャッシュに入れる', async () => {
    const { request, fetch, cache } = loadSw()
    await request('/js/pages/learner/s06-result.js')
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://rpg.example/js/pages/learner/s06-result.js' }), { cache: 'no-cache' })
    expect(cache.put).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }), 'copy')
  })
  it('MT-F24-02 キャッシュにあればそれを返し、/api と GET 以外は扱わない', async () => {
    const hit = { ok: true }
    const { request, fetch } = loadSw({ cached: hit })
    expect(await request('/css/app.css')).toBe(hit)
    expect(fetch).not.toHaveBeenCalled()
    expect(request('/api/home')).toBeNull()
    expect(request('/js/main.js', 'POST')).toBeNull()
  })
  it('MT-F24-03 画面を開くときはキャッシュがあっても使わず、サーバーから取った応答を返す', async () => {
    const page = { ok: true, status: 200 }
    const { request, fetch, cache } = loadSw({ cached: { ok: true }, fetchImpl: async () => page })
    expect(await request('/', 'GET', 'navigate')).toBe(page)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://rpg.example/' }), { cache: 'no-cache' })
    expect(cache.match).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })
  it('MT-F24-04 画面を開くときにサーバーにつながらなければお休み中の案内を返し、起動中ページなどの応答はそのまま返す', async () => {
    const { request, cache } = loadSw({ cached: { ok: true }, fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
    const res = await request('/', 'GET', 'navigate')
    expect(res.status).toBe(503)
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.body).toContain('ギルドはいまお休み中です')
    expect(res.body).toContain('location.reload()')
    expect(cache.match).not.toHaveBeenCalled()
    for (const status of [503, 404]) {
      const page = { ok: false, status }
      const { request } = loadSw({ fetchImpl: async () => page })
      expect(await request('/', 'GET', 'navigate')).toBe(page)
    }
  })
})
