import { NextRequest, NextResponse } from "next/server"
import { unpack } from "unpacker"
import { VIDEO_SOURCES, getSource } from "@/lib/vidsrc"
import {
  get2EmbedServers,
  searchArabicSite,
  extractDirectFromEmbed,
  getDownloadInfo,
  extractPackedJs,
} from "@/lib/video-extract"

// GET /api/extract-download?imdbId=tt0111161&type=movie&sourceId=2embed.cc&title=Inception&season=1&episode=1
//
// Finds downloadable video sources for a given title + provider.
//
// For ARABIC providers (EgyDead, etc.):
//   1. Searches the Arabic site by title (reuses /api/arabic-stream logic)
//   2. Extracts direct video URLs from each embed (MixDrop/VOE/StreamRuby)
//   3. Returns sources with type=mp4 or type=hls + correct referer
//
// For REGULAR providers (2Embed, vidsrc, etc.):
//   1. Fetches the embed page server-side
//   2. Tries to extract m3u8/mp4 URLs from the HTML using generic patterns
//   3. Returns whatever it finds (many providers obfuscate, so this may fail)
//
// The frontend uses the returned sources to build download links that point
// at /api/download?url=...&type=...&referer=...&filename=...

export type DownloadSource = {
  url: string
  type: "mp4" | "hls"
  host: string
  referer: string
  quality: string
  /** A suggested filename (without extension). */
  filename: string
  /** The embed page URL (for MixDrop/VOE/HGCloud). When present, the frontend
   *  should use /api/download?embed=... instead of /api/download?url=... to
   *  avoid token expiration (extraction + download happen atomically). */
  embedUrl?: string
  /** Which Arabic site this source was found on (e.g. "egydead", "shahid4u"). */
  arabicSite?: string
  /** File size in bytes (0 if unknown). Fetched by HEAD-ing the direct URL. */
  size?: number
  /** For HLS master playlists: which variant index to download (0=first, 1=second, etc.)
   *  When present, the download route picks this specific quality variant. */
  variantIndex?: number
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId") || ""
  const type = (url.searchParams.get("type") || "movie") as "movie" | "series"
  const sourceId = url.searchParams.get("sourceId") || "2embed.cc"
  const title = url.searchParams.get("title") || "video"
  const season = url.searchParams.get("season")
  const episode = url.searchParams.get("episode")

  const source = getSource(sourceId)
  const isArabic = source.region === "Arabic" && source.tier === 3
  const safeTitle = sanitizeFilename(title)

  try {
    if (isArabic) {
      // Search ALL Arabic sites AND 2Embed server mirrors in parallel.
      // This gives the user the maximum number of quality/server options.
      const [arabicSources, twoEmbedSources] = await Promise.all([
        extractFromAllArabicSites(title, type, safeTitle),
        extract2EmbedServers(imdbId, type, season, episode, safeTitle),
      ])
      const allSources = [...arabicSources, ...twoEmbedSources]
      if (allSources.length > 0) {
        return NextResponse.json({
          success: true,
          sources: allSources,
          provider: "Arabic + 2Embed Servers",
          providerId: source.id,
          fallbackUrl: null,
        })
      }
      // No Arabic sources found — fall through to regular extraction
    }

    // Regular provider: fetch embed page and extract direct URLs
    const embedUrl =
      type === "series"
        ? source.buildSeries(imdbId, parseInt(season || "1"), parseInt(episode || "1"))
        : source.buildMovie(imdbId)

    const sources = await extractFromEmbedPage(embedUrl, safeTitle)

    // Also fetch 2Embed's server mirrors using shared logic (no localhost fetch)
    let twoEmbedSources: DownloadSource[] = []
    try {
      twoEmbedSources = await extract2EmbedServers(imdbId, type, season, episode, safeTitle)
    } catch {}

    // Combine all sources: regular extraction + 2Embed server mirrors
    const allSources = [...sources, ...twoEmbedSources]

    return NextResponse.json({
      success: allSources.length > 0,
      sources: allSources,
      provider: source.name,
      providerId: source.id,
      embedUrl,
      fallbackUrl: embedUrl,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ success: false, error, sources: [] })
  }
}

