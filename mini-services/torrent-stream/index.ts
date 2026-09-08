// ═══════════════════════════════════════════════════════════════════════════
// torrent-stream — Server-side torrent streaming bridge.
//
// Browser-based WebTorrent can ONLY connect to WebRTC peers. Most seeders use
// TCP/UDP, so in-browser streaming never finds peers. This service runs
// webtorrent in Node.js (which CAN use TCP/UDP + uTP) and serves the video
// file over HTTP so the browser can play it in a native <video> element.
//
// Endpoints:
//   GET /metadata?infoHash=...&fileIdx=0
//     → { name, length, mimeType, ready, numPeers, downloaded, downloadedPct }
//   GET /stream?infoHash=...&fileIdx=0   (supports Range requests for seeking)
//     → video bytes (200 or 206 Partial Content)
//   GET /download?infoHash=...&fileIdx=0
//     → full file as attachment (Content-Disposition: attachment)
//   GET /health
//     → { ok: true, torrents: N }
//
// Torrents are cached in-memory: the first request for an infoHash starts
// downloading; subsequent requests reuse the same torrent (so seeking to an
// undownloaded range triggers prioritized fetch of that range). Torrents are
// destroyed after 10 minutes of inactivity to free memory.
// ═══════════════════════════════════════════════════════════════════════════

import { createServer, IncomingMessage, ServerResponse } from "http"
import { URL } from "url"
import { existsSync } from "fs"

// ── Dynamic import of webtorrent (ESM/CJS interop) ────────────────────────
let WebTorrent: any = null
async function loadWebTorrent() {
  if (WebTorrent) return WebTorrent
  try {
    const mod = await import("webtorrent")
    WebTorrent = mod.default || mod
    return WebTorrent
  } catch (e: any) {
    console.error("[torrent-stream] Failed to load webtorrent:", e.message)
    throw e
  }
}

// ── Global error handlers — prevent the service from crashing on native ──
// module errors (node-datachannel can throw uncaught exceptions).
process.on("uncaughtException", (err) => {
  console.error("[torrent-stream] UNCAUGHT EXCEPTION (non-fatal):", err.message)
  // Don't exit — keep the service running. The failed torrent request will
  // just time out on the client side.
})
process.on("unhandledRejection", (err: any) => {
  console.error("[torrent-stream] UNHANDLED REJECTION (non-fatal):", err?.message || err)
})

const PORT = 3031

// ── Torrent cache: infoHash → { torrent, lastAccess, fileIdx } ────────────
const torrents = new Map<string, { torrent: any; lastAccess: number; fileIdx: number }>()
const INACTIVITY_TIMEOUT = 10 * 60 * 1000 // 10 minutes

// ── MIME types for common video extensions ─────────────────────────────────
function getMimeType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || ""
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    ts: "video/mp2t",
    m3u8: "application/vnd.apple.mpegurl",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
  }
  return map[ext] || "application/octet-stream"
}

// ── Find the video file in a torrent ───────────────────────────────────────
function findVideoFile(torrent: any, fileIdx: number): any {
  if (fileIdx >= 0 && torrent.files[fileIdx]) {
    return torrent.files[fileIdx]
  }
  // Auto-detect: largest file with a video extension
  const videoExts = [".mp4", ".m4v", ".mkv", ".webm", ".avi", ".mov", ".ts"]
  const videoFiles = torrent.files.filter((f: any) =>
    videoExts.some((ext) => f.name.toLowerCase().endsWith(ext))
  )
  if (videoFiles.length > 0) {
    return videoFiles.reduce((a: any, b: any) => (a.length > b.length ? a : b))
  }
  // Fallback: largest file overall
  return torrent.files.reduce((a: any, b: any) => (a.length > b.length ? a : b))
}

// ── Get or create a torrent for an infoHash ────────────────────────────────
async function getTorrent(infoHash: string, fileIdx: number): Promise<any> {
  const key = `${infoHash}:${fileIdx}`
  const cached = torrents.get(key)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.torrent
  }

  const WebTorrentClass = await loadWebTorrent()
  // Disable uTP (uses node-datachannel native module which crashes Bun and
  // isn't needed for our use case) and DHT (uses UDP which is blocked in
  // many sandboxes/cloud environments). Rely on WebSocket trackers + WebRTC
  // peers instead — these work over TCP 443 which is universally allowed.
  const client = new WebTorrentClass({
    utp: false,
    dht: false,
    tracker: {
      rtcConfig: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      },
    },
  })

  // Build magnet with WebSocket trackers only (UDP trackers won't work
  // without UDP connectivity; HTTPS trackers often have CORS issues).
  const trackers = [
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.btorrent.xyz",
    "wss://tracker.webtorrent.dev",
    "wss://tracker.nicetracker.xyz:443/announce",
  ]
  const trackerParam = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("")
  const magnetUri = `magnet:?xt=urn:btih:${infoHash}${trackerParam}`

  console.log(`[torrent-stream] Adding ${infoHash} (fileIdx=${fileIdx})…`)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { client.destroy() } catch {}
      reject(new Error("Timed out waiting for torrent metadata (60s). No seeders reachable."))
    }, 60000)

    client.add(magnetUri, (torrent: any) => {
      clearTimeout(timeout)
      console.log(`[torrent-stream] Got metadata for ${infoHash}: ${torrent.files.length} files`)

      // Deselect all files, then select only the target video file
      // (so we don't download the whole torrent, just the video)
      torrent.files.forEach((f: any, i: number) => f.deselect())
      const targetFile = findVideoFile(torrent, fileIdx)
      if (targetFile) {
        targetFile.select()
      }

      // Cache it
      torrents.set(key, { torrent, lastAccess: Date.now(), fileIdx })
      // Also keep a client reference on the torrent so we can destroy it
      torrent._client = client

      resolve(torrent)
    })

    client.on("error", (err: any) => {
      clearTimeout(timeout)
      console.error(`[torrent-stream] Client error for ${infoHash}:`, err.message)
      reject(err)
    })
  })
}

