import { NextRequest, NextResponse } from "next/server"
import { unpack } from "unpacker"

// GET /api/extract-video?url=https://mixdrop.top/e/xxx&referer=https://tv10.egydead.live/
//
// Extracts the DIRECT video URL (.mp4 or .m3u8) from a video-host embed page.
// Uses the same logic as the sussy-code/providers extractors:
//
//   MixDrop: unpack eval(p,a,c,k,e,d) JS → extract MDCore.wurl → MP4 URL
//   VOE:     find 'hls': 'http...' regex → M3U8 URL
//   StreamRuby: find m3u8 URL in jwplayer setup
//
// The returned URL can be played directly in a <video> element with HLS.js.
// No iframe needed, no ads, no cross-origin issues.

type ExtractedVideo = {
  url: string
  type: "mp4" | "hls"
  headers?: Record<string, string>
}

async function fetchEmbedPage(url: string, referer: string): Promise<{ html: string; finalUrl: string }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  return { html, finalUrl: res.url || url }
}

function extractFromMixDrop(html: string): ExtractedVideo | null {
  // MixDrop uses eval(p,a,c,k,e,d) packed JavaScript
  // The sussy-code extractor unpacks it and finds MDCore.wurl="..."
  // Fix: use [\s\S] (matches any char including newlines) instead of the /s flag
  // to avoid TypeScript target compatibility issues.
  const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\)\)/)
  if (!packedMatch) return null

  try {
    const unpacked = unpack(packedMatch[0])
    const linkMatch = unpacked.match(/MDCore\.wurl="(.*?)"/)
    if (!linkMatch) return null

    let url = linkMatch[1]
    if (url.startsWith("//")) url = "https:" + url
    if (!url.startsWith("http")) url = "https:" + url

    return {
      url,
      type: "mp4",
      headers: { Referer: "https://mixdrop.ag" },
    }
  } catch {
    return null
  }
}

function extractFromVOE(html: string): ExtractedVideo | null {
  // VOE redirects via JS to a rotating domain, then the page contains:
  // 'hls': 'https://...' or source patterns with m3u8/mp4
  const hlsMatch = html.match(/'hls': ?'(http.*?)'/)
  if (hlsMatch) {
    return { url: hlsMatch[1], type: "hls", headers: { Referer: "https://voe.sx" } }
  }
  // Look for m3u8 in various patterns
  const m3u8Match = html.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
  if (m3u8Match) {
    return { url: m3u8Match[0], type: "hls", headers: { Referer: "https://voe.sx" } }
  }
  // Look for mp4
  const mp4Match = html.match(/"(https:\/\/[^"]+\.mp4[^"]*)"/)
  if (mp4Match) {
    return { url: mp4Match[1], type: "mp4", headers: { Referer: "https://voe.sx" } }
  }
  return null
}

// VOE redirects via JS: window.location.href = 'https://rotating-domain.com/e/...'
// We need to follow that redirect manually.
async function fetchVOEPage(url: string, referer: string): Promise<{ html: string; finalUrl: string }> {
  const { html: firstHtml, finalUrl: firstUrl } = await fetchEmbedPage(url, referer)
  // Check for JS redirect
  const redirectMatch = firstHtml.match(/window\.location\.href\s*=\s*['"](https:\/\/[^'"]+)['"]/)
  if (redirectMatch) {
    // Follow the JS redirect
    return fetchEmbedPage(redirectMatch[1], url)
  }
  return { html: firstHtml, finalUrl: firstUrl }
}

function extractFromStreamRuby(html: string): ExtractedVideo | null {
  // StreamRuby uses jwplayer with HLS
  // Look for m3u8 URL patterns in the HTML
  const m3u8Match = html.match(/https:\/\/[^"'\s]+\/hls[^"'\s]*\.m3u8[^"'\s]*/i)
  if (m3u8Match) {
    return { url: m3u8Match[0], type: "hls" }
  }
  // Look for 'file' patterns in jwplayer setup
  const fileMatch = html.match(/file['"]\s*:\s*['"](https:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)
  if (fileMatch) {
    return { url: fileMatch[1], type: "hls" }
  }
  return null
}

function extractFromHGCloud(html: string): ExtractedVideo | null {
  // HGCloud uses sources:[{file:"..."}]
  const match = html.match(/sources:\s*\[\{[^}]*file:\s*"(https:\/\/[^"]+)"/i)
  if (match) {
    const url = match[1]
    return { url, type: url.includes(".m3u8") ? "hls" : "mp4" }
  }
  return null
}

function extractGeneric(html: string): ExtractedVideo | null {
  // Generic fallback: look for any m3u8 or mp4 URL
  const m3u8Match = html.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
  if (m3u8Match) return { url: m3u8Match[0], type: "hls" }

  const mp4Match = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/i)
  if (mp4Match) return { url: mp4Match[0], type: "mp4" }

  // Look for file:"..." patterns
  const fileMatch = html.match(/file['"]\s*:\s*['"](https:\/\/[^'"]+)['"]/i)
  if (fileMatch) {
    const url = fileMatch[1]
    return { url, type: url.includes(".m3u8") ? "hls" : "mp4" }
  }
  return null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("url")
  const referer = url.searchParams.get("referer") || ""

  if (!embedUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 })
  }

  try {
    // For VOE, follow JS redirects first
    const isVOE = embedUrl.includes("voe.")
    const { html, finalUrl } = isVOE
      ? await fetchVOEPage(embedUrl, referer)
      : await fetchEmbedPage(embedUrl, referer)

    // Determine the host from the original URL (not the redirected one)
    const hostname = new URL(embedUrl).hostname.replace(/^www\./, "")

    let video: ExtractedVideo | null = null

    // Try host-specific extractors first
    if (hostname.includes("mixdrop")) {
      video = extractFromMixDrop(html)
    } else if (hostname.includes("voe.")) {
      video = extractFromVOE(html)
    } else if (hostname.includes("stmruby") || hostname.includes("streamruby")) {
      video = extractFromStreamRuby(html)
    } else if (hostname.includes("hgcloud")) {
      video = extractFromHGCloud(html)
    }

    // Fallback to generic extraction
    if (!video) {
      video = extractGeneric(html)
    }

    // If still no video, try all extractors
    if (!video) {
      video = extractFromMixDrop(html) || extractFromVOE(html) || extractFromStreamRuby(html) || extractFromHGCloud(html)
    }

    return NextResponse.json({
      success: !!video,
      videoUrl: video?.url ?? null,
      videoType: video?.type ?? null,
      headers: video?.headers ?? {},
      host: hostname,
      embedUrl: finalUrl,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ success: false, error, videoUrl: null })
  }
}
