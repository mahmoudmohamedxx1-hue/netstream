import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/browse?type=movie|series&category=popular|top_rated|trending|arabic&genre=Action&page=1
// Fetches titles directly from TMDB (full library). Does NOT fetch IMDB IDs
// server-side (too slow with 20 parallel requests) — the client uses the
// /api/posters endpoint to look up IMDB IDs on demand.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const type = url.searchParams.get("type") === "series" ? "tv" : "movie"
  const category = url.searchParams.get("category") ?? "popular"
  const genre = url.searchParams.get("genre")
  const page = Math.min(Number(url.searchParams.get("page") ?? "1") || 1, 500)
  const lang = url.searchParams.get("lang") === "ar" ? "ar-SA" : "en-US"

  try {
    let path: string
    if (category === "arabic") {
      // Arabic content — discovered via TMDB's with_original_language=ar filter.
      path = `/discover/${type}?with_original_language=ar&sort_by=popularity.desc`
    } else if (category === "trending") {
      path = `/trending/${type}/week`
    } else if (category === "top_rated") {
      path = `/${type}/top_rated`
    } else if (category === "now_playing" && type === "movie") {
      path = `/movie/now_playing`
    } else if (category === "on_the_air" && type === "tv") {
      path = `/tv/on_the_air`
    } else if (genre) {
      path = `/discover/${type}?with_genres=${genre}&sort_by=popularity.desc`
    } else {
      path = `/${type}/popular`
    }

    const res = await fetch(
      `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&page=${page}&language=${lang}`,
      { cache: "no-store" }
    )
    if (!res.ok) {
      return NextResponse.json({ items: [], error: "TMDB request failed" }, { status: 502 })
    }
    const data = await res.json()

    const results = data.results ?? []
    const items = results.map((r: any) => ({
      tmdbId: r.id,
      title: r.title ?? r.name ?? "",
      type: type === "movie" ? "movie" as const : "series" as const,
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      rating: r.vote_average ? String(r.vote_average) : null,
      poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
      backdrop: r.backdrop_path ? `${TMDB_IMG}${r.backdrop_path}` : null,
      overview: r.overview ?? "",
    }))

    return NextResponse.json({
      items,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    })
  } catch (e) {
    console.error("[api/tmdb/browse] error:", e)
    return NextResponse.json({ items: [], error: "Failed" }, { status: 500 })
  }
}
