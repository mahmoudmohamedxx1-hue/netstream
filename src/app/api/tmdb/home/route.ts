import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/home?lang=ar
// Returns multiple rows of TMDB content for the homepage.
// Pass lang=ar to get Arabic overviews from TMDB (the API translates
// overview, title, and name fields when language=ar is set).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const lang = url.searchParams.get("lang") === "ar" ? "ar-SA" : "en-US"

  const endpoints = [
    { key: "Trending Now", path: "/trending/all/week" },
    { key: "Popular Movies", path: "/movie/popular" },
    { key: "Popular Series", path: "/tv/popular" },
    { key: "IMDB Top Movies", path: "/movie/top_rated" },
    { key: "IMDB Top Series", path: "/tv/top_rated" },
    { key: "Arabic Movies", path: "/discover/movie?with_original_language=ar&sort_by=popularity.desc" },
    { key: "Arabic Series", path: "/discover/tv?with_original_language=ar&sort_by=popularity.desc" },
    { key: "Now Playing in Theaters", path: "/movie/now_playing" },
    { key: "Airing This Week", path: "/tv/on_the_air" },
  ]

  try {
    const rows = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const res = await fetch(
            `${TMDB_BASE}${ep.path}?api_key=${TMDB_API_KEY}&page=1&language=${lang}`,
            { next: { revalidate: 3600 } }
          )
          if (!res.ok) return { title: ep.key, titles: [] }
          const data = await res.json()
          const titles = (data.results ?? []).slice(0, 20).map((r: any) => {
            const isTvEndpoint = ep.path.includes("/tv/")
            const isTrending = ep.path.includes("/trending/")
            const isMovie = isTrending ? r.media_type === "movie" : !isTvEndpoint
            return {
              imdbId: null,
              tmdbId: r.id,
              title: r.title ?? r.name ?? "",
              type: (isMovie ? "movie" : "series") as "movie" | "series",
              year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
              rating: r.vote_average ? String(r.vote_average) : null,
              poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
              backdrop: r.backdrop_path ? `${TMDB_IMG.replace("w500", "original")}${r.backdrop_path}` : null,
              overview: r.overview ?? "",
            }
          })
          return { title: ep.key, titles }
        } catch {
          return { title: ep.key, titles: [] }
        }
      })
    )

    return NextResponse.json({ rows })
  } catch (e) {
    console.error("[api/tmdb/home] error:", e)
    return NextResponse.json({ rows: [] }, { status: 500 })
  }
}
