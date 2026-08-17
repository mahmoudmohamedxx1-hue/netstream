import { NextRequest, NextResponse } from "next/server"

// GET /api/tmdb/season?tmdbId=1396&season=1
// Returns episode details (name, overview, still, runtime, airDate) for a season.
const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tmdbId = url.searchParams.get("tmdbId")
  const season = url.searchParams.get("season") || "1"
  if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 })

  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=en-US`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return NextResponse.json({ episodes: [] }, { status: 200 })
    const data = await res.json()
    const episodes = (data.episodes ?? []).map((ep: any) => ({
      episodeNumber: ep.episode_number ?? 0,
      name: ep.name ?? `Episode ${ep.episode_number}`,
      overview: ep.overview ?? "",
      still: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
      runtime: ep.runtime ?? null,
      airDate: ep.air_date ?? null,
      voteAverage: ep.vote_average ?? null,
    }))
    return NextResponse.json({ episodes, seasonName: data.name, seasonOverview: data.overview })
  } catch {
    return NextResponse.json({ episodes: [] })
  }
}
