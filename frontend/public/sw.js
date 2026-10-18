const CACHE = 'desa-sehat-shell-v8'
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/logo-76.webp', '/icon.svg']

// Precache shell tanpa skipWaiting agresif: biarkan SW lama tetap melayani
// sampai klien memutuskan aman (PwaUpdatePrompt -> SKIP_WAITING).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Hanya cache aset statis same-origin. Navigasi & API tidak disimpan permanen:
// - navigasi: network-first, fallback shell '/' lalu offline.html
// - aset (/assets/, logo, manifest, icon): cache-first ringan, revalidate background
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/offline.html' ||
    pathname === '/icon.svg' ||
    /^\/logo-\d+\.(webp|png)$/.test(pathname) ||
    pathname === '/boot.js'
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  // Jangan intercept callback OAuth Supabase (?code= / ?error=): PKCE harus via network.
  if (request.mode === 'navigate' && (url.searchParams.has('code') || url.searchParams.has('error'))) return

  // Navigasi: network-first, jangan simpan HTML privat ke cache persisten.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) throw new Error('deploy swap')
          return response
        })
        .catch(async () => {
          const shell = await caches.match('/')
          if (shell) return shell
          return caches.match('/offline.html')
        }),
    )
    return
  }

  if (!isStaticAsset(url.pathname)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached || caches.match('/offline.html'))
      return cached || network
    }),
  )
})
