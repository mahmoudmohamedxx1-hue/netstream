// Shared video extraction logic — used by API routes so they can call each
// other's logic directly (without HTTP fetch to localhost:3000, which fails
// in production where the server runs on a different port/domain).
//
// This module is imported by:
//   /api/2embed-servers/route.ts
//   /api/extract-download/route.ts

import { unpack } from "unpacker"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type ServerMirror = {
  name: string
  host: string
  url: string
}

// Extract the full eval(function(p,a,c,k,e,d)...) block by matching parentheses.
export function extractPackedJs(html: string): string | null {
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

// ─── 2Embed Server Mirrors ───────────────────────────────────────────────────
// Fetches 2Embed's embed page, parses the server dropdown, and resolves each
// server mirror to its actual video host URL.
export async function get2EmbedServers(
  imdbId: string,
  type: "movie" | "series",
  season: string | null,
  episode: string | null
): Promise<{ servers: ServerMirror[]; directServers: ServerMirror[] }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }

  try {
    const embedUrl =
      type === "series"
        ? `https://www.2embed.cc/embedtv/${imdbId}&s=${season || "1"}&e=${episode || "1"}`
        : `https://www.2embed.cc/embed/${imdbId}`

    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { servers: [], directServers: [] }
    const html = await res.text()

    // Parse server dropdown: <a onclick="go('url')"> &nbsp;ServerName</a>
    const servers: ServerMirror[] = []
    const serverPattern = /onclick=["']go\(["']([^"']+)["']\)["'][^>]*>(?:<i[^>]*><\/i>)?\s*&nbsp;([A-Za-z0-9]+)/gi
    let match
    while ((match = serverPattern.exec(html)) !== null) {
      servers.push({
        name: match[2],
        host: "2embed",
        url: match[1],
      })
    }

    // Resolve each server's JS redirect to find the actual video host
    const resolvedServers = await Promise.all(
      servers.map(async (srv) => {
        try {
          const srvRes = await fetch(srv.url, {
            headers: { ...headers, Referer: embedUrl },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          })
          if (!srvRes.ok) return { ...srv, host: "unknown" }
          const srvHtml = await srvRes.text()

          // Find the JS file (e.g., ./xps.js)
          const jsMatch = srvHtml.match(/src=["']\.\/([a-z\-]+\.js)["']/i)
          if (!jsMatch) return { ...srv, host: "unknown" }

          const jsUrl = new URL(`./${jsMatch[1]}`, srvRes.url).href
          const jsRes = await fetch(jsUrl, {
            headers: { ...headers, Referer: srvRes.url },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          })
          if (!jsRes.ok) return { ...srv, host: "unknown" }
          const jsText = await jsRes.text()

          // Extract video host URL pattern from JS
          const hostMatch = jsText.match(/attr\(['"]src['"],\s*["'](https:\/\/[^"']+)/i)
          if (!hostMatch) return { ...srv, host: "unknown" }

          const videoHostBase = hostMatch[1]
          const iframeSrcMatch = srvHtml.match(/id=["']framesrc["'][^>]*src=["']([^"']+)["']/i)
          const iframeSrc = iframeSrcMatch ? iframeSrcMatch[1] : ""
          const videoUrl = videoHostBase + iframeSrc

          let hostName = "unknown"
          try {
            hostName = new URL(videoHostBase).hostname.replace(/^www\./, "")
          } catch {}

          return { ...srv, host: hostName, url: videoUrl }
        } catch {
          return { ...srv, host: "unknown" }
        }
      })
    )

    // Build direct server URLs for the 3 video hosts
    const directServers: ServerMirror[] = [
      {
        name: "VidSrc.Hair",
        host: "vidsrc.hair",
        url:
          type === "series"
            ? `https://vidsrc.hair/embed/tv/${imdbId}/${season || "1"}/${episode || "1"}`
            : `https://vidsrc.hair/embed/movie/${imdbId}`,
      },
      {
        name: "VidCore",
        host: "vidcore.net",
        url:
          type === "series"
            ? `https://vidcore.net/tv/${imdbId}/${season || "1"}/${episode || "1"}`
            : `https://vidcore.net/movie/${imdbId}`,
      },
      {
        name: "Cineby",
        host: "cineby.hair",
        url:
          type === "series"
            ? `https://cineby.hair/tv/${imdbId}/${season || "1"}/${episode || "1"}?autostart=true`
            : `https://cineby.hair/movie/${imdbId}?autostart=true`,
      },
    ]

    return {
      servers: resolvedServers.filter((s) => s.host !== "unknown"),
      directServers,
    }
  } catch {
    return { servers: [], directServers: [] }
  }
}

// ─── Arabic Stream Search ────────────────────────────────────────────────────
// Searches an Arabic site (EgyDead, EgyBest, etc.) by title and returns
// embeddable video-host URLs (MixDrop, VOE, etc.).
// Replicates the EXACT logic from the ImZaw cloudstream-extensions-arabic repo
// and the /api/arabic-stream route.

type SiteConfig = {
  id: string
  name: string
  searchUrl: (title: string) => string
  linkPattern: RegExp
  postView: boolean
}

const ARABIC_SITE_CONFIGS: Record<string, SiteConfig> = {
  egydead: {
    id: "egydead",
    name: "EgyDead",
    searchUrl: (title) => `https://tv.egydead.live/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/[^"]+)"/gi,
    postView: true,
  },
  egybest: {
    id: "egybest",
    name: "EgyBest",
    searchUrl: (title) => `https://tv.egydead.live/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/[^"]+)"/gi,
    postView: true,
  },
  shahid4u: {
    id: "shahid4u",
    name: "Shahid4u",
    searchUrl: (title) => `https://shed4u.cam/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/shed4u\.cam\/[^"]+)"/gi,
    postView: false,
  },
  faselhd: {
    id: "faselhd",
    name: "FaselHD",
    searchUrl: (title) => `https://faselhd.club/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/faselhd\.club\/[^"]+)"/gi,
    postView: false,
  },
}

// Extract a human-readable host name from a URL
function getHost(url: string): string {
  try {
    const u = new URL(url)
    const hostMap: Record<string, string> = {
      "mixdrop.top": "MixDrop",
      "mixdrop.ag": "MixDrop",
      "mixdrop.bz": "MixDrop",
      "voe.sx": "VOE",
      "stmruby.com": "StreamRuby",
      "streamruby.com": "StreamRuby",
      "hgcloud.to": "HGCloud",
      "playmogo.com": "PlayMogo",
      "vidaraa.cc": "Vidaraa",
      "morencius.com": "Morencius",
      "bysekoze.com": "Bysekoze",
      "dood.so": "DoodStream",
      "doodstream.com": "DoodStream",
      "streamtape.com": "StreamTape",
      "filemoon.sx": "FileMoon",
      "streamwish.to": "StreamWish",
      "vidplay.site": "VidPlay",
    }
    const hostname = u.hostname.replace(/^www\./, "")
    return hostMap[hostname] ?? hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1)
  } catch {
    return "Unknown"
  }
}

export async function searchArabicSite(
  siteId: string,
  title: string,
  type: "movie" | "series"
): Promise<{ sources: { url: string; host: string }[]; movieUrl: string | null }> {
  const site = ARABIC_SITE_CONFIGS[siteId]
  if (!site) return { sources: [], movieUrl: null }

  const headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  }

  try {
    // Step 1: Search for the movie page URL
    const searchUrl = site.searchUrl(title)
    const searchRes = await fetch(searchUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    })
    if (!searchRes.ok) return { sources: [], movieUrl: null }
    const searchHtml = await searchRes.text()

    // Extract movie page links — filter out non-content URLs
    const matches: string[] = []
    let match: RegExpExecArray | null
    const pattern = new RegExp(site.linkPattern.source, "gi")
    while ((match = pattern.exec(searchHtml)) !== null) {
      const href = match[1]
      if (/wp-content|wp-json|wp-includes|xmlrpc|feed|css\/|js\/|font|\.png|\.jpg|\.ico|\/page\/|\/category\/|\/tag\/|\/author\//.test(href)) continue
      if (/\/assembly\/|\/series-category\/|\/type\//.test(href)) continue
      if (type === "movie" && /\/episode\//.test(href)) continue
      matches.push(href)
    }
    const unique = [...new Set(matches)]

    // Pick the best match
    const titleLower = title.toLowerCase().trim()
    const words = titleLower.split(/\s+/).filter(w => w.length > 2)
    const twoWords = words.slice(0, 2).join("-")
    const firstWord = words[0]
    const movieUrl =
      unique.find((u) => u.toLowerCase().includes(titleLower.replace(/\s+/g, "-"))) ??
      unique.find((u) => u.toLowerCase().includes(twoWords)) ??
      (firstWord ? unique.find((u) => u.toLowerCase().includes(firstWord)) : undefined) ??
      unique[0]

    if (!movieUrl) return { sources: [], movieUrl: null }

    // Step 2: Fetch the movie page (POST View=1 for EgyDead-style sites)
    let movieHtml: string
    if (site.postView) {
      const watchRes = await fetch(movieUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: "View=1",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    } else {
      const watchRes = await fetch(movieUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    }

    // Step 3: Extract embeddable iframe URLs from `data-link` attributes
    const sources: { url: string; host: string }[] = []
    const seen = new Set<string>()

    // Extract data-link attributes (the iframe embed URLs)
    const dataLinkPattern = /data-link="([^"]+)"/gi
    let dlMatch: RegExpExecArray | null
    while ((dlMatch = dataLinkPattern.exec(movieHtml)) !== null) {
      const embedUrl = dlMatch[1]
      if (!seen.has(embedUrl) && embedUrl.startsWith("http")) {
        seen.add(embedUrl)
        sources.push({ url: embedUrl, host: getHost(embedUrl) })
      }
    }

    // Also extract from .donwload-servers-list > li > a href (download links)
    const downloadPattern = /<li[^>]*class="[^"]*donwload[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"/gi
    let dlMatch2: RegExpExecArray | null
    while ((dlMatch2 = downloadPattern.exec(movieHtml)) !== null) {
      const dlUrl = dlMatch2[1]
      let embedUrl = dlUrl
      const m = dlUrl.match(/\/([a-z0-9]+)(\.html)?$/i)
      if (m && dlUrl.includes("streamruby.com")) {
        embedUrl = `https://streamruby.com/e/${m[1]}`
      }
      if (!seen.has(embedUrl) && embedUrl.startsWith("http")) {
        seen.add(embedUrl)
        sources.push({ url: embedUrl, host: getHost(embedUrl) })
      }
    }

    return { sources, movieUrl }
  } catch {
    return { sources: [], movieUrl: null }
  }
}

// ─── Direct Video Extraction from Embed Page ────────────────────────────────
// Fetches an embed page (MixDrop, Morencius, VOE, etc.), extracts the direct
// video URL (MP4 or HLS), and returns it.
export async function extractDirectFromEmbed(
  embedUrl: string,
  host: string
): Promise<{ url: string; type: "mp4" | "hls"; referer: string } | null> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://tv10.egydead.live/",
  }

  let html = ""
  let finalUrl = embedUrl
  try {
    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    html = await res.text()
    finalUrl = res.url || embedUrl
  } catch {
    return null
  }

  // Strategy 1: Packed JS (MixDrop, Morencius, etc.)
  const packedBlock = extractPackedJs(html)
  if (packedBlock) {
    try {
      const unpacked = unpack(packedBlock)

      // MixDrop: MDCore.wurl="..."
      const wurlMatch = unpacked.match(/MDCore\.wurl="(.*?)"/)
      if (wurlMatch) {
        let u = wurlMatch[1]
        if (u.startsWith("//")) u = "https:" + u
        if (!u.startsWith("http")) u = "https:" + u
        return {
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          referer: "https://mixdrop.ag",
        }
      }

      // file:"https://..." in unpacked JS
      const srcFileMatch = unpacked.match(/file:\s*["'](https?:\/\/[^"']+)["']/i)
      if (srcFileMatch) {
        const u = srcFileMatch[1]
        if (u.match(/\.(mp4|m3u8|ts)/i) || u.includes("master") || u.includes("hls")) {
          return {
            url: u,
            type: u.includes(".m3u8") ? "hls" : "mp4",
            referer: finalUrl,
          }
        }
      }

      // Any https://...mp4 or https://...m3u8 in unpacked JS
      const urlMatch = unpacked.match(/(https:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)/i)
      if (urlMatch) {
        const u = urlMatch[1]
        return {
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          referer: finalUrl,
        }
      }

      // "hls2":"https://..." (Morencius)
      const hlsMatch = unpacked.match(/["']hls\w*["']\s*:\s*["'](https:\/\/[^"']+)["']/i)
      if (hlsMatch) {
        const u = hlsMatch[1]
        return { url: u, type: "hls", referer: finalUrl }
      }
    } catch {}
  }

  // Strategy 2: VOE JS redirect + hls
  if (host === "VOE" || embedUrl.includes("voe.")) {
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
          return { url: hlsMatch[1], type: "hls", referer: "https://voe.sx" }
        }
        const m3u8Match = redHtml.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
        if (m3u8Match) {
          return { url: m3u8Match[0], type: "hls", referer: redirectMatch[1] }
        }
      } catch {}
    }
    const voeHls = html.match(/'hls': ?'(http.*?)'/)
    if (voeHls) {
      return { url: voeHls[1], type: "hls", referer: "https://voe.sx" }
    }
  }

  // Strategy 3: sources:[{file:"..."}]
  const srcMatch = html.match(/sources:\s*\[\{[^}]*file:\s*"(https:\/\/[^"]+)"/i)
  if (srcMatch) {
    const u = srcMatch[1]
    return {
      url: u,
      type: u.includes(".m3u8") ? "hls" : "mp4",
      referer: finalUrl,
    }
  }

  // Strategy 4: "file":"..."
  const fileMatch = html.match(/['"]file['"]\s*:\s*['"](https:\/\/[^'"]+)['"]/i)
  if (fileMatch) {
    const u = fileMatch[1]
    return {
      url: u,
      type: u.includes(".m3u8") ? "hls" : "mp4",
      referer: finalUrl,
    }
  }

  // Strategy 5: Generic m3u8
  const m3u8Match = html.match(/https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i)
  if (m3u8Match) {
    return { url: m3u8Match[0], type: "hls", referer: finalUrl }
  }

  // Strategy 6: Generic mp4
  const mp4Match = html.match(/https:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i)
  if (mp4Match) {
    return { url: mp4Match[0], type: "mp4", referer: finalUrl }
  }

  return null
}

// ─── File Size Fetching ─────────────────────────────────────────────────────
// Extracts a FRESH video URL from an embed page and HEADs it to get the file
// size. For HLS, estimates by sampling segments.
export async function getDownloadInfo(
  embedUrl: string,
  referer: string,
  variantIndex: number = -1
): Promise<{ success: boolean; videoUrl: string | null; videoType: "mp4" | "hls"; size: number }> {
  try {
    const extracted = await extractDirectFromEmbed(embedUrl, "")
    if (!extracted) {
      return { success: false, videoUrl: null, videoType: "mp4", size: 0 }
    }

    let size = 0
    // For MP4: HEAD the direct URL
    if (extracted.type === "mp4") {
      try {
        const sizeHeaders: Record<string, string> = {
          "User-Agent": UA,
          Accept: "*/*",
        }
        if (extracted.referer) sizeHeaders["Referer"] = extracted.referer
        const sizeRes = await fetch(extracted.url, {
          method: "HEAD",
          headers: sizeHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        })
        const len = sizeRes.headers.get("content-length")
        size = len ? parseInt(len, 10) || 0 : 0
      } catch {}
    }

    // For HLS (or if MP4 HEAD failed): estimate by sampling segments
    if (size === 0 && extracted.type === "hls") {
      size = await estimateHlsSize(extracted.url, extracted.referer, variantIndex)
    }

    return {
      success: true,
      videoUrl: extracted.url,
      videoType: extracted.type,
      size,
    }
  } catch {
    return { success: false, videoUrl: null, videoType: "mp4", size: 0 }
  }
}

// Estimate HLS total size by sampling segments
async function estimateHlsSize(
  m3u8Url: string,
  referer: string,
  variantIndex: number = -1
): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
  }
  if (referer) headers["Referer"] = referer

  try {
    const playlistRes = await fetch(m3u8Url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!playlistRes.ok) return 0
    let playlist = await playlistRes.text()
    let baseUrl = new URL(playlistRes.url || m3u8Url)

    // If master playlist, resolve to the requested variant
    if (playlist.includes("#EXT-X-STREAM-INF")) {
      const variantUrls: string[] = []
      const lines = playlist.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("#EXT-X-STREAM-INF")) {
          for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j].trim()
            if (next && !next.startsWith("#")) {
              try {
                variantUrls.push(new URL(next, baseUrl).href)
              } catch {}
              break
            }
          }
        }
      }
      const pickIdx = variantIndex >= 0 && variantIndex < variantUrls.length
        ? variantIndex
        : 0
      if (variantUrls.length > 0) {
        try {
          const variantRes = await fetch(variantUrls[pickIdx], {
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          })
          if (variantRes.ok) {
            playlist = await variantRes.text()
            baseUrl = new URL(variantRes.url || variantUrls[pickIdx])
          }
        } catch {}
      }
    }

    // Parse segment URLs
    const lines = playlist.split("\n")
    const segments: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        try {
          segments.push(new URL(trimmed, baseUrl).href)
        } catch {}
      }
    }

    if (segments.length === 0) return 0

    // HEAD 2 segments in PARALLEL for speed
    const sampleSize = Math.min(segments.length, 2)
    const sampleResults = await Promise.all(
      segments.slice(0, sampleSize).map(async (segUrl) => {
        try {
          const segRes = await fetch(segUrl, {
            method: "HEAD",
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(3000),
          })
          const len = segRes.headers.get("content-length")
          return len ? parseInt(len, 10) || 0 : 0
        } catch {
          return 0
        }
      })
    )
    let sampleTotal = 0
    let sampledCount = 0
    for (const s of sampleResults) {
      if (s > 0) {
        sampleTotal += s
        sampledCount++
      }
    }

    if (sampleTotal > 0 && sampledCount > 0) {
      return Math.round((sampleTotal / sampledCount) * segments.length)
    }
    return 0
  } catch {
    return 0
  }
}