// Fetch 2Embed's server mirrors (Xps→vidsrc.hair, Cnby→cineby.hair, Vcr→vidcore.net)
// and add them as download sources. Called in parallel with Arabic site search.
// Uses shared logic from @/lib/video-extract (no localhost fetch needed).
async function extract2EmbedServers(
  imdbId: string,
  type: "movie" | "series",
  season: string | null,
  episode: string | null,
  safeTitle: string
): Promise<DownloadSource[]> {
  try {
    const { servers, directServers } = await get2EmbedServers(imdbId, type, season, episode)
    const sources: DownloadSource[] = []
    // Add resolved server mirrors
    for (const srv of servers) {
      if (srv.host && srv.host !== "unknown" && srv.url) {
        sources.push({
          url: srv.url,
          type: "mp4",
          host: srv.host,
          referer: "https://www.2embed.cc/",
          quality: "720p",
          filename: safeTitle,
          embedUrl: srv.url,
        })
      }
    }
    // Add direct video host providers (vidsrc.hair, cineby.hair, vidcore.net)
    // Only add if not already in the servers list (deduplicate by host)
    const existingHosts = new Set(sources.map((s) => s.host))
    for (const srv of directServers) {
      if (srv.host && srv.url && !existingHosts.has(srv.host)) {
        sources.push({
          url: srv.url,
          type: "mp4",
          host: srv.host,
          referer: `https://${srv.host}/`,
          quality: "720p",
          filename: safeTitle,
          embedUrl: srv.url,
        })
      }
    }
    return sources
  } catch {
    return []
  }
}

// All working Arabic sites — searched in parallel to find ALL sources.
const ARABIC_SITES = ["egydead", "egybest", "shahid4u", "faselhd"]

// ─── Search ALL Arabic sites in parallel ────────────────────────────────────
//
// Each Arabic site (EgyDead, EgyBest, Shahid4u, FaselHD) indexes different
// video hosts (MixDrop, VOE, HGCloud, StreamRuby, Morencius, PlayMogo, etc.).
// By searching ALL sites in parallel, we find ALL available sources for a
// title, giving the user multiple quality/server options to download from.
async function extractFromAllArabicSites(
  title: string,
  type: "movie" | "series",
  safeTitle: string
): Promise<DownloadSource[]> {
  // Step 1: Search all Arabic sites in parallel using shared logic
  const searchPromises = ARABIC_SITES.map(async (siteId) => {
    try {
      const { sources: embedUrls } = await searchArabicSite(siteId, title, type)
      // Tag each source with the Arabic site it came from
      return embedUrls.map((s) => ({ ...s, arabicSite: siteId }))
    } catch {
      return []
    }
  })
  const searchResults = await Promise.all(searchPromises)

  // Combine all embed URLs from all sites
  const allEmbeds: { url: string; host: string; arabicSite: string }[] = []
  for (const results of searchResults) {
    allEmbeds.push(...results)
  }

  if (allEmbeds.length === 0) return []

  // Deduplicate by embed URL (same MixDrop/VOE embed may appear on multiple sites)
  const seen = new Set<string>()
  const uniqueEmbeds = allEmbeds.filter((e) => {
    if (seen.has(e.url)) return false
    seen.add(e.url)
    return true
  })

  // Step 2: Extract direct video URL from each unique embed (parallel)
  // Returns sources QUICKLY without file sizes — the frontend will live-fetch
  // sizes individually using /api/download-info (which extracts a fresh URL
  // and HEADs it atomically, avoiding token expiration).
  // For HLS, we parse the master playlist to find quality variants, but
  // we do NOT estimate sizes here (too slow, tokens expire). Instead, the
  // frontend fetches sizes lazily per-source.
  const resultArrays = await Promise.all(
    uniqueEmbeds.map(async (src) => {
      try {
        const extracted = await extractDirectFromEmbed(src.url, src.host)
        if (!extracted) return []
        const isHls = extracted.type === "hls" || extracted.url.includes(".m3u8")

        if (isHls) {
          // HLS: fetch the master playlist and parse quality variants
          const variants = await parseHlsVariants(extracted.url, extracted.referer)
          if (variants.length > 0) {
            // Create one source per quality variant (size fetched lazily by frontend)
            return variants.map((v) => ({
              url: extracted.url,
              type: "hls" as const,
              host: src.host,
              referer: extracted.referer,
              quality: v.quality,
              filename: safeTitle,
              embedUrl: src.url,
              arabicSite: src.arabicSite,
              size: 0, // Frontend will live-fetch this
              variantIndex: v.index,
            } as DownloadSource))
          }
          // Fallback: no variants found, single HLS source
          return [{
            url: extracted.url,
            type: "hls" as const,
            host: src.host,
            referer: extracted.referer,
            quality: getQualityForHost(src.host),
            filename: safeTitle,
            embedUrl: src.url,
            arabicSite: src.arabicSite,
            size: 0,
          } as DownloadSource]
        }

        // MP4: single source (size fetched lazily by frontend)
        return [{
          url: extracted.url,
          type: "mp4" as const,
          host: src.host,
          referer: extracted.referer,
          quality: getQualityForHost(src.host),
          filename: safeTitle,
          embedUrl: src.url,
          arabicSite: src.arabicSite,
          size: 0,
        } as DownloadSource]
      } catch {}
      return []
    })
  )

  return resultArrays.flat()
}

