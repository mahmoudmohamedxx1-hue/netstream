import { NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"

// GET /api/tmdb/genres?type=movie|series&lang=ar
// Returns the TMDB genre list with IDs. Pass lang=ar for Arabic genre names.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = url.searchParams.get("type") === "series" ? "tv" : "movie"
  const lang = url.searchParams.get("lang") === "ar" ? "ar-SA" : "en-US"
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/genre/${type}/list?api_key=${TMDB_API_KEY}&language=${lang}`,
      { cache: "force-cache" }
    )
    if (!res.ok) return NextResponse.json({ genres: [] }, { status: 502 })
    const data = await res.json()
    return NextResponse.json({ genres: data.genres ?? [] })
  } catch {
    return NextResponse.json({ genres: [] }, { status: 500 })
  }
}
