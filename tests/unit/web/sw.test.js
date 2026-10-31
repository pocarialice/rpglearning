import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
// sw.js を Service Worker の代わりの入れ物で読み込み、fetch のハンドラを取り出す
function loadSw({ cached = null } = {}) {
  const handlers = {}
  const cache = { match: vi.fn(async () => cached), put: vi.fn(async () => {}) }
  const fetch = vi.fn(async () => ({ ok: true, clone: () => 'copy' }))
  const self = { location: { origin: 'https://rpg.example' }, addEventListener: (type, fn) => { handlers[type] = fn }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } }
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn() }
  runInNewContext(readFileSync('web/sw.js', 'utf8'), { self, caches, fetch, URL })
  const request = (path, method = 'GET') => {
    let responded = null
    handlers.fetch({ request: { url: `https://rpg.example${path}`, method }, respondWith: (p) => { responded = p } })
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
})