// Parse an HLS master playlist and return all quality variants.
// Each variant has: index, quality (e.g. "720p"). Does NOT estimate sizes
// (the frontend fetches sizes lazily per-source via /api/download-info).
async function parseHlsVariants(
  masterUrl: string,
  referer: string
): Promise<{ index: number; quality: string }[]> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
  }
  if (referer) headers["Referer"] = referer

  try {
    const res = await fetch(masterUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const playlist = await res.text()

    const variants: { index: number; quality: string }[] = []
    const lines = playlist.split("\n")
    let variantIdx = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        // Parse RESOLUTION from the attribute list
        const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/)
        let quality = "Auto"
        if (resMatch) {
          const height = parseInt(resMatch[2], 10)
          if (height >= 1080) quality = "1080p"
          else if (height >= 720) quality = "720p"
          else if (height >= 480) quality = "480p"
          else if (height >= 360) quality = "360p"
          else quality = `${height}p`
        }

        // Find the variant playlist URL on the next line
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim()
          if (next && !next.startsWith("#")) {
            variants.push({ index: variantIdx, quality })
            variantIdx++
            break
          }
        }
      }
    }

    // If only one variant (or none), no point in listing multiples
    if (variants.length <= 1) return []
    return variants
  } catch {
    return []
  }
}

// Estimate the total size of a specific HLS variant by fetching its playlist,
// sampling a few segments, and extrapolating.
async function estimateVariantSize(
  masterUrl: string,
  referer: string,
  variantIndex: number
): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
  }
  if (referer) headers["Referer"] = referer

  try {
    const res = await fetch(masterUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return 0
    const playlist = await res.text()
    const baseUrl = new URL(res.url || masterUrl)

    // Find the variant playlist URL at the given index
    const lines = playlist.split("\n")
    const variantUrls: string[] = []
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

    if (variantIndex >= variantUrls.length) return 0
    const variantUrl = variantUrls[variantIndex]

    // Fetch the variant playlist
    const varRes = await fetch(variantUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!varRes.ok) return 0
    const varPlaylist = await varRes.text()
    const varBaseUrl = new URL(varRes.url || variantUrl)

    // Parse segment URLs
    const segments: string[] = []
    for (const line of varPlaylist.split("\n")) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        try {
          segments.push(new URL(trimmed, varBaseUrl).href)
        } catch {}
      }
    }

    if (segments.length === 0) return 0

    // HEAD the first 3 segments to get average size
    const sampleSize = Math.min(segments.length, 3)
    let sampleTotal = 0
    for (let i = 0; i < sampleSize; i++) {
      try {
        const segRes = await fetch(segments[i], {
          method: "HEAD",
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(5000),
        })
        const len = segRes.headers.get("content-length")
        if (len) sampleTotal += parseInt(len, 10) || 0
      } catch {}
    }

    if (sampleTotal > 0 && sampleSize > 0) {
      return Math.round((sampleTotal / sampleSize) * segments.length)
    }
    return 0
  } catch {
    return 0
  }
}

