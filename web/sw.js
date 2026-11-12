// Service Worker（詳細設計書 6.1）。キャッシュ名にリリース番号。画面を開くとき（ナビゲーション）は毎回サーバーに取りに行き、つながらなければ「お休み中」の案内を出す
// ほかの資材はキャッシュ優先（ないときは HTTP キャッシュを使わずに取る）、/api/* はキャッシュしない
const CACHE = 'rpg-shell-__RELEASE__'
// サーバーが止まっているときにキャッシュの画面を出すと、ログイン画面が出るのに何も反応しないように見える。そのため画面はキャッシュから出さない
// サーバーが止まっているときは、前にいる Cloudflare Worker（workers/wake）が起動中ページ（503）を返して起こすので、それをそのまま出す
// 通信そのものができない（Worker にも届かない）ときだけ、次の案内を返す
const OFFLINE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RPG学習アプリ（お休み中）</title>
<meta name="theme-color" content="#f5ecd9">
<style>
:root{color-scheme:light dark;--bg:#f5ecd9;--card:#fbf6ea;--line:#d6c6a5;--ink:#2e2219;--muted:#6b5843;--accent:#1d6763;--on-accent:#fbf6ea}
@media (prefers-color-scheme:dark){:root{--bg:#1c1712;--card:#27211a;--line:#3e352b;--ink:#f0e6d4;--muted:#bcab91;--accent:#6fc2b8;--on-accent:#14100c}}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--ink);font-family:"Noto Sans JP",system-ui,sans-serif;line-height:1.7}
main{max-width:420px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;box-sizing:border-box;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}
p{margin:0 0 16px;color:var(--muted)}
button{font:inherit;font-weight:700;padding:10px 24px;border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);cursor:pointer}
</style>
</head>
<body>
<main>
<h1>ギルドはいまお休み中です</h1>
<p>サーバーにつながらないため、画面を開けません。<br>通信の状態を確かめるか、時間をおいてから、もう一度開いてください。</p>
<button type="button" onclick="location.reload()">もう一度開く</button>
</main>
</body>
</html>`
const offline = () => new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('rpg-shell-') && key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (event.request.mode === 'navigate') {
    // 画面を開くときはキャッシュを使わない。サーバー（Worker）の応答は、起動中ページ（503）も含めてそのまま返す
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(offline))
    return
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(event.request, { ignoreSearch: true })
    if (hit) return hit
    // ブラウザの HTTP キャッシュ（1日）を使わず、サーバーに確かめて取る。使うと前の版のファイルを新しいキャッシュに入れてしまう
    const res = await fetch(event.request, { cache: 'no-cache' })
    if (res.ok) cache.put(event.request, res.clone())
    return res
  })())
})
