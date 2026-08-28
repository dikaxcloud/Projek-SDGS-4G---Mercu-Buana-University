const CACHE = 'desa-sehat-shell-v4'
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/logo.png', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Network-first with resilient fallbacks:
// - Online  -> always fresh content (and refresh cache).
// - Offline / asset missing (e.g. after a new deploy) -> serve from cache,
//   navigation falls back to cached '/' shell, last resort offline.html.
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok && request.mode === 'navigate') throw new Error('deploy swap')
        if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = await caches.match('/')
          if (shell) return shell
        }
        return caches.match('/offline.html')
      }),
  )
})
