// Cloudflare Worker（起こす係。workers/wake）の中身。入口は index.js（入口はハンドラーだけを export する）
// サーバーが動いているときは、リクエストをそのままサーバー（Cloudflare の DNS の A レコード）へ渡すだけ
// 起こすのは人が使っているときだけ：ログイン中の画面からの /api/*（Authorization ヘッダーか POST）と、起動中ページの JavaScript（POST /__wake）
// 画面のファイルや / を GET しただけ（ボットの見回り）では起こさず、起動中ページを返す。ページの JavaScript が /__wake を呼んで起こす
// 状態のキー（Cache API のキーは、このサイトのドメインの URL にする）
export const stateUrl = (origin) => `${origin}/__wake-state/origin-down`
export const wokeUrl = (origin) => `${origin}/__wake-state/woke`
export const DOWN_SECONDS = 20 // つながらなかったら、この秒数はサーバーに取りに行かず、すぐ起動中を返す
export const WAKE_SECONDS = 60 // 電源を入れたら、この秒数は API を呼ばない（たくさんのリクエストで何度も呼ばないように）
export const ORIGIN_TIMEOUT_MS = 30000
// Cloudflare がサーバーにつながらなかったときに返すステータス（521 つながらない・522 時間切れ など）
const UNREACHABLE = new Set([520, 521, 522, 523, 524, 525, 526, 527, 530])
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|go-http|java\//i
export function isUnreachable(res) {
  return UNREACHABLE.has(res.status)
}
// このリクエストでサーバーを起こしてよいか
export function shouldWake(request) {
  const url = new URL(request.url)
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOT_UA.test(ua)) return false
  if (url.pathname === '/__wake') return request.method === 'POST'
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/health') return false
  return request.method !== 'GET' || request.headers.has('authorization')
}
// --- さくらのクラウド API ---
let cachedId = null
export function resetCache() {
  cachedId = null
}
function sakura(env, fetchFn) {
  const base = `https://secure.sakura.ad.jp/cloud/zone/${env.SAKURACLOUD_ZONE || 'is1b'}/api/cloud/1.1`
  const auth = 'Basic ' + btoa(`${env.SAKURACLOUD_ACCESS_TOKEN}:${env.SAKURACLOUD_ACCESS_TOKEN_SECRET}`)
  return async (method, path) => {
    const res = await fetchFn(base + path, { method, headers: { Authorization: auth } })
    if (!res.ok) throw new Error(`sakura ${method} ${path.split('?')[0]}: HTTP ${res.status}`)
    return res.json()
  }
}
// 名前がぴったり同じサーバーの ID（API の名前の絞り込みは部分一致のため）
async function serverId(api, name) {
  if (cachedId) return cachedId
  const data = await api('GET', '/server?' + encodeURIComponent(JSON.stringify({ Filter: { Name: name } })))
  const hits = (data.Servers ?? []).filter((s) => s.Name === name)
  if (hits.length !== 1) throw new Error(`server ${name}: ${hits.length} 台見つかりました`)
  cachedId = hits[0].ID
  return cachedId
}
// 電源が切れていたら入れる。戻り値は 'started'（入れた）・'up'（もう入っている）
export async function powerOn(env, fetchFn) {
  const api = sakura(env, fetchFn)
  const id = await serverId(api, env.SERVER_NAME || 'rpg-dev-app')
  const st = await api('GET', `/server/${id}/power`)
  if (st?.Instance?.Status === 'up') return 'up'
  await api('PUT', `/server/${id}/power`)
  return 'started'
}
// --- 状態（Cloudflare のキャッシュに少しのあいだ覚えておく。データセンターごと） ---
async function flagged(cache, url) {
  return Boolean(await cache.match(url))
}
async function flag(cache, url, seconds) {
  await cache.put(url, new Response('1', { headers: { 'Cache-Control': `max-age=${seconds}` } }))
}
// --- 返すもの ---
const noStore = { 'Cache-Control': 'no-store', 'Retry-After': '10' }
export function wakingJson() {
  return new Response(JSON.stringify({ error: { code: 'SERVER_WAKING', message: 'サーバーを起動しています。1〜3分お待ちください' } }), {
    status: 503, headers: { ...noStore, 'Content-Type': 'application/json; charset=utf-8' }
  })
}
export function wakingPage() {
  return new Response(WAKING_HTML, { status: 503, headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } })
}
const WAKING_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>起動しています｜RPG学習アプリ</title>
<style>
:root{color-scheme:light dark;--bg:#f5f7ff;--fg:#1a1a1c;--sub:#626264;--ac:#0017c1}
@media (prefers-color-scheme:dark){:root{--bg:#10131f;--fg:#f1f1f4;--sub:#a5a7b0;--ac:#9db7ff}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:"Noto Sans JP",system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 12px;color:var(--ac)}
p{margin:0 0 8px;color:var(--sub);line-height:1.7}
.dots{display:inline-flex;gap:6px;margin:16px 0}.dots i{width:10px;height:10px;border-radius:50%;background:var(--ac);animation:b 1.2s infinite ease-in-out}
.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}
@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
#msg{font-size:14px}
</style></head><body><main>
<h1>ギルドの扉を開けています…</h1>
<p>しばらく使われていなかったため、サーバーを起動しています。</p>
<p>1〜3分で自動で画面が開きます。このままお待ちください。</p>
<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
<p id="msg" role="status"></p>
</main><script>
(async () => {
  const msg = document.getElementById('msg')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  try { await fetch('/__wake', { method: 'POST' }) } catch {}
  const start = Date.now()
  while (Date.now() - start < 6 * 60 * 1000) {
    await sleep(5000)
    try {
      const r = await fetch('/api/health', { cache: 'no-store' })
      if (r.ok) { location.reload(); return }
    } catch {}
    msg.textContent = '起動してから ' + Math.round((Date.now() - start) / 1000) + ' 秒'
  }
  msg.textContent = '時間がかかっています。少したってから開き直してください。'
})()
</script></body></html>`
// 本体のドメイン（CANONICAL_HOST）でなければ、そこへ移す Response。本体なら null
export function canonicalRedirect(url, env) {
  const host = env.CANONICAL_HOST
  if (!host || url.hostname === host) return null
  return new Response(null, { status: 301, headers: { Location: `https://${host}${url.pathname}${url.search}`, 'Cache-Control': 'max-age=3600' } })
}
// --- 入口 ---
export async function handle(request, env, { fetchFn = fetch, cache = caches.default, waitUntil = () => {} } = {}) {
  const url = new URL(request.url)
  // 証明書の更新（Let's Encrypt）はそのまま渡す。起こさない
  if (url.pathname.startsWith('/.well-known/acme-challenge/')) return fetchFn(request)
  if (url.pathname.startsWith('/__wake-state/')) return new Response(null, { status: 404 })
  // www・前の rpg-dev などは、サーバーを通さずに本体（CANONICAL_HOST）へ 301 で移す（サーバーが止まっていても移せる）
  const canonical = canonicalRedirect(url, env)
  if (canonical) return canonical
  const wake = shouldWake(request)
  if (url.pathname === '/__wake') {
    if (wake) waitUntil(tryWake(env, fetchFn, cache, url.origin))
    return new Response(null, { status: 204, headers: noStore })
  }
  if (!(await flagged(cache, stateUrl(url.origin)))) {
    let res = null
    try {
      res = await fetchFn(request, { signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS) })
    } catch {
      // つながらない・時間切れ
    }
    if (res && !isUnreachable(res)) return res
    waitUntil(flag(cache, stateUrl(url.origin), DOWN_SECONDS))
  }
  if (wake) waitUntil(tryWake(env, fetchFn, cache, url.origin))
  if (url.pathname.startsWith('/api/')) return wakingJson()
  const accept = request.headers.get('accept') ?? ''
  if (request.method === 'GET' && (accept.includes('text/html') || accept === '' || accept.includes('*/*'))) return wakingPage()
  return new Response('starting', { status: 503, headers: noStore })
}
async function tryWake(env, fetchFn, cache, origin) {
  if (await flagged(cache, wokeUrl(origin))) return
  try {
    const r = await powerOn(env, fetchFn)
    console.log(JSON.stringify({ msg: 'wake', result: r }))
    await flag(cache, wokeUrl(origin), WAKE_SECONDS)
  } catch (err) {
    console.log(JSON.stringify({ msg: 'wake.error', err: String(err?.message ?? err) }))
  }
}
