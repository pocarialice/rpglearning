// HTTP サーバー（詳細設計書 4.6）。/api を API に、/partners をキャラクター画像に、それ以外を画面のファイルにつなぐ
// API Gateway＋CloudFront の代わり。TLS はロードバランサー（またはリバースプロキシ）で終わらせる
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createLogger } from '../functions/shared/util/logger.js'
import { verifyToken } from '../functions/shared/auth/token.js'
import { getStream } from '../functions/shared/storage/object-storage.js'
import { alert } from '../functions/shared/util/alert.js'
import { main as api } from '../functions/api-handler/index.mjs'
export const MAX_BODY_BYTES = 1024 * 1024
export const ERROR_WINDOW_MS = 5 * 60 * 1000
export const ERROR_ALERT_COUNT = 5
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
}
// どの応答にも付ける
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin'
}
function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers })
  res.end(body)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (c) => {
      size += c.length
      // 上限を超えたら残りは読み捨て、413 を返す
      if (size > MAX_BODY_BYTES) tooLarge = true
      else chunks.push(c)
    })
    req.on('end', () => {
      if (tooLarge) reject(Object.assign(new Error('too large'), { status: 413 }))
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}
// API Gateway（HTTP API 2.0）と同じ形の event にする。正しいアクセストークンなら JWT オーソライザーと同じ場所にクレームを置く
export function toEvent(req, url, body, now = new Date()) {
  const event = {
    version: '2.0', rawPath: url.pathname, rawQueryString: url.search.slice(1),
    headers: req.headers, queryStringParameters: url.search ? Object.fromEntries(url.searchParams) : undefined,
    requestContext: { http: { method: req.method, path: url.pathname }, requestId: randomUUID() },
    body: body || undefined, isBase64Encoded: false
  }
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  const claims = m ? verifyToken(m[1], { now }) : null
  if (claims) event.requestContext.authorizer = { jwt: { claims } }
  return event
}
// 画面のファイル。ないパスは index.html（ハッシュで画面を切り替えるため、実際には / と js・css などだけ）
async function serveStatic(res, webRoot, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  const file = join(webRoot, rel === '' ? 'index.html' : rel)
  if (!file.startsWith(webRoot + sep) && file !== webRoot) return send(res, 403, { 'Content-Type': 'text/plain' }, 'forbidden')
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir')
  } catch {
    return send(res, 404, { 'Content-Type': 'text/plain' }, 'not found')
  }
  const ext = extname(file)
  // index.html と sw.js は毎回確かめさせ、ほかは1日キャッシュ（sw.js がリリースごとに入れ替える）
  const cache = ext === '.html' || file.endsWith(`${sep}sw.js`) ? 'no-cache' : 'public, max-age=86400'
  send(res, 200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache }, await readFile(file))
}
async function servePartner(res, pathname) {
  const key = pathname.slice(1)
  if (!/^partners\/[a-z]+-\d{14}\.(png|webp)$/.test(key)) return send(res, 404, { 'Content-Type': 'text/plain' }, 'not found')
  const obj = await getStream(process.env.ASSETS_BUCKET, key)
  if (!obj) return send(res, 404, { 'Content-Type': 'text/plain' }, 'not found')
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': obj.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' })
  Readable.from(obj.body).pipe(res)
}
// 5分間に5xx が5回以上あったら管理者にメールする（API Gateway の5xxアラームの代わり）
export function errorCounter({ log, notify = alert, windowMs = ERROR_WINDOW_MS, threshold = ERROR_ALERT_COUNT }) {
  let times = []
  return (now = Date.now()) => {
    times = times.filter((t) => now - t < windowMs)
    times.push(now)
    if (times.length >= threshold) notify('api-5xx', 'API のエラーが続いています', [`5分間に ${times.length} 回、API が 5xx を返しました。`], { log })
  }
}
export function createHttpServer({ webRoot, log = createLogger('http'), handle = api }) {
  const count5xx = errorCounter({ log })
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (url.pathname.startsWith('/api/')) {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : ''
        const event = toEvent(req, url, body)
        const started = Date.now()
        const out = await handle(event, { log: log.child({ requestId: event.requestContext.requestId }), now: new Date() })
        if (out.statusCode >= 500) count5xx()
        log.debug({ msg: 'api', method: req.method, path: url.pathname, status: out.statusCode, durationMs: Date.now() - started })
        return send(res, out.statusCode, out.headers ?? {}, out.body ?? '')
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { 'Content-Type': 'text/plain' }, 'method not allowed')
      if (url.pathname.startsWith('/partners/')) return await servePartner(res, url.pathname)
      return await serveStatic(res, webRoot, url.pathname)
    } catch (err) {
      if (err?.status === 413) return send(res, 413, { 'Content-Type': 'application/json' }, JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: '本文が大きすぎます' } }))
      log.error({ msg: 'http.error', path: url.pathname, err })
      count5xx()
      if (!res.headersSent) send(res, 500, { 'Content-Type': 'application/json' }, JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'エラーが発生しました' } }))
      else res.destroy()
    }
  })
}
