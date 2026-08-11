import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/search?q=...&type=movie|series
// Searches TMDB for movies/series. Returns items with IMDB IDs (lazy).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const type = url.searchParams.get("type") === "series" ? "tv" : "movie"
  if (q.length < 2) return NextResponse.json({ items: [] })

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=1`,
      { cache: "no-store" }
    )
    if (!res.ok) return NextResponse.json({ items: [] }, { status: 502 })
    const data = await res.json()
    const items = (data.results ?? []).slice(0, 20).map((r: any) => ({
      tmdbId: r.id,
      title: r.title ?? r.name ?? "",
      type: type === "movie" ? "movie" as const : "series" as const,
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      rating: r.vote_average ? String(r.vote_average) : null,
      poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
      backdrop: r.backdrop_path ? `${TMDB_IMG}${r.backdrop_path}` : null,
      overview: r.overview ?? "",
    }))
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] }, { status: 500 })
  }
}
