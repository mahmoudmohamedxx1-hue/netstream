import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/posters?ids=tt0111161,tt0903747,tt1375666
// Returns a map of imdbId → poster URL (batch lookup for browse grids)
export async function GET(req: NextRequest) {
  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? []
  if (ids.length === 0) return NextResponse.json({ posters: {} })
  if (ids.length > 20) return NextResponse.json({ error: "Max 20 ids per request" }, { status: 400 })

  const posters: Record<string, string | null> = {}
  await Promise.all(
    ids.map(async (imdbId) => {
      try {
        const res = await fetch(
          `${TMDB_BASE}/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`,
          { cache: "force-cache" }
        )
        if (!res.ok) { posters[imdbId] = null; return }
        const data = await res.json()
        const movie = data.movie_results?.[0]
        const tv = data.tv_results?.[0]
        const posterPath = movie?.poster_path ?? tv?.poster_path
        posters[imdbId] = posterPath ? `${TMDB_IMG}${posterPath}` : null
      } catch {
        posters[imdbId] = null
      }
    })
  )
  return NextResponse.json({ posters })
}
