import { NextRequest, NextResponse } from "next/server"
import { unpack } from "unpacker"

// GET /api/download?url=<video-url>&referer=<referer>&filename=Movie.mp4&type=mp4|hls
// GET /api/download?embed=<embed-url>&referer=<referer>&filename=Movie.mp4
//
// Built-in video downloader — NO browser extension required.
//
// Three modes:
// 1. "embed" mode: Fetches the embed page, extracts the DIRECT video URL
//    (MixDrop unpack, VOE hls, HGCloud sources, generic m3u8/mp4), then
//    immediately downloads it — all in ONE request. This avoids token
//    expiration because extraction and download happen atomically.
//
// 2. "mp4" mode: Proxies a direct MP4 URL with Content-Disposition: attachment
//    so the browser downloads it natively with a progress bar.
//
// 3. "hls" mode: Fetches the .m3u8 playlist, resolves all .ts segment URLs,
//    and streams them concatenated as a single MPEG-TS file download.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Extract the full eval(function(p,a,c,k,e,d)...) block by matching parentheses.
function extractPackedJs(html: string): string | null {
  const start = html.indexOf("eval(function(p,a,c,k,e,d)")
  if (start === -1) return null
  let depth = 0
  for (let i = start + 4; i < html.length; i++) {
    if (html[i] === "(") depth++
    if (html[i] === ")") {
      depth--
      if (depth === 0) return html.substring(start, i + 1)
    }
  }
  return null
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
  return cleaned || "video"
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("embed")
  const videoUrl = url.searchParams.get("url")
  const referer = url.searchParams.get("referer") || ""
  const rawFilename = sanitizeFilename(url.searchParams.get("filename") || "video")
  const type = (url.searchParams.get("type") || "mp4").toLowerCase()
  // For HLS master playlists: which variant index to download (0=first/best)
  const variantParam = url.searchParams.get("variant")
  const variantIndex = variantParam !== null ? parseInt(variantParam, 10) : -1

  // ─── Mode 0: Embed mode (extract + download in one request) ────────────
  // This is the preferred mode for MixDrop/VOE/HGCloud — it extracts the
  // direct video URL and immediately downloads it, avoiding token expiration.
  if (embedUrl) {
    return downloadFromEmbed(embedUrl, referer, rawFilename, req, variantIndex)
  }

  if (!videoUrl) {
    return new NextResponse("url or embed required", { status: 400 })
  }

  // Build the final filename with the correct extension (avoid double extensions)
  const hasExt = /\.(mp4|ts|m3u8|webm|mkv)$/i.test(rawFilename)
  const filename =
    type === "hls" || videoUrl.includes(".m3u8")
      ? hasExt
        ? rawFilename.replace(/\.(mp4|webm|mkv)$/i, ".ts")
        : rawFilename + ".ts"
      : hasExt
        ? rawFilename
        : rawFilename + ".mp4"

  // ─── Mode 1: Direct MP4 download ───────────────────────────────────────
  if (type === "mp4" || videoUrl.includes(".mp4")) {
    return downloadDirect(videoUrl, referer, filename, req)
  }

  // ─── Mode 2: HLS (.m3u8) → concatenated .ts download ───────────────────
  if (type === "hls" || videoUrl.includes(".m3u8")) {
    return downloadHls(videoUrl, referer, filename, req)
  }

  // Fallback: treat as direct download
  return downloadDirect(videoUrl, referer, filename, req)
}

