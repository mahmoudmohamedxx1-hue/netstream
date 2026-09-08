import { NextRequest, NextResponse } from "next/server"

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/stremio-stream?infoHash=...&fileIdx=0[&metadata=1][&download=1]
//
// Proxies to the torrent-stream mini-service (port 3031). The mini-service:
//   - Uses webtorrent in Node.js (TCP/UDP + uTP — NOT browser-limited WebRTC)
//   - Downloads the torrent and streams the video file over HTTP
//   - Supports Range requests for seeking
//   - Caches torrents in-memory (10 min inactivity timeout)
//
// Query params:
//   infoHash  — 40-char hex torrent info hash (required)
//   fileIdx   — file index in the torrent (default 0)
//   metadata  — if "1", return JSON metadata instead of streaming video
//   download  — if "1", return the file as an attachment (Content-Disposition)
//
// The Caddy gateway routes this to port 3031 via XTransformPort.
// ═══════════════════════════════════════════════════════════════════════════

const TORRENT_STREAM_PORT = 3031

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const infoHash = url.searchParams.get("infoHash")
  const fileIdx = url.searchParams.get("fileIdx") || "0"
  const metadata = url.searchParams.get("metadata") === "1"
  const download = url.searchParams.get("download") === "1"

  if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
    return NextResponse.json(
      { error: "Valid 40-char hex infoHash required" },
      { status: 400 }
    )
  }

  // Build the target URL on the torrent-stream service
  const path = metadata ? "/metadata" : download ? "/download" : "/stream"
  const targetUrl = `http://localhost:${TORRENT_STREAM_PORT}${path}?infoHash=${infoHash}&fileIdx=${fileIdx}`

  try {
    // Health-check the torrent service first (quick, 2s timeout).
    // If it's down, return a clear error immediately instead of waiting
    // for a connection-refused error.
    try {
      const healthRes = await fetch(`http://localhost:${TORRENT_STREAM_PORT}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (!healthRes.ok) {
        return NextResponse.json(
          { error: "Torrent streaming service is not responding. Try the magnet link or embed player." },
          { status: 503 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: "Torrent streaming service is offline. Use the magnet link below or try the embed player." },
        { status: 503 }
      )
    }

    // For metadata requests: fetch JSON and return it directly
    if (metadata) {
      const upstream = await fetch(targetUrl, {
        signal: AbortSignal.timeout(70000), // 70s — torrent discovery can take 60s
        headers: { "Accept": "application/json" },
      })
      const data = await upstream.json().catch(() => ({ error: "Invalid response from torrent service" }))
      return NextResponse.json(data, { status: upstream.status })
    }

    // For stream/download requests: proxy the response with Range support.
    // We forward the Range header so seeking works.
    const forwardHeaders: Record<string, string> = {
      "User-Agent": "NetStream-Proxy/1.0",
    }
    const range = req.headers.get("range")
    if (range) {
      forwardHeaders["Range"] = range
    }

    const upstream = await fetch(targetUrl, {
      signal: AbortSignal.timeout(300000), // 5 min for streaming
      headers: forwardHeaders,
    })

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => "")
      return NextResponse.json(
        { error: `Torrent service error: ${upstream.status} ${text.slice(0, 200)}` },
        { status: upstream.status }
      )
    }

    // Forward the response headers (Content-Type, Content-Length, Content-Range, Accept-Ranges)
    const responseHeaders = new Headers()
    for (const [key, value] of upstream.headers.entries()) {
      // Skip headers that Next.js will set itself
      if (!["transfer-encoding", "connection", "keep-alive", "content-encoding"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    }

    // Stream the body
    const body = upstream.body
    if (!body) {
      return NextResponse.json({ error: "No response body from torrent service" }, { status: 502 })
    }

    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (e: any) {
    const isTimeout = e?.name === "TimeoutError" || /timeout/i.test(e?.message || "")
    return NextResponse.json(
      {
        error: isTimeout
          ? "Torrent streaming timed out — the torrent may have no seeders reachable from the server. Try another quality or use the embed player."
          : `Torrent service unavailable: ${e.message}`,
      },
      { status: isTimeout ? 504 : 502 }
    )
  }
}