// Fetch file size using shared logic (extracts a FRESH video URL and HEADs it
// atomically, avoiding token expiration). For HLS, samples segments.
async function getFileSizeViaEmbed(embedUrl: string, referer: string): Promise<number> {
  try {
    const info = await getDownloadInfo(embedUrl, referer)
    return info.size
  } catch {
    return 0
  }
}

// Quality labels based on the video host. These are typical maximum qualities
// each host serves — actual quality may vary per title.
function getQualityForHost(host: string): string {
  const h = host.toLowerCase()
  if (h.includes("voe")) return "1080p"
  if (h.includes("streamruby") || h.includes("stmruby")) return "720p"
  if (h.includes("hgcloud")) return "720p"
  if (h.includes("morencius")) return "720p"
  if (h.includes("playmogo")) return "720p"
  if (h.includes("mixdrop")) return "480p"
  if (h.includes("doodstream") || h.includes("dood")) return "480p"
  if (h.includes("streamtape") || h.includes("stape")) return "480p"
  if (h.includes("filemoon")) return "480p"
  if (h.includes("streamwish") || h.includes("vidplay")) return "480p"
  return "SD"
}

// NOTE: extractPackedJs and extractDirectFromEmbed are now imported from
// @/lib/video-extract — no duplicate definitions here.

// ─── Regular embed page extraction ─────────────────────────────────────────
//
// Fetches the provider's embed page and looks for direct m3u8/mp4 URLs.
// Many providers (2Embed, vidsrc) load the stream via JavaScript with
// encrypted/tokenized URLs, so this may not find anything. In that case,
// the frontend falls back to showing the embed URL for manual download.
async function extractFromEmbedPage(
  embedUrl: string,
  safeTitle: string
): Promise<DownloadSource[]> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }

  try {
    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const finalUrl = res.url || embedUrl
    const baseHost = new URL(finalUrl).hostname

    const sources: DownloadSource[] = []

    // Look for direct m3u8 URLs
    const m3u8Matches = html.matchAll(/https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi)
    const seen = new Set<string>()
    for (const m of m3u8Matches) {
      const u = m[0]
      if (seen.has(u)) continue
      seen.add(u)
      sources.push({
        url: u,
        type: "hls",
        host: baseHost,
        referer: finalUrl,
        quality: "Auto",
        filename: safeTitle,
      })
    }

    // Look for direct mp4 URLs
    const mp4Matches = html.matchAll(/https:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi)
    for (const m of mp4Matches) {
      const u = m[0]
      if (seen.has(u)) continue
      seen.add(u)
      sources.push({
        url: u,
        type: "mp4",
        host: baseHost,
        referer: finalUrl,
        quality: "Auto",
        filename: safeTitle,
      })
    }

    // Look for "file":"https://..." patterns (jwplayer / videojs setups)
    const fileMatches = html.matchAll(/['"]file['"]\s*:\s*['"](https?:\/\/[^'"]+)['"]/gi)
    for (const m of fileMatches) {
      const u = m[1]
      if (seen.has(u)) continue
      seen.add(u)
      const isHls = u.includes(".m3u8")
      sources.push({
        url: u,
        type: isHls ? "hls" : "mp4",
        host: baseHost,
        referer: finalUrl,
        quality: "Auto",
        filename: safeTitle,
      })
    }

    // Look for sources:[{file:"..."}] patterns
    const srcMatches = html.matchAll(/sources:\s*\[\{[^}]*file:\s*"(https?:\/\/[^"]+)"/gi)
    for (const m of srcMatches) {
      const u = m[1]
      if (seen.has(u)) continue
      seen.add(u)
      const isHls = u.includes(".m3u8")
      sources.push({
        url: u,
        type: isHls ? "hls" : "mp4",
        host: baseHost,
        referer: finalUrl,
        quality: "Auto",
        filename: safeTitle,
      })
    }

    // Deduplicate by URL (keep first occurrence)
    const byUrl = new Map<string, DownloadSource>()
    for (const s of sources) byUrl.set(s.url, s)
    return Array.from(byUrl.values()).slice(0, 5) // limit to 5 sources
  } catch {
    return []
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned || "video"
}