// ─── Embed mode: extract + download in one request ─────────────────────────
async function downloadFromEmbed(
  embedUrl: string,
  referer: string,
  rawFilename: string,
  req: NextRequest,
  variantIndex: number = -1
) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  try {
    // Step 1: Fetch the embed page
    const embedRes = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    const html = await embedRes.text()
    const finalEmbedUrl = embedRes.url || embedUrl

    // Step 2: Extract the direct video URL using multiple strategies
    let videoUrl: string | null = null
    let videoReferer = referer
    let videoType: "mp4" | "hls" = "mp4"

    // Strategy 1: Packed JS (MixDrop, Morencius, etc.)
    // After unpacking, look for video URLs in multiple patterns.
    const packedBlock = extractPackedJs(html)
    if (packedBlock) {
      try {
        const unpacked = unpack(packedBlock)

        // 1a. MixDrop: MDCore.wurl="..."
        const wurlMatch = unpacked.match(/MDCore\.wurl="(.*?)"/)
        if (wurlMatch) {
          let u = wurlMatch[1]
          if (u.startsWith("//")) u = "https:" + u
          if (!u.startsWith("http")) u = "https:" + u
          videoUrl = u
          videoReferer = "https://mixdrop.ag"
          videoType = u.includes(".m3u8") ? "hls" : "mp4"
        }

        // 1b. Generic: file:"https://..." in unpacked JS (video.js sources)
        if (!videoUrl) {
          const srcFileMatch = unpacked.match(/file:\s*["'](https?:\/\/[^"']+)["']/i)
          if (srcFileMatch) {
            const u = srcFileMatch[1]
            if (u.match(/\.(mp4|m3u8|ts)/i) || u.includes("master") || u.includes("hls")) {
              videoUrl = u
              videoReferer = finalEmbedUrl
              videoType = u.includes(".m3u8") ? "hls" : "mp4"
            }
          }
        }

        // 1c. Generic: any https://...mp4 or https://...m3u8 in unpacked JS
        if (!videoUrl) {
          const urlMatch = unpacked.match(/(https:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)/i)
          if (urlMatch) {
            videoUrl = urlMatch[1]
            videoReferer = finalEmbedUrl
            videoType = videoUrl.includes(".m3u8") ? "hls" : "mp4"
          }
        }

        // 1d. Morencius: "hls2":"https://...master.m3u8..." (key-value pairs)
        if (!videoUrl) {
          const hlsMatch = unpacked.match(/["']hls\w*["']\s*:\s*["'](https:\/\/[^"']+)["']/i)
          if (hlsMatch) {
            videoUrl = hlsMatch[1]
            videoReferer = finalEmbedUrl
            videoType = "hls"
          }
        }
      } catch {}
    }

    // Strategy 2: VOE JS redirect + hls
    if (!videoUrl && (embedUrl.includes("voe.") || embedUrl.includes("voe"))) {
      const redirectMatch = html.match(/window\.location\.href\s*=\s*['"](https:\/\/[^'"]+)['"]/)
      if (redirectMatch) {
        try {
          const redRes = await fetch(redirectMatch[1], {
            headers: { ...headers, Referer: embedUrl },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          })
          const redHtml = await redRes.text()
          const hlsMatch = redHtml.match(/'hls': ?'(http.*?)'/)
          if (hlsMatch) {
            videoUrl = hlsMatch[1]
            videoReferer = "https://voe.sx"
            videoType = "hls"
          }
          if (!videoUrl) {
            const m3u8Match = redHtml.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
            if (m3u8Match) {
              videoUrl = m3u8Match[0]
              videoReferer = redirectMatch[1]
              videoType = "hls"
            }
          }
        } catch {}
      }
    }

    // Strategy 3: sources:[{file:"..."}]
    if (!videoUrl) {
      const srcMatch = html.match(/sources:\s*\[\{[^}]*file:\s*"(https:\/\/[^"]+)"/i)
      if (srcMatch) {
        videoUrl = srcMatch[1]
        videoReferer = finalEmbedUrl
        videoType = videoUrl.includes(".m3u8") ? "hls" : "mp4"
      }
    }

    // Strategy 4: "file":"..."
    if (!videoUrl) {
      const fileMatch = html.match(/['"]file['"]\s*:\s*['"](https:\/\/[^'"]+)['"]/i)
      if (fileMatch) {
        videoUrl = fileMatch[1]
        videoReferer = finalEmbedUrl
        videoType = videoUrl.includes(".m3u8") ? "hls" : "mp4"
      }
    }

    // Strategy 5: Generic m3u8
    if (!videoUrl) {
      const m3u8Match = html.match(/https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i)
      if (m3u8Match) {
        videoUrl = m3u8Match[0]
        videoReferer = finalEmbedUrl
        videoType = "hls"
      }
    }

    // Strategy 6: Generic mp4
    if (!videoUrl) {
      const mp4Match = html.match(/https:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i)
      if (mp4Match) {
        videoUrl = mp4Match[0]
        videoReferer = finalEmbedUrl
        videoType = "mp4"
      }
    }

    if (!videoUrl) {
      return new NextResponse("Could not extract video URL from embed page", {
        status: 404,
      })
    }

    // Step 3: Build the filename and download the video immediately
    const hasExt = /\.(mp4|ts|m3u8|webm|mkv)$/i.test(rawFilename)
    const filename =
      videoType === "hls"
        ? hasExt
          ? rawFilename.replace(/\.(mp4|webm|mkv)$/i, ".ts")
          : rawFilename + ".ts"
        : hasExt
          ? rawFilename
          : rawFilename + ".mp4"

    if (videoType === "hls") {
      return downloadHls(videoUrl, videoReferer, filename, req, variantIndex)
    }
    return downloadDirect(videoUrl, videoReferer, filename, req)
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Embed download error: ${error}`, { status: 500 })
  }
}

// ─── Direct MP4 proxy download ─────────────────────────────────────────────
async function downloadDirect(
  videoUrl: string,
  referer: string,
  filename: string,
  req: NextRequest
) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  // Forward the Range header for resumable downloads
  const range = req.headers.get("range")
  if (range) headers["Range"] = range

  try {
    const res = await fetch(videoUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(300000), // 5 min timeout
    })

    if (!res.ok && res.status !== 206) {
      return new NextResponse(`Upstream HTTP ${res.status}`, { status: res.status })
    }

    const responseHeaders = new Headers()
    // Forward content-related headers so the browser shows correct size/progress
    res.headers.forEach((value, key) => {
      const lk = key.toLowerCase()
      if (
        lk.match(
          /content-type|content-length|content-range|accept-ranges|cache-control|etag|last-modified/
        )
      ) {
        responseHeaders.set(key, value)
      }
    })

    // Force the browser to download (not play inline)
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition")

    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Download error: ${error}`, { status: 500 })
  }
}

// ─── HLS (.m3u8) → concatenated .ts download ───────────────────────────────
//
// 1. Fetch the m3u8 playlist
// 2. If it's a master playlist (contains #EXT-X-STREAM-INF), pick the first
//    (usually highest quality) variant playlist and fetch that
// 3. Parse all segment URLs (#EXTINF followed by URL)
// 4. HEAD each segment to get its Content-Length, sum for total size
// 5. Stream all segments concatenated with Content-Disposition: attachment
async function downloadHls(
  m3u8Url: string,
  referer: string,
  filename: string,
  _req: NextRequest,
  variantIndex: number = -1
) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  try {
    // Step 1: Fetch the m3u8 playlist
    const playlistRes = await fetch(m3u8Url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!playlistRes.ok) {
      return new NextResponse(`m3u8 fetch HTTP ${playlistRes.status}`, {
        status: playlistRes.status,
      })
    }
    let playlist = await playlistRes.text()
    const playlistBaseUrl = new URL(playlistRes.url || m3u8Url)

    // Step 2: If master playlist, resolve to a variant playlist.
    // If variantIndex is specified (>= 0), pick that specific variant.
    // Otherwise, pick the first (usually highest quality) variant.
    if (playlist.includes("#EXT-X-STREAM-INF")) {
      const variantUrl = resolveVariantByIndex(playlist, playlistBaseUrl, variantIndex)
      if (variantUrl) {
        const variantRes = await fetch(variantUrl, {
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        })
        if (variantRes.ok) {
          playlist = await variantRes.text()
        }
      }
    }

    // Step 3: Parse segment URLs
    const segments = parseHlsSegments(playlist, playlistBaseUrl)
    if (segments.length === 0) {
      return new NextResponse("No segments found in m3u8", { status: 404 })
    }

    // Step 4: HEAD only the first few segments to estimate total size.
    // HEADing all segments sequentially would be very slow for long videos
    // (hundreds of segments × 5s timeout each = minutes of hanging).
    let totalSize = 0
    const sampleSize = Math.min(segments.length, 5)
    let sampleTotal = 0
    for (let i = 0; i < sampleSize; i++) {
      sampleTotal += await getSegmentSize(segments[i], headers)
    }
    if (sampleTotal > 0 && sampleSize > 0) {
      // Extrapolate: average segment size × total segments
      totalSize = Math.round((sampleTotal / sampleSize) * segments.length)
    }

    // Step 5: Stream all segments concatenated
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Stream segments asynchronously (don't block the response)
    ;(async () => {
      try {
        for (const segUrl of segments) {
          const segRes = await fetch(segUrl, {
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(60000),
          })
          if (!segRes.ok) continue
          const buf = await segRes.arrayBuffer()
          writer.write(new Uint8Array(buf))
        }
      } catch {
        // Best-effort — stop on error
      } finally {
        writer.close()
      }
    })()

    const responseHeaders = new Headers()
    responseHeaders.set("Content-Type", "video/mp2t")
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    if (totalSize > 0) {
      responseHeaders.set("Content-Length", String(totalSize))
    }
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition")
    responseHeaders.set("Cache-Control", "no-store")

    return new NextResponse(readable, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`HLS download error: ${error}`, { status: 500 })
  }
}

// Resolve a relative or absolute URL against a base URL
function resolveUrl(raw: string, base: URL): string {
  try {
    return new URL(raw, base).href
  } catch {
    return raw
  }
}

// Pick the first variant URL from a master playlist
function resolveFirstVariant(playlist: string, base: URL): string | null {
  const lines = playlist.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      // The next non-comment line is the variant URL
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next && !next.startsWith("#")) {
          return resolveUrl(next, base)
        }
      }
    }
  }
  return null
}

