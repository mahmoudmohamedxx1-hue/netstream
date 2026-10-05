// NetStream Service Worker v2 — installable PWA + offline shell.
//
// v2 changes vs v1:
//   • `_next/static` is now NETWORK-FIRST (v1's cache-first served stale
//     chunks after every rebuild — broke hot reload and shipped old JS).
//   • Same-origin only. Non-GET skipped. `/api/*` always network (a stale
//     API response is worse than an error).
//   • Navigations get a branded offline fallback page instead of the
//     browser's error screen.
//   • Cache name bumped → old caches deleted on activate.

const CACHE_NAME = "netstream-v2"

// Precache: app shell entry + PWA metadata + icons (all immutable).
const PRECACHE = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE.map((u) => cache.add(u)))
    )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Branded offline page for failed navigations.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NetStream — Offline</title>
<style>
  html,body{margin:0;height:100%;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
  .logo{font-size:28px;font-weight:900;letter-spacing:-0.04em;color:#e50914}
  h1{font-size:20px;margin:0}
  p{margin:0;color:rgba(255,255,255,.55);font-size:14px;max-width:420px;line-height:1.6}
  button{margin-top:8px;background:#e50914;color:#fff;border:0;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{background:#c40d15}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">NETSTREAM</div>
  <h1>You're offline</h1>
  <p>This page needs a connection. Content you've already visited stays available — reconnect and try again.</p>
  <button onclick="location.reload()">Retry</button>
</div>
</body>
</html>`

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // cross-origin (providers, TMDB images): untouched

  // API: always network. No offline fallback — stale API data is worse.
  if (url.pathname.startsWith("/api/")) return

  // Immutable build assets & static files: cache-first for icons/manifest,
  // network-first for _next/static (rebuilds must win over cache).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  if (/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          return res
        })
      })
    )
    return
  }

  // Navigations: network-first, cache while online, branded offline page.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          return res
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              new Response(OFFLINE_HTML, {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
              })
          )
        )
    )
    return
  }

  // Everything else: plain network.
})
