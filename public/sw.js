// Service worker. Registered only over http(s) -- see the guard in
// main.jsx -- so the file:// standalone build never touches this.
// See BUILD-PLAN.md section 10.

// CACHE_VERSION is rewritten by tools/gen-sw-version.js on every build (see
// package.json's build/build:standalone scripts) -- NOT hand-maintained.
// This file's bytes must differ on every deploy, or browsers never detect
// a service worker update at all (they byte-diff the installed sw.js
// against the one on the server) and a returning visitor is stuck forever
// on whatever shell was cached on their first visit. That exact bug
// shipped once already: two deploys in a row left CACHE_VERSION
// unchanged, so no update was ever detected, and the cached index.html
// kept referencing a hashed JS/CSS bundle that a later deploy deleted --
// white screen. Below, GEN:CACHE_VERSION is the literal token the
// generator replaces.
const CACHE_VERSION = 'GEN:CACHE_VERSION'
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

/**
 * Network-first for the HTML shell (the document itself, and the two
 * paths it's reachable at). This is deliberately NOT cache-first: the
 * shell is the one thing in this app whose content is not
 * content-hashed, so if the network is reachable it must always win --
 * otherwise a stale cached shell can reference a hashed JS/CSS file a
 * later deploy has since deleted, and there is no path back to working
 * except the user manually clearing site data. Falls back to cache only
 * when offline, which is the actual point of an app-shell cache.
 */
async function networkFirstShell(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

/**
 * Cache-first for everything else same-origin: the Vite-hashed JS/CSS
 * bundle, icons, manifest. These are safe to cache forever once fetched,
 * since a content hash in the filename means "this exact file never
 * changes" -- a new deploy ships new filenames instead.
 */
async function cacheFirstAsset(request) {
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

  if (url.origin !== self.location.origin) return

  // `navigate` mode is set by the browser for an actual page load (direct
  // hit, reload, back/forward) -- deliberately not path-matched, so this
  // works unchanged at whatever subpath the app is deployed to (base: './'
  // supports any repo path; this shouldn't assume one).
  event.respondWith(request.mode === 'navigate' ? networkFirstShell(request) : cacheFirstAsset(request))
})