// Resolve a specific variant by index from a master playlist.
// variantIndex=0 → first variant, 1 → second, etc.
// variantIndex=-1 → first variant (default, usually highest quality)
function resolveVariantByIndex(
  playlist: string,
  base: URL,
  variantIndex: number
): string | null {
  const lines = playlist.split("\n")
  let currentIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      // The next non-comment line is the variant URL
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next && !next.startsWith("#")) {
          if (variantIndex < 0 || currentIndex === variantIndex) {
            return resolveUrl(next, base)
          }
          currentIndex++
          break
        }
      }
    }
  }
  // Fallback: if the requested index doesn't exist, return the first variant
  return resolveFirstVariant(playlist, base)
}

// Parse all segment URLs from a media playlist
function parseHlsSegments(playlist: string, base: URL): string[] {
  const lines = playlist.split("\n")
  const segments: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line && !line.startsWith("#")) {
      // This is a segment URL (preceded by #EXTINF)
      segments.push(resolveUrl(line, base))
    }
  }
  return segments
}

// HEAD a segment to get its Content-Length (returns 0 if unknown)
async function getSegmentSize(
  segUrl: string,
  headers: Record<string, string>
): Promise<number> {
  try {
    const res = await fetch(segUrl, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    })
    const len = res.headers.get("content-length")
    return len ? parseInt(len, 10) || 0 : 0
  } catch {
    return 0
  }
}
