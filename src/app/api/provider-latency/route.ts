import { NextRequest, NextResponse } from "next/server"
import { VIDEO_SOURCES, buildPlayerUrl } from "@/lib/vidsrc"

// In-memory latency cache. Keyed by `imdbId|type|season|episode`.
// Survives for the lifetime of the dev server process. TTL: 1 hour.
type LatencyEntry = {
  measuredAt: number
  results: { id: string; name: string; latencyMs: number; ok: boolean }[]
}

const CACHE = new Map<string, LatencyEntry>()
const TTL_MS = 60 * 60 * 1000 // 1 hour

// GET /api/provider-latency?imdbId=tt0111161&type=movie
//   Tests every provider URL in parallel, measures the response time, and
//   returns the results sorted fastest-first. Cached for 1 hour per title.
//   This runs server-side (sandbox network) so the browser doesn't have to
//   fan out 24 cross-origin requests.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId") ?? "tt0111161"
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = Number(url.searchParams.get("season") ?? "1") || 1
  const episode = Number(url.searchParams.get("episode") ?? "1") || 1
  const force = url.searchParams.get("force") === "1"

  const cacheKey = `${imdbId}|${type}|${season}|${episode}`
  const hit = CACHE.get(cacheKey)
  if (hit && !force && Date.now() - hit.measuredAt < TTL_MS) {
    return NextResponse.json({
      cached: true,
      measuredAt: hit.measuredAt,
      results: hit.results,
    })
  }

  const results = await Promise.all(
    VIDEO_SOURCES.map(async (source) => {
      const playerUrl = buildPlayerUrl({
        imdbId, type, season, episode, sourceId: source.id,
      })
      const t0 = Date.now()
      try {
        const res = await fetch(playerUrl, {
          method: "GET",
          signal: AbortSignal.timeout(6000),
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        })
        const latencyMs = Date.now() - t0
        // 403 = blocks server-side requests but works in browser iframe
        return {
          id: source.id,
          name: source.name,
          latencyMs,
          ok: res.ok || res.status === 403,
        }
      } catch {
        return {
          id: source.id,
          name: source.name,
          latencyMs: Date.now() - t0,
          ok: false,
        }
      }
    })
  )

  // Sort: working first, then by latency asc
  results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.latencyMs - b.latencyMs)

  CACHE.set(cacheKey, { measuredAt: Date.now(), results })

  return NextResponse.json({
    cached: false,
    measuredAt: Date.now(),
    results,
  })
}
