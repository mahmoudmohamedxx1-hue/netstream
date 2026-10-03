import { NextRequest } from "next/server"

// GET /api/hls-proxy?url=<encoded>&referer=<encoded>&ua=<encoded>
//
// Server-side CORS-free proxy for HLS playlists, segments and AES keys.
// This is the critical missing piece that made browser downloads fail:
// fetching segments directly from provider CDNs with a custom Referer
// header triggers a CORS preflight that the CDNs reject. By routing every
// request through our own origin we sidestep CORS entirely.
//
// Playlists (.m3u8) are rewritten so that every segment / key / variant
// URL points back through this proxy — the browser can then fetch them
// with plain same-origin requests.

export const dynamic = "force-dynamic"
export const maxDuration = 60

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function contentTypeFor(url: string, extHint: string | null): string {
  if (extHint === "m3u8") return "application/vnd.apple.mpegurl"
  if (extHint === "key") return "application/octet-stream"
  const path = url.split("?")[0]
  if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl"
  if (path.endsWith(".ts")) return "video/mp2t"
  if (path.endsWith(".m4s") || path.endsWith(".mp4") || path.endsWith(".cmfm4s")) return "video/iso.segment"
  if (path.endsWith(".key") || path.endsWith(".pem")) return "application/octet-stream"
  if (path.endsWith(".mpd")) return "application/dash+xml"
  if (path.endsWith(".vtt")) return "text/vtt"
  return "application/octet-stream"
}

/** Build a same-origin proxy URL for an absolute upstream resource. */
function proxifyUrl(raw: string, base: URL, referer: string, ua: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return raw
  try {
    const abs = new URL(trimmed, base).href
    const p = new URLSearchParams()
    p.set("url", abs)
    if (referer) p.set("referer", referer)
    if (ua && ua !== DEFAULT_UA) p.set("ua", ua)
    return `/api/hls-proxy?${p.toString()}`
  } catch {
    return raw
  }
}

/** Rewrite an m3u8 playlist so every referenced URL goes through the proxy. */
function rewritePlaylist(playlist: string, baseUrl: string, referer: string, ua: string): string {
  const base = new URL(baseUrl)
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line

      if (trimmed.startsWith("#")) {
        // URI="..." attributes inside tags: keys, maps, renditions
        if (
          trimmed.includes('URI="') &&
          (trimmed.startsWith("#EXT-X-KEY") ||
            trimmed.startsWith("#EXT-X-MAP") ||
            trimmed.startsWith("#EXT-X-MEDIA") ||
            trimmed.startsWith("#EXT-X-I-FRAME-STREAM-INF") ||
            trimmed.startsWith("#EXT-X-SESSION-KEY"))
        ) {
          return trimmed.replace(/URI="([^"]+)"/, (_m, uri: string) =>
            `URI="${proxifyUrl(uri, base, referer, ua)}"`
          )
        }
        return line
      }

      // Plain URI lines: media segments or variant playlists
      return proxifyUrl(trimmed, base, referer, ua)
    })
    .join("\n")
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const target = searchParams.get("url")
  const referer = searchParams.get("referer") || ""
  const ua = searchParams.get("ua") || DEFAULT_UA
  const extHint = searchParams.get("ext")

  if (!target) return new Response("Missing url parameter", { status: 400 })

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return new Response("Invalid url parameter", { status: 400 })
  }
  if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
    return new Response("Unsupported protocol", { status: 400 })
  }

  // Default referer: the target's own origin (most CDNs accept this).
  const upstreamReferer = referer || `${targetUrl.protocol}//${targetUrl.host}/`

  try {
    const upstream = await fetch(targetUrl.href, {
      headers: {
        "User-Agent": ua,
        Referer: upstreamReferer,
        ...(referer ? { Origin: new URL(referer).origin } : {}),
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    })

    if (!upstream.ok) {
      return new Response(`Upstream ${upstream.status}`, {
        status: upstream.status === 403 ? 410 : 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      })
    }

    const finalUrl = upstream.url || targetUrl.href
    const respType = contentTypeFor(finalUrl, extHint)

    // Text path: playlists get rewritten so segment URLs point back to us
    if (respType === "application/vnd.apple.mpegurl") {
      const text = await upstream.text()
      if (text.includes("#EXTM3U")) {
        const rewritten = rewritePlaylist(text, finalUrl, upstreamReferer, ua)
        return new Response(rewritten, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        })
      }
      // Not actually a playlist — fall through as binary
    }

    // Binary path: stream segments / keys straight through
    const headers = new Headers()
    headers.set("Content-Type", respType)
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Cache-Control", "public, max-age=3600")
    const len = upstream.headers.get("content-length")
    if (len) headers.set("Content-Length", len)
    return new Response(upstream.body, { status: 200, headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy error"
    return new Response(`Proxy error: ${msg}`, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  }
}

// Pre-flight support so any client can use the proxy
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  })
}
