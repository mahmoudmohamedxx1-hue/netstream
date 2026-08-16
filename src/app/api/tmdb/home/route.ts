import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/home?lang=ar
// Returns multiple rows of TMDB content for the homepage.
// Each row fetches 2 pages (40 titles) so users can scroll through more
// content per category. 15+ categories cover a wide range of content.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const lang = url.searchParams.get("lang") === "ar" ? "ar-SA" : "en-US"

  // 15+ categories — a mix of trending, popular, top-rated, genre-based,
  // language-based, and release-status rows.
  const endpoints = [
    { key: "Trending Now", path: "/trending/all/week", pages: 2 },
    { key: "Popular Movies", path: "/movie/popular", pages: 2 },
    { key: "Popular Series", path: "/tv/popular", pages: 2 },
    { key: "IMDB Top Movies", path: "/movie/top_rated", pages: 2 },
    { key: "IMDB Top Series", path: "/tv/top_rated", pages: 2 },
    { key: "Arabic Movies", path: "/discover/movie?with_original_language=ar&sort_by=popularity.desc", pages: 2 },
    { key: "Arabic Series", path: "/discover/tv?with_original_language=ar&sort_by=popularity.desc", pages: 2 },
    { key: "Now Playing in Theaters", path: "/movie/now_playing", pages: 2 },
    { key: "Airing This Week", path: "/tv/on_the_air", pages: 2 },
    { key: "Action Movies", path: "/discover/movie?with_genres=28&sort_by=popularity.desc", pages: 2 },
    { key: "Comedy Movies", path: "/discover/movie?with_genres=35&sort_by=popularity.desc", pages: 2 },
    { key: "Horror Movies", path: "/discover/movie?with_genres=27&sort_by=popularity.desc", pages: 2 },
    { key: "Sci-Fi Movies", path: "/discover/movie?with_genres=878&sort_by=popularity.desc", pages: 2 },
    { key: "Animation Movies", path: "/discover/movie?with_genres=16&sort_by=popularity.desc", pages: 2 },
    { key: "Crime Series", path: "/discover/tv?with_genres=80&sort_by=popularity.desc", pages: 2 },
    { key: "Drama Series", path: "/discover/tv?with_genres=18&sort_by=popularity.desc", pages: 2 },
    { key: "Documentaries", path: "/discover/movie?with_genres=99&sort_by=popularity.desc", pages: 2 },
  ]

  // Helper: fetch a single page from TMDB and map results to our format.
  const fetchPage = async (path: string, page: number, lang: string) => {
    const sep = path.includes("?") ? "&" : "?"
    const res = await fetch(
      `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}&page=${page}&language=${lang}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: any) => {
      const isTvEndpoint = path.includes("/tv/")
      const isTrending = path.includes("/trending/")
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
  }

  try {
    const rows = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          // Fetch `ep.pages` pages in parallel and merge (dedup by tmdbId).
          const pages = await Promise.all(
            Array.from({ length: ep.pages }, (_, i) => fetchPage(ep.path, i + 1, lang))
          )
          const all = pages.flat()
          // Deduplicate by tmdbId (some categories may return overlap).
          const seen = new Set<number>()
          const titles = all.filter((t) => {
            if (seen.has(t.tmdbId)) return false
            seen.add(t.tmdbId)
            return true
          }).slice(0, 40)
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
