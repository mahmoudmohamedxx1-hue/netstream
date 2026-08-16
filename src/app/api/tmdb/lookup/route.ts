import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/lookup?tmdbId=123&type=movie|tv
// Looks up the IMDB ID for a TMDB title. Used when a user clicks play on a
// TMDB-browse title (lazy lookup, not done for the whole grid).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tmdbId = url.searchParams.get("tmdbId")
  const type = url.searchParams.get("type") === "tv" ? "tv" : "movie"
  if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 })

  try {
    const res = await fetch(
      `${TMDB_BASE}/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`,
      { cache: "force-cache" }
    )
    if (!res.ok) return NextResponse.json({ imdbId: null }, { status: 404 })
    const data = await res.json()
    const imdbId = data.imdb_id ?? null

    // Also fetch poster if available
    let poster: string | null = null
    const detailsRes = await fetch(
      `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`,
      { cache: "force-cache" }
    )
    if (detailsRes.ok) {
      const details = await detailsRes.json()
      if (details.poster_path) poster = `${TMDB_IMG}${details.poster_path}`
    }

    return NextResponse.json({ imdbId, poster })
  } catch {
    return NextResponse.json({ imdbId: null }, { status: 500 })
  }
}