// ── Inactivity cleanup: destroy torrents not accessed for 10 min ───────────
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of torrents.entries()) {
    if (now - entry.lastAccess > INACTIVITY_TIMEOUT) {
      console.log(`[torrent-stream] Destroying inactive torrent: ${key}`)
      try {
        entry.torrent._client?.destroy()
      } catch {}
      torrents.delete(key)
    }
  }
}, 60 * 1000)

// ── CORS headers (allow the Next.js app to fetch from this service) ────────
function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type")
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
}

// ── HTTP request handler ───────────────────────────────────────────────────
async function handler(req: IncomingMessage, res: ServerResponse) {
  setCors(res)

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = new URL(req.url || "/", `http://localhost:${PORT}`)
  const pathname = parsedUrl.pathname
  const params = parsedUrl.searchParams

  // ── Health check ──────────────────────────────────────────────────────────
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, torrents: torrents.size, port: PORT }))
    return
  }

  // ── All other endpoints require infoHash ──────────────────────────────────
  const infoHash = params.get("infoHash")
  const fileIdx = parseInt(params.get("fileIdx") || "0", 10)

  if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
    res.writeHead(400, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Valid 40-char hex infoHash required" }))
    return
  }

  // ── Metadata endpoint ─────────────────────────────────────────────────────
  if (pathname === "/metadata") {
    try {
      const torrent = await getTorrent(infoHash, fileIdx)
      const file = findVideoFile(torrent, fileIdx)
      if (!file) {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "No video file found in torrent" }))
        return
      }
      const downloaded = torrent.downloaded || 0
      const downloadedPct = torrent.length ? Math.round((downloaded / torrent.length) * 100) : 0
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        name: file.name,
        length: file.length,
        mimeType: getMimeType(file.name),
        ready: true,
        numPeers: torrent.numPeers,
        downloaded,
        downloadedPct,
        torrentName: torrent.name,
      }))
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // ── Stream endpoint (supports Range requests for seeking) ─────────────────
  if (pathname === "/stream" || pathname === "/download") {
    try {
      const torrent = await getTorrent(infoHash, fileIdx)
      const file = findVideoFile(torrent, fileIdx)
      if (!file) {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "No video file found in torrent" }))
        return
      }

      const mimeType = getMimeType(file.name)
      const fileSize = file.length
      const isDownload = pathname === "/download"

      // Parse Range header for seeking
      const range = req.headers.range
      let start = 0
      let end = fileSize - 1

      if (range && !isDownload) {
        const match = /bytes=(\d*)-(\d*)/.exec(range)
        if (match) {
          start = match[1] ? parseInt(match[1], 10) : 0
          end = match[2] ? parseInt(match[2], 10) : fileSize - 1
          if (start > end || start >= fileSize) {
            res.writeHead(416, {
              "Content-Range": `bytes */${fileSize}`,
            })
            res.end()
            return
          }
          end = Math.min(end, fileSize - 1)
        }
      }

      const chunkSize = end - start + 1

      // Update last access time (keep torrent alive while streaming)
      const key = `${infoHash}:${fileIdx}`
      const cached = torrents.get(key)
      if (cached) cached.lastAccess = Date.now()

      // Prioritize the requested range for fast seeking
      if (!isDownload && torrent.select) {
        try {
          torrent.select(start, end, true)
        } catch {}
      }

      // Set headers
      const headers: Record<string, string | number> = {
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      }

      if (isDownload) {
        // Full file download
        headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(file.name)}"`
        headers["Content-Length"] = fileSize
        res.writeHead(200, headers)
      } else if (range) {
        // Partial content (seek)
        headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`
        headers["Content-Length"] = chunkSize
        res.writeHead(206, headers)
      } else {
        // Full stream (no range requested)
        headers["Content-Length"] = fileSize
        res.writeHead(200, headers)
      }

      // Stream the file from the torrent to the HTTP response
      // `file.createReadStream` returns a readable stream that fetches the
      // requested byte range from the torrent swarm (prioritizing it).
      const stream = file.createReadStream({ start, end })
      stream.on("error", (err: any) => {
        console.error(`[torrent-stream] Stream error for ${infoHash}:`, err.message)
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: err.message }))
        } else {
          try { res.destroy() } catch {}
        }
      })
      stream.on("end", () => {
        // Deselect the range when done to free bandwidth for other ranges
        if (!isDownload && torrent.deselect) {
          try { torrent.deselect(start, end, true) } catch {}
        }
      })
      stream.pipe(res)
    } catch (e: any) {
      console.error(`[torrent-stream] Error for ${infoHash}:`, e.message)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: e.message }))
      }
    }
    return
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Not found", path: pathname }))
}

// ── Start server ───────────────────────────────────────────────────────────
const server = createServer(handler)
server.listen(PORT, () => {
  console.log(`[torrent-stream] Listening on http://localhost:${PORT}`)
  console.log(`[torrent-stream] Endpoints:`)
  console.log(`  GET /metadata?infoHash=...&fileIdx=0`)
  console.log(`  GET /stream?infoHash=...&fileIdx=0   (supports Range for seeking)`)
  console.log(`  GET /download?infoHash=...&fileIdx=0 (full file download)`)
  console.log(`  GET /health`)
})

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on("SIGINT", () => {
  console.log("[torrent-stream] Shutting down…")
  for (const [, entry] of torrents.entries()) {
    try { entry.torrent._client?.destroy() } catch {}
  }
  process.exit(0)
})
