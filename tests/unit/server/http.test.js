import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { createHttpServer, toEvent, errorCounter, MAX_BODY_BYTES } from '../../../server/http.mjs'
import { signToken } from '../../../functions/shared/auth/token.js'
import { s3Mock, awsError } from '../../helpers/mocks.js'
import { memoryLogger } from '../../helpers/logger.js'
const s3 = s3Mock()
let server, base, handle, log
// fetch はテストで止めているので、node:http で呼ぶ
function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-'))
  await mkdir(join(root, 'js'))
  await writeFile(join(root, 'index.html'), '<main id="app"></main>')
  await writeFile(join(root, 'sw.js'), 'self')
  await writeFile(join(root, 'js', 'main.js'), 'export {}')
  await writeFile(join(root, 'data.bin'), 'x')
  log = memoryLogger()
  handle = vi.fn()
  server = createHttpServer({ webRoot: root, log, handle: (...a) => handle(...a) })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((r) => server.close(r)))
beforeEach(() => {
  s3.reset()
  handle.mockReset().mockResolvedValue({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"ok":1}' })
})
describe('M-S01 server/http', () => {
  it('MT-S01-01 /api を API に渡す（API Gateway と同じ形の event）', async () => {
    const token = signToken({ sub: 'sub-15', groups: ['learner'] })
    const res = await request('/api/home?x=1', { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    expect(res.body).toBe('{"ok":1}')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    const event = handle.mock.calls[0][0]
    expect(event).toMatchObject({ rawPath: '/api/home', rawQueryString: 'x=1', queryStringParameters: { x: '1' }, requestContext: { http: { method: 'GET', path: '/api/home' } } })
    expect(event.requestContext.authorizer.jwt.claims).toMatchObject({ sub: 'sub-15', groups: ['learner'] })
    expect(event.body).toBeUndefined()
  })
  it('MT-S01-02 トークンがない・正しくないときはクレームなし', async () => {
    await request('/api/home')
    await request('/api/home', { headers: { authorization: 'Bearer abc' } })
    await request('/api/home', { headers: { authorization: 'Basic abc' } })
    for (const c of handle.mock.calls) expect(c[0].requestContext.authorizer).toBeUndefined()
  })
  it('MT-S01-03 本文を渡す・大きすぎる本文は 413', async () => {
    await request('/api/me/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"nickname":"たろう"}' })
    expect(handle.mock.calls[0][0].body).toBe('{"nickname":"たろう"}')
    const big = await request('/api/admin/imports', { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1) })
    expect(big.status).toBe(413)
    expect(JSON.parse(big.body).error.code).toBe('VALIDATION_ERROR')
    expect(handle).toHaveBeenCalledTimes(1)
  })
  it('MT-S01-04 API の例外は 500', async () => {
    handle.mockRejectedValue(new Error('boom'))
    const res = await request('/api/home')
    expect(res.status).toBe(500)
    expect(JSON.parse(res.body).error.code).toBe('INTERNAL_ERROR')
    expect(log.lines.some((l) => l.msg === 'http.error')).toBe(true)
  })
  it('MT-S01-05 画面のファイル（キャッシュの指定）', async () => {
    const index = await request('/')
    expect(index.status).toBe(200)
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(index.headers['cache-control']).toBe('no-cache')
    expect((await request('/sw.js')).headers['cache-control']).toBe('no-cache')
    const js = await request('/js/main.js')
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(js.headers['cache-control']).toBe('public, max-age=86400')
    expect((await request('/data.bin')).headers['content-type']).toBe('application/octet-stream')
    expect((await request('/nothing.js')).status).toBe(404)
    expect((await request('/js')).status).toBe(404)
  })
  it('MT-S01-06 画面の外のファイルは読ませない', async () => {
    expect((await request('/..%2f..%2fetc%2fpasswd')).status).toBe(404)
    expect((await request('/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404)
    expect((await request('/', { method: 'POST' })).status).toBe(405)
  })
  it('MT-S01-07 キャラクター画像（オブジェクトストレージから流す）', async () => {
    s3.on(GetObjectCommand).resolves({ Body: Readable.from([Buffer.from('PNG')]), ContentType: 'image/png' })
    const res = await request('/partners/encourage-20261020100000.png')
    expect(res.status).toBe(200)
    expect(res.body).toBe('PNG')
    expect(res.headers['cache-control']).toBe('public, max-age=86400')
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({ Bucket: 'rpg-test-assets', Key: 'partners/encourage-20261020100000.png' })
    expect((await request('/partners/../secret.png')).status).toBe(404)
    s3.on(GetObjectCommand).rejects(awsError('NoSuchKey'))
    expect((await request('/partners/encourage-20261020100000.png')).status).toBe(404)
    s3.on(GetObjectCommand).resolves({ Body: Readable.from([Buffer.from('x')]) })
    expect((await request('/partners/encourage-20261020100000.webp')).headers['content-type']).toBe('application/octet-stream')
  })
  it('MT-S01-08 5xx が続いたら知らせる', () => {
    const notify = vi.fn()
    const count = errorCounter({ log, notify, windowMs: 1000, threshold: 3 })
    count(0)
    count(500)
    expect(notify).not.toHaveBeenCalled()
    count(900)
    expect(notify).toHaveBeenCalledWith('api-5xx', 'API のエラーが続いています', ['5分間に 3 回、API が 5xx を返しました。'], { log })
    count(5000)
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('MT-S01-09 API の 5xx を数える', async () => {
    handle.mockResolvedValue({ statusCode: 503, body: '' })
    const res = await request('/api/health')
    expect(res.status).toBe(503)
  })
  it('MT-S01-10 toEvent の既定', () => {
    const ev = toEvent({ method: 'GET', headers: {} }, new URL('http://x/api/me'), '')
    expect(ev.queryStringParameters).toBeUndefined()
    expect(ev.requestContext.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
