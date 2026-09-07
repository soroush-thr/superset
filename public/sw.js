// Service worker. Registered only over http(s) -- see the guard in
// main.jsx -- so the file:// standalone build never touches this.
// See BUILD-PLAN.md section 10.

// Bump on every deploy; activate deletes any cache not in KEEP below.
const CACHE_VERSION = 1
const SHELL_CACHE = `superset-shell-v${CACHE_VERSION}`
const IMG_CACHE = 'superset-img-v1'
const IMG_CACHE_MAX_ENTRIES = 300
const KEEP = new Set([SHELL_CACHE, IMG_CACHE])

// The Vite build hashes JS/CSS filenames, so they can't be listed here
// ahead of time. Precache what's knowable at install; everything else
// (the hashed bundle) is cached the first time it's actually fetched, in
// the fetch handler below -- still cache-first after that first load.
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirstShell(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidateImage(request) {
  const cache = await caches.open(IMG_CACHE)
  const cached = await cache.match(request)

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone())
        await evictOldest(cache)
      }
      return response
    })
    .catch(() => cached)

  return cached || networkFetch
}

async function evictOldest(cache) {
  const keys = await cache.keys()
  const excess = keys.length - IMG_CACHE_MAX_ENTRIES
  if (excess <= 0) return
  // FIFO: Cache.keys() returns insertion order in every current
  // implementation, so the first N keys are the oldest entries.
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i])
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(staleWhileRevalidateImage(request))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstShell(request))
  }
})
