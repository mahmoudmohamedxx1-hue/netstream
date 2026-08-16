import { NextRequest, NextResponse } from "next/server"
import { discoverTopTitles, imdbConfigured } from "@/lib/imdb"

// GET /api/imdb/discover?type=movie|series&first=50&genre=Action&minRating=7
// Returns top-rated IMDb titles on demand (used for the "best of" experience).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const typeParam = url.searchParams.get("type")
  const first = Math.min(Number(url.searchParams.get("first") ?? "50") || 50, 100)
  const minRating = url.searchParams.get("minRating")
    ? Number(url.searchParams.get("minRating"))
    : undefined
  const genre = url.searchParams.get("genre") ?? undefined

  const type =
    typeParam === "series" ? "series" : typeParam === "movie" ? "movie" : undefined

  if (!imdbConfigured()) {
    return NextResponse.json({ configured: false, items: [] })
  }

  try {
    const items = await discoverTopTitles({ type, first, minRating, genre })
    return NextResponse.json({ configured: true, items })
  } catch (e) {
    console.error("[api/imdb/discover] error:", e)
    return NextResponse.json(
      { configured: true, error: "discover failed", items: [] },
      { status: 502 }
    )
  }
}
