import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

// GET /api/tmdb/search?q=...&type=movie|series|person
// Searches TMDB for movies/series/people. Returns items with IMDB IDs (lazy
// for titles — the client resolves them on click via /api/tmdb/lookup).
//
// type=person: searches TMDB's /search/person endpoint and returns people with
// their profile image, known_for_department (e.g. "Acting", "Directing"), and
// up to 5 `known_for` titles (each carrying tmdbId + poster so the client can
// play them directly — known_for entries don't include IMDB IDs so they need
// the same lazy lookup as TMDB search results).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const rawType = url.searchParams.get("type")
  const type = rawType === "person" ? "person"
    : rawType === "series" ? "tv" : "movie"
  if (q.length < 2) return NextResponse.json({ items: [] })

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=1`,
      { cache: "no-store" }
    )
    if (!res.ok) return NextResponse.json({ items: [] }, { status: 502 })
    const data = await res.json()

    if (type === "person") {
      const items = (data.results ?? []).slice(0, 10).map((p: any) => ({
        personId: p.id,
        name: p.name ?? "",
        profile: p.profile_path ? `${TMDB_IMG}${p.profile_path}` : null,
        knownForDepartment: p.known_for_department ?? "",
        knownFor: (p.known_for ?? []).slice(0, 5).map((k: any) => ({
          tmdbId: k.id,
          title: k.title ?? k.name ?? "",
          type: (k.media_type === "tv" ? "series" : "movie") as "movie" | "series",
          year: (k.release_date ?? k.first_air_date ?? "").slice(0, 4),
          poster: k.poster_path ? `${TMDB_IMG}${k.poster_path}` : null,
          backdrop: k.backdrop_path ? `${TMDB_IMG}${k.backdrop_path}` : null,
          overview: k.overview ?? "",
        })),
      }))
      return NextResponse.json({ items })
    }

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
