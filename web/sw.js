// Service Worker（詳細設計書 6.1）。キャッシュ名にリリース番号。画面の資材はキャッシュ優先、/api/* はキャッシュしない
const CACHE = 'rpg-shell-__RELEASE__'
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
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(event.request, { ignoreSearch: true })
    if (hit) return hit
    const res = await fetch(event.request)
    if (res.ok) cache.put(event.request, res.clone())
    return res
  })())
})
