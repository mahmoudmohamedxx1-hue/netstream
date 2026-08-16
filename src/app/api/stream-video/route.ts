import { NextRequest, NextResponse } from "next/server"
import { unpack } from "unpacker"

// GET /api/stream-video?embed=https://mixdrop.top/e/xxx&referer=https://tv10.egydead.live/
// OR: /api/stream-video?url=https://mxcontent.net/v2/xxx.mp4&referer=https://mixdrop.ag
//
// Two modes:
// 1. "embed" mode: Fetches the embed page, extracts the DIRECT video URL
//    (using the sussy-code/providers extractor logic), then immediately
//    streams the video with the correct Referer. This avoids token expiration
//    because extraction and streaming happen in the same request.
// 2. "url" mode: Directly proxies a video URL with the correct Referer.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("embed")
  const directUrl = url.searchParams.get("url")
  const referer = url.searchParams.get("referer") || ""

  // ─── Mode 1: Extract + Stream (embed mode) ────────────────────────────
  // This is the preferred mode for MixDrop — it extracts the video URL and
  // streams it in the same request, avoiding token expiration.
  if (embedUrl) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
      if (referer) headers["Referer"] = referer

      // Step 1: Fetch the embed page
      const embedRes = await fetch(embedUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      })
      const html = await embedRes.text()

      // Step 2: Extract the direct video URL
      let videoUrl: string | null = null
      let videoReferer = referer

      // MixDrop: unpack eval(p,a,c,k,e,d) → MDCore.wurl
      const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).*?\}\)\)/s)
      if (packedMatch) {
        try {
          const unpacked = unpack(packedMatch[0])
          const linkMatch = unpacked.match(/MDCore\.wurl="(.*?)"/)
          if (linkMatch) {
            let u = linkMatch[1]
            if (u.startsWith("//")) u = "https:" + u
            if (!u.startsWith("http")) u = "https:" + u
            videoUrl = u
            videoReferer = "https://mixdrop.ag"
          }
        } catch {}
      }

      // VOE: follow JS redirect, then find 'hls':'...'
      if (!videoUrl) {
        const redirectMatch = html.match(/window\.location\.href\s*=\s*['"](https:\/\/[^'"]+)['"]/)
        if (redirectMatch) {
          const redirectRes = await fetch(redirectMatch[1], {
            headers: { ...headers, Referer: embedUrl },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          })
          const redirectHtml = await redirectRes.text()
          const hlsMatch = redirectHtml.match(/'hls': ?'(http.*?)'/)
          if (hlsMatch) {
            videoUrl = hlsMatch[1]
            videoReferer = "https://voe.sx"
          }
          // Also try m3u8 pattern
          if (!videoUrl) {
            const m3u8Match = redirectHtml.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
            if (m3u8Match) {
              videoUrl = m3u8Match[0]
              videoReferer = redirectMatch[1]
            }
          }
        }
      }

      // Generic: look for m3u8 or mp4
      if (!videoUrl) {
        const m3u8Match = html.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
        if (m3u8Match) { videoUrl = m3u8Match[0]; videoReferer = referer }
      }
      if (!videoUrl) {
        const mp4Match = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/i)
        if (mp4Match) { videoUrl = mp4Match[0]; videoReferer = referer }
      }

      if (!videoUrl) {
        return new NextResponse("Could not extract video URL", { status: 404 })
      }

      // Step 3: Stream the video with the correct Referer
      return await streamVideo(videoUrl, videoReferer, req)
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error"
      return new NextResponse(`Extract+stream error: ${error}`, { status: 500 })
    }
  }

  // ─── Mode 2: Direct stream (url mode) ─────────────────────────────────
  if (directUrl) {
    return await streamVideo(directUrl, referer, req)
  }

  return new NextResponse("embed or url required", { status: 400 })
}

async function streamVideo(videoUrl: string, referer: string, req: NextRequest) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  // MixDrop's CDN requires a Range header — always use "bytes=0-"
  const isMixDrop = videoUrl.includes("mxcontent") || videoUrl.includes("mixdrop")
  const rangeHeader = req.headers.get("range")
  if (isMixDrop) {
    headers["Range"] = "bytes=0-"
  } else if (rangeHeader) {
    headers["Range"] = rangeHeader
  } else {
    headers["Range"] = "bytes=0-"
  }

  try {
    const res = await fetch(videoUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok && res.status !== 206) {
      return new NextResponse(`Upstream HTTP ${res.status}`, { status: res.status })
    }

    const responseHeaders = new Headers()
    res.headers.forEach((value, key) => {
      if (key.toLowerCase().match(/content-type|content-length|content-range|accept-ranges|cache-control/)) {
        responseHeaders.set(key, value)
      }
    })

    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Headers", "Range")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length")

    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Stream error: ${error}`, { status: 500 })
  }
}

