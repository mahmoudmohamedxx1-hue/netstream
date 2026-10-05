import { NextRequest, NextResponse } from "next/server"
import { VIDEO_SOURCES, buildPlayerUrl } from "@/lib/vidsrc"
import { tmdbFindId } from "@/lib/download-sources"

// GET /api/check-servers?imdbId=tt0111161&type=movie
// Tests all providers in parallel and returns which ones respond with HTTP 200.
// Note: this only checks if the provider URL is reachable, not if the video
// actually plays — but it's a good first filter.
//
// The TMDB ID is looked up first (via /api/tmdb) so TMDB-keyed providers
// (vidlink, vidfast, videasy — vidlink's catalog is TMDB-only now) are probed
// with the IDs they actually support instead of 404ing on IMDb ids.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId") ?? "tt0111161"
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = Number(url.searchParams.get("season") ?? "1") || 1
  const episode = Number(url.searchParams.get("episode") ?? "1") || 1

  // Resolve the TMDB ID for this title (best effort — providers keyed by IMDb
  // ids don't need it, TMDB-keyed ones do).
  let tmdbId: number | undefined
  try {
    const resolved = await tmdbFindId(imdbId)
    tmdbId = resolved ?? undefined
  } catch {
    // TMDB lookup is optional — providers fall back to IMDb ids.
  }

  const results = await Promise.all(
    VIDEO_SOURCES.filter((s) => !s.searchBased).map(async (source) => {
      const playerUrl = buildPlayerUrl({
        imdbId, tmdbId, type, season, episode, sourceId: source.id,
      })
      try {
        const res = await fetch(playerUrl, {
          method: "GET",
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        })
        return {
          id: source.id,
          name: source.name,
          quality: source.quality,
          tier: source.tier,
          logo: source.logo,
          color: source.color,
          mobile: source.mobile,
          region: source.region,
          ok: res.ok || res.status === 403, // 403 = blocks server but works in browser
          status: res.status,
          url: playerUrl,
        }
      } catch {
        return {
          id: source.id,
          name: source.name,
          quality: source.quality,
          tier: source.tier,
          logo: source.logo,
          color: source.color,
          mobile: source.mobile,
          region: source.region,
          ok: false,
          status: 0,
          url: playerUrl,
        }
      }
    })
  )

  return NextResponse.json({ results })
}
