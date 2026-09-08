import { NextRequest, NextResponse } from "next/server"

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/stremio/[imdbId]?type=movie|series&season=1&episode=1
//
// Queries public Stremio addons for streaming sources. Returns a list of
// streams with their infoHash (for WebTorrent playback), size, quality,
// and seeders. The client uses WebTorrent to stream the torrent directly
// in the browser — no iframe, no scraping, full playback control.
//
// Stremio addon API format:
//   Movie:  /stream/movie/{imdbId}.json
//   Series: /stream/series/{imdbId}:{season}:{episode}.json
//
// Response: { streams: [{ name, title, infoHash, fileIdx, behaviorHints }] }
// ═══════════════════════════════════════════════════════════════════════════

// Public Stremio streaming addons — each returns torrent streams.
// We query ALL of them in parallel and merge + deduplicate results.
const STREMIO_ADDONS = [
  {
    name: "Torrentio",
    url: "https://torrentio.strem.fun",
    // Torrentio supports quality filtering + sorting via query params
    buildUrl: (imdbId: string, type: string, season: number, episode: number) => {
      return type === "series"
        ? `https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`
        : `https://torrentio.strem.fun/stream/movie/${imdbId}.json`
    },
  },
  {
    name: "KnightCrawler",
    url: "https://knightcrawler.elfhosted.com",
    buildUrl: (imdbId: string, type: string, season: number, episode: number) => {
      return type === "series"
        ? `https://knightcrawler.elfhosted.com/stream/series/${imdbId}:${season}:${episode}.json`
        : `https://knightcrawler.elfhosted.com/stream/movie/${imdbId}.json`
    },
  },
  {
    name: "Annatar",
    url: "https://annatar.sirberg.org",
    buildUrl: (imdbId: string, type: string, season: number, episode: number) => {
      return type === "series"
        ? `https://annatar.sirberg.org/stream/series/${imdbId}:${season}:${episode}.json`
        : `https://annatar.sirberg.org/stream/movie/${imdbId}.json`
    },
  },
  {
    name: "Comet",
    url: "https://comet.fastbeyond.com",
    buildUrl: (imdbId: string, type: string, season: number, episode: number) => {
      return type === "series"
        ? `https://comet.fastbeyond.com/stream/series/${imdbId}:${season}:${episode}.json`
        : `https://comet.fastbeyond.com/stream/movie/${imdbId}.json`
    },
  },
]

type StremioStream = {
  name: string
  title: string
  infoHash: string
  fileIdx: number
  sourceAddon: string
  // Parsed from the title
  quality: string
  size: string
  seeders: string
  filename: string
}

function parseStreamTitle(title: string): { quality: string; size: string; seeders: string } {
  // Torrentio format: "Movie Name 2021 1080p BluRay\n👤 234 💾 6.19 GB ⚙️ 1337x"
  const qualityMatch = title.match(/(\d{3,4}p|4k|4K|HDR|DV|CAM|TS|TC|SCREENER)/i)
  const sizeMatch = title.match(/💾\s*([\d.]+\s*(?:GB|MB|TB))/i) || title.match(/([\d.]+\s*(?:GB|MB|TB))/i)
  const seederMatch = title.match(/👤\s*(\d+)/) || title.match(/seeds?:?\s*(\d+)/i)
  return {
    quality: qualityMatch?.[1] ?? "Unknown",
    size: sizeMatch?.[1] ?? "Unknown",
    seeders: seederMatch?.[1] ?? "Unknown",
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })

  const url = new URL(req.url)
  const type = url.searchParams.get("type") ?? "movie"
  const season = parseInt(url.searchParams.get("season") ?? "1", 10)
  const episode = parseInt(url.searchParams.get("episode") ?? "1", 10)

  try {
    // Query ALL addons in parallel
    const results = await Promise.allSettled(
      STREMIO_ADDONS.map(async (addon) => {
        const addonUrl = addon.buildUrl(imdbId, type, season, episode)
        const res = await fetch(addonUrl, {
          signal: AbortSignal.timeout(10000),
          headers: { "Accept": "application/json" },
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.streams ?? []).map((s: any) => {
          const parsed = parseStreamTitle(s.title || s.name || "")
          return {
            name: s.name ?? "",
            title: s.title ?? "",
            infoHash: s.infoHash ?? "",
            fileIdx: s.fileIdx ?? 0,
            sourceAddon: addon.name,
            quality: parsed.quality,
            size: parsed.size,
            seeders: parsed.seeders,
            filename: s.behaviorHints?.filename ?? "",
          } as StremioStream
        })
      })
    )

    // Merge all results
    const allStreams: StremioStream[] = []
    const seenHashes = new Set<string>()

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const stream of result.value) {
          const key = `${stream.infoHash}-${stream.fileIdx}`
          if (!seenHashes.has(key) && stream.infoHash) {
            seenHashes.add(key)
            allStreams.push(stream)
          }
        }
      }
    }

    // Sort by quality (4K first, then 1080p, then 720p, etc.) and seeders
    const qualityOrder: Record<string, number> = {
      "4K": 0, "4k": 0, "2160p": 0,
      "1080p": 1, "HDR": 0.5, "DV": 0.5,
      "720p": 2, "480p": 3,
    }
    allStreams.sort((a, b) => {
      const qa = qualityOrder[a.quality] ?? 99
      const qb = qualityOrder[b.quality] ?? 99
      if (qa !== qb) return qa - qb
      // Higher seeders first
      return parseInt(b.seeders) - parseInt(a.seeders)
    })

    return NextResponse.json({
      streams: allStreams,
      count: allStreams.length,
      imdbId,
      type,
      season: type === "series" ? season : undefined,
      episode: type === "series" ? episode : undefined,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Failed to fetch Stremio streams" },
      { status: 500 }
    )
  }
}
