// Shared server-side download source resolution.
// Used by /api/download-movie (metadata probe) and /api/download-file
// (full streaming download).

export type DownloadVariant = {
  url: string          // absolute media-playlist URL (unproxied, upstream)
  resolution: string   // e.g. "1920x1080"
  quality: string      // "1080p" | "720p" | ...
  bandwidth: string
  segmentCount: number
  estimatedBytes: number
  container: "fmp4" | "ts"
  aesKeyUrl: string | null
  aesIv: string | null
  mediaSequence: number
}

export type DownloadSource = {
  provider: string
  m3u8Url: string
  referer: string
  variants: DownloadVariant[]
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const PLAYER_KEY = "3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13"
export const DL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function tmdbFindId(imdbId: string): Promise<number | null> {
  // Synthetic TMDB ids (e.g. "tmdb-12345") — use the number directly
  if (imdbId.startsWith("tmdb-")) {
    const n = parseInt(imdbId.slice(5), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const res = await fetch(
    `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.movie_results?.[0]?.id || data.tv_results?.[0]?.id || null
}

function qualityFromResolution(res: string, bandwidth?: string): string {
  if (res.includes("1920") || res.includes("1080")) return "1080p"
  if (res.includes("1280") || res.includes("720")) return "720p"
  if (res.includes("854") || res.includes("480")) return "480p"
  if (res.includes("640")) return "480p"
  if (res.includes("3840") || res.includes("2160")) return "4K"
  if (bandwidth) {
    const bw = parseInt(bandwidth, 10)
    if (bw > 5_000_000) return "1080p"
    if (bw > 2_000_000) return "720p"
    if (bw > 800_000) return "480p"
    return "360p"
  }
  return "auto"
}

type ParsedMediaPlaylist = {
  segments: { url: string; byteLength?: number }[]
  aesKeyUrl: string | null
  aesIv: string | null
  mediaSequence: number
  mapUrl: string | null // fMP4 init segment
  totalDuration: number
}

export function parseMediaPlaylist(playlist: string, baseUrl: string): ParsedMediaPlaylist {
  const base = new URL(baseUrl)
  const out: ParsedMediaPlaylist = {
    segments: [],
    aesKeyUrl: null,
    aesIv: null,
    mediaSequence: 0,
    mapUrl: null,
    totalDuration: 0,
  }
  const lines = playlist.split("\n")
  let pendingDuration = 0
  let pendingByteLen: number | undefined

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith("#EXT-X-KEY")) {
      const uri = line.match(/URI="([^"]+)"/)?.[1]
      const iv = line.match(/IV=0x([0-9a-fA-F]+)/)?.[1]
      if (uri) out.aesKeyUrl = new URL(uri, base).href
      out.aesIv = iv || null
    } else if (line.startsWith("#EXT-X-MAP")) {
      const uri = line.match(/URI="([^"]+)"/)?.[1]
      if (uri) out.mapUrl = new URL(uri, base).href
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
      out.mediaSequence = parseInt(line.split(":")[1], 10) || 0
    } else if (line.startsWith("#EXTINF")) {
      pendingDuration = parseFloat(line.split(":")[1]) || 0
      out.totalDuration += pendingDuration
    } else if (line.startsWith("#EXT-X-BYTERANGE")) {
      pendingByteLen = parseInt(line.split(":")[1].split("@")[0], 10) || undefined
    } else if (!line.startsWith("#")) {
      try {
        out.segments.push({
          url: new URL(line, base).href,
          byteLength: pendingByteLen,
        })
      } catch {
        out.segments.push({ url: line, byteLength: pendingByteLen })
      }
      pendingDuration = 0
      pendingByteLen = undefined
    }
  }
  return out
}

/** HEAD (or ranged GET) a segment to estimate average bytes per segment. */
async function probeSegmentSize(url: string, referer: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": DL_UA, Referer: referer, Range: "bytes=0-0" },
      signal: AbortSignal.timeout(8000),
    })
    // Content-Range: bytes 0-0/123456  → total is after the slash
    const cr = res.headers.get("content-range")
    if (cr) {
      const total = parseInt(cr.split("/")[1], 10)
      if (total > 0) return total
    }
    const cl = res.headers.get("content-length")
    if (cl && parseInt(cl, 10) > 1) return parseInt(cl, 10)
    return null
  } catch {
    return null
  }
}

/**
 * Probe a media playlist and build a full variant descriptor.
 * segmentProbeCount: how many segments to HEAD for size estimation.
 */
export async function probeVariant(
  mediaUrl: string,
  referer: string,
  resolution: string,
  bandwidth: string,
  segmentProbeCount = 2
): Promise<DownloadVariant | null> {
  try {
    const res = await fetch(mediaUrl, {
      headers: { "User-Agent": DL_UA, Referer: referer },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text.includes("#EXTM3U")) return null
    const finalUrl = res.url || mediaUrl
    const parsed = parseMediaPlaylist(text, finalUrl)
    if (parsed.segments.length === 0) return null

    // Estimate size: probe up to N segments and average
    let estBytes: number | null = null
    if (parsed.segments.some((s) => s.byteLength)) {
      const withLen = parsed.segments.filter((s) => s.byteLength)
      estBytes = withLen.reduce((s, seg) => s + (seg.byteLength || 0), 0) *
        (parsed.segments.length / withLen.length)
    } else {
      const probeIdx = [0, Math.floor(parsed.segments.length / 2)]
        .slice(0, segmentProbeCount)
        .filter((i, n, a) => a.indexOf(i) === n)
      const sizes = (
        await Promise.all(probeIdx.map((i) => probeSegmentSize(parsed.segments[i].url, referer)))
      ).filter((n): n is number => n !== null && n > 10000)
      if (sizes.length) {
        estBytes = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length * parsed.segments.length)
      }
    }
    if (estBytes === null) {
      // Rough fallback: bandwidth × duration (bits/8 → bytes)
      const bw = parseInt(bandwidth, 10) || 2_000_000
      const dur = parsed.totalDuration || parsed.segments.length * 6
      estBytes = Math.round((bw / 8) * dur)
    }

    return {
      url: mediaUrl,
      resolution,
      quality: qualityFromResolution(resolution, bandwidth),
      bandwidth,
      segmentCount: parsed.segments.length,
      estimatedBytes: estBytes ?? 0,
      container: parsed.mapUrl ? "fmp4" : "ts",
      aesKeyUrl: parsed.aesKeyUrl,
      aesIv: parsed.aesIv,
      mediaSequence: parsed.mediaSequence,
    }
  } catch {
    return null
  }
}

/**
 * Resolve downloadable sources for a title via MoviesAPI's vidora API.
 * Returns the master m3u8 + fully probed variants.
 * Results are cached in-memory for 10 minutes (CDN tokens live ~12h) so
 * /api/download-movie and /api/download-file don't each re-probe.
 */
const sourceCache = new Map<string, { at: number; source: DownloadSource | null }>()
const SOURCE_CACHE_TTL = 10 * 60 * 1000

export async function resolveVidoraSource(
  imdbId: string,
  type: "movie" | "series",
  season: string,
  episode: string
): Promise<DownloadSource | null> {
  const key = `${imdbId}|${type}|${season}|${episode}`
  const hit = sourceCache.get(key)
  if (hit && Date.now() - hit.at < SOURCE_CACHE_TTL) return hit.source
  const resolved = await resolveVidoraSourceUncached(imdbId, type, season, episode)
  sourceCache.set(key, { at: Date.now(), source: resolved })
  if (sourceCache.size > 50) {
    // Trim the oldest entries
    const sorted = [...sourceCache.entries()].sort((a, b) => a[1].at - b[1].at)
    for (const [k] of sorted.slice(0, 25)) sourceCache.delete(k)
  }
  return resolved
}

async function resolveVidoraSourceUncached(
  imdbId: string,
  type: "movie" | "series",
  season: string,
  episode: string
): Promise<DownloadSource | null> {
  // Step 1: TMDB ID
  const tmdbId = await tmdbFindId(imdbId)
  if (!tmdbId) return null

  // Step 2: session cookie (best-effort — page may not exist for synthetic ids)
  let cookieStr = ""
  try {
    const pageRes = await fetch(`https://moviesapi.to/movie/${imdbId}`, {
      headers: { "User-Agent": DL_UA },
      signal: AbortSignal.timeout(10000),
    })
    const cookies = pageRes.headers.getSetCookie?.() || []
    cookieStr = cookies.map((c) => c.split(";")[0]).join("; ")
  } catch { /* cookies optional */ }

  // Step 3: vidora API
  const vidoraPath =
    type === "series" ? `/v1/tv/${tmdbId}/${season}/${episode}` : `/v1/movie/${tmdbId}`
  const vidoraRes = await fetch(`https://moviesapi.to/api/vidora${vidoraPath}`, {
    headers: {
      "x-player-key": PLAYER_KEY,
      "User-Agent": DL_UA,
      Referer: `https://moviesapi.to/movie/${imdbId}`,
      Cookie: cookieStr,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!vidoraRes.ok) return null
  const vidoraData = await vidoraRes.json()

  // Pick the best HLS source (prefer .m3u8)
  const sources: { url: string; quality?: string }[] = vidoraData?.sources || []
  const hls = sources.find((s) => s.url?.includes(".m3u8")) || sources[0]
  if (!hls?.url) return null

  const referer = "https://moviesapi.to/"

  // Step 4: fetch master playlist
  const m3u8Res = await fetch(hls.url, {
    headers: { "User-Agent": DL_UA, Referer: referer },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  })
  if (!m3u8Res.ok) return null
  const masterText = await m3u8Res.text()
  if (!masterText.includes("#EXTM3U")) return null
  const masterUrl = m3u8Res.url || hls.url

  // Parse variant stream entries
  const variantEntries: { url: string; resolution: string; bandwidth: string }[] = []
  const lines = masterText.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("#EXT-X-STREAM-INF")) {
      const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/)
      const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/)
      const next = lines[i + 1]?.trim()
      if (next && !next.startsWith("#")) {
        try {
          variantEntries.push({
            url: new URL(next, masterUrl).href,
            resolution: resMatch?.[1] || "unknown",
            bandwidth: bwMatch?.[1] || "unknown",
          })
        } catch { /* skip bad line */ }
      }
    }
  }

  // Master with variants → probe each (limited parallelism)
  let variants: DownloadVariant[] = []
  if (variantEntries.length > 0) {
    const probed = await Promise.all(
      variantEntries.slice(0, 6).map((v) => probeVariant(v.url, referer, v.resolution, v.bandwidth))
    )
    variants = probed.filter((v): v is DownloadVariant => v !== null)
  }

  // Media playlist directly (no master) → single variant
  if (variants.length === 0) {
    const single = await probeVariant(masterUrl, referer, "unknown", "unknown")
    if (single) variants = [single]
  }

  if (variants.length === 0) return null
  variants.sort((a, b) => (a.estimatedBytes || 0) - (b.estimatedBytes || 0))

  return { provider: "moviesapi", m3u8Url: masterUrl, referer, variants }
}

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "—"
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
