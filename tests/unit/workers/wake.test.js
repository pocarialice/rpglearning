// Cloudflare Worker（起こす係。workers/wake）
import { describe, it, expect, beforeEach } from 'vitest'
import { handle, shouldWake, powerOn, resetCache, isUnreachable, stateUrl, wokeUrl, canonicalRedirect } from '../../../workers/wake/src/wake.js'
const SITE = 'https://example.jp'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const env = { SAKURACLOUD_ACCESS_TOKEN: 't', SAKURACLOUD_ACCESS_TOKEN_SECRET: 's', SAKURACLOUD_ZONE: 'is1b', SERVER_NAME: 'rpg-dev-app', CANONICAL_HOST: 'example.jp' }
const req = (path, { method = 'GET', headers = {} } = {}) => new Request(SITE + path, { method, headers: { 'user-agent': UA, ...headers } })
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// Cache API の代わり（max-age は見ない）
function memCache() {
  const m = new Map()
  return { m, match: async (u) => m.get(String(u)), put: async (u, r) => { m.set(String(u), r) } }
}
// オリジンとさくらのクラウド API の代わり
function fakeFetch({ origin = () => new Response('ok'), power = 'down', servers = [{ ID: '113', Name: 'rpg-dev-app' }] } = {}) {
  const calls = []
  const fn = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    const method = typeof input === 'string' ? (init.method ?? 'GET') : input.method
    calls.push({ url, method, auth: init.headers?.Authorization })
    if (url.startsWith('https://secure.sakura.ad.jp/')) {
      if (url.includes('/server?')) return json(200, { Servers: servers })
      if (url.endsWith('/power') && method === 'GET') return json(200, { Instance: { Status: power } })
      if (url.endsWith('/power') && method === 'PUT') return json(200, { Success: true })
      return json(404, {})
    }
    return origin(input)
  }
  fn.calls = calls
  fn.sakura = () => calls.filter((c) => c.url.startsWith('https://secure.sakura.ad.jp/'))
  return fn
}
async function run(request, opts) {
  const pending = []
  const res = await handle(request, env, { ...opts, waitUntil: (p) => pending.push(p) })
  await Promise.all(pending)
  return res
}
beforeEach(() => resetCache())
describe('shouldWake', () => {
  it('ログイン中の画面からの /api/*（Authorization）と POST は起こす', () => {
    expect(shouldWake(req('/api/me', { headers: { authorization: 'Bearer x' } }))).toBe(true)
    expect(shouldWake(req('/api/auth/login', { method: 'POST' }))).toBe(true)
    expect(shouldWake(req('/__wake', { method: 'POST' }))).toBe(true)
  })
  it('画面のファイル・GET だけの /api・死活確認・ボットでは起こさない', () => {
    expect(shouldWake(req('/'))).toBe(false)
    expect(shouldWake(req('/js/main.js'))).toBe(false)
    expect(shouldWake(req('/api/me'))).toBe(false)
    expect(shouldWake(req('/api/health', { headers: { authorization: 'Bearer x' } }))).toBe(false)
    expect(shouldWake(req('/__wake'))).toBe(false)
    expect(shouldWake(req('/api/auth/login', { method: 'POST', headers: { 'user-agent': 'Googlebot/2.1' } }))).toBe(false)
    expect(shouldWake(new Request(SITE + '/api/auth/login', { method: 'POST' }))).toBe(false)
  })
})
describe('isUnreachable', () => {
  it('Cloudflare の 52x・530 だけをつながらないとみなす（アプリの 503 や Caddy の 502 はそのまま返す）', () => {
    expect(isUnreachable(new Response('', { status: 522 }))).toBe(true)
    expect(isUnreachable(new Response('', { status: 530 }))).toBe(true)
    expect(isUnreachable(new Response('', { status: 503 }))).toBe(false)
    expect(isUnreachable(new Response('', { status: 502 }))).toBe(false)
  })
})
describe('powerOn', () => {
  it('止まっていれば PUT で電源を入れる。認証は Basic', async () => {
    const f = fakeFetch()
    expect(await powerOn(env, f)).toBe('started')
    const s = f.sakura()
    expect(s.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT'])
    expect(s[0].url).toContain('/zone/is1b/api/cloud/1.1/server?')
    expect(s[2].url).toMatch(/\/server\/113\/power$/)
    expect(s[0].auth).toBe('Basic ' + btoa('t:s'))
  })
  it('もう動いていれば何もしない。ID は覚えておく', async () => {
    const f = fakeFetch({ power: 'up' })
    expect(await powerOn(env, f)).toBe('up')
    expect(await powerOn(env, f)).toBe('up')
    expect(f.sakura().map((c) => c.method)).toEqual(['GET', 'GET', 'GET'])
  })
  it('名前がぴったり同じサーバーが1台でなければ失敗する（部分一致のものは数えない）', async () => {
    const f = fakeFetch({ servers: [{ ID: '1', Name: 'rpg-dev-app-old' }] })
    await expect(powerOn(env, f)).rejects.toThrow('0 台')
  })
  it('API がエラーなら失敗する', async () => {
    const f = async () => json(401, {})
    await expect(powerOn(env, f)).rejects.toThrow('HTTP 401')
  })
})
describe('handle', () => {
  it('サーバーが動いていれば、そのまま返す（起こさない）', async () => {
    const f = fakeFetch({ origin: () => json(200, { ok: true }) })
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(200)
    expect(f.sakura()).toHaveLength(0)
  })
  it('アプリの 503（DB_RESUMING）はそのまま返す', async () => {
    const f = fakeFetch({ origin: () => json(503, { error: { code: 'DB_RESUMING' } }) })
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache: memCache() })
    expect((await res.json()).error.code).toBe('DB_RESUMING')
  })
  it('止まっていて、ログイン中の画面からの API なら、起こして SERVER_WAKING を返す', async () => {
    const cache = memCache()
    const f = fakeFetch({ origin: () => new Response('', { status: 522 }) })
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache })
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('10')
    expect((await res.json()).error.code).toBe('SERVER_WAKING')
    expect(f.sakura().some((c) => c.method === 'PUT')).toBe(true)
    expect(cache.m.has(stateUrl(SITE))).toBe(true)
    expect(cache.m.has(wokeUrl(SITE))).toBe(true)
  })
  it('つながらないと覚えているあいだはサーバーに取りに行かず、起こしたばかりなら API も呼ばない', async () => {
    const cache = memCache()
    await cache.put(stateUrl(SITE), new Response('1'))
    await cache.put(wokeUrl(SITE), new Response('1'))
    const f = fakeFetch()
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache })
    expect(res.status).toBe(503)
    expect(f.calls).toHaveLength(0)
  })
  it('つながらない（例外）ときも起動中を返す', async () => {
    const f = fakeFetch({ origin: () => { throw new Error('timeout') } })
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache: memCache() })
    expect((await res.json()).error.code).toBe('SERVER_WAKING')
  })
  it('止まっていて画面を開いたら、起動中ページを返す（ページの JavaScript が起こす。GET だけでは起こさない）', async () => {
    const f = fakeFetch({ origin: () => new Response('', { status: 521 }) })
    const res = await run(req('/', { headers: { accept: 'text/html' } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
    const html = await res.text()
    expect(html).toContain("fetch('/__wake', { method: 'POST' })")
    expect(html).toContain('/api/health')
    expect(f.sakura()).toHaveLength(0)
  })
  it('画面のファイル（画像など）には短い 503 を返す', async () => {
    const f = fakeFetch({ origin: () => new Response('', { status: 522 }) })
    const res = await run(req('/img/a.png', { headers: { accept: 'image/png' } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('starting')
  })
  it('POST /__wake は 204 を返し、電源を入れる', async () => {
    const f = fakeFetch()
    const res = await run(req('/__wake', { method: 'POST' }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(204)
    expect(f.sakura().some((c) => c.method === 'PUT')).toBe(true)
  })
  it('ボットの POST /__wake では起こさない', async () => {
    const f = fakeFetch()
    const res = await run(req('/__wake', { method: 'POST', headers: { 'user-agent': 'GPTBot/1.0' } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(204)
    expect(f.sakura()).toHaveLength(0)
  })
  it('電源を入れられなくても、起動中は返す（ログに残す）', async () => {
    const f = async (input) => (typeof input === 'string' ? json(500, {}) : new Response('', { status: 522 }))
    const res = await run(req('/api/me', { headers: { authorization: 'Bearer x' } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(503)
  })
  it('Let\'s Encrypt の確認はそのまま渡す。状態のパスは外に見せない', async () => {
    const f = fakeFetch({ origin: () => new Response('token') })
    expect(await (await run(req('/.well-known/acme-challenge/abc'), { fetchFn: f, cache: memCache() })).text()).toBe('token')
    expect((await run(req('/__wake-state/woke'), { fetchFn: f, cache: memCache() })).status).toBe(404)
  })
})
describe('canonicalRedirect', () => {
  it('www・前のドメインは、パスとクエリをそのままに本体へ 301 で移す（サーバーにも API にも行かない）', async () => {
    const f = fakeFetch()
    const res = await run(new Request('https://www.example.jp/s/06?x=1', { headers: { 'user-agent': UA } }), { fetchFn: f, cache: memCache() })
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://example.jp/s/06?x=1')
    expect(f.calls).toHaveLength(0)
  })
  it('本体のドメインと、CANONICAL_HOST がないときは移さない', () => {
    expect(canonicalRedirect(new URL('https://example.jp/'), env)).toBeNull()
    expect(canonicalRedirect(new URL('https://www.example.jp/'), {})).toBeNull()
  })
  it('www の Let\'s Encrypt の確認は、移さずにサーバーへ渡す', async () => {
    const f = fakeFetch({ origin: () => new Response('token') })
    const res = await run(new Request('https://www.example.jp/.well-known/acme-challenge/abc'), { fetchFn: f, cache: memCache() })
    expect(await res.text()).toBe('token')
  })
})
