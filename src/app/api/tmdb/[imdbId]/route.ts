import { NextRequest, NextResponse } from "next/server"
import { getTmdbTitle } from "@/lib/tmdb"

// GET /api/tmdb/[imdbId]?lang=en|ar
// Returns detailed title information including trailerKey, logo, maturityRating
// Used by tmdb-home.tsx to fetch hero trailer data for both movies and series
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  const url = new URL(req.url)
  const lang = url.searchParams.get("lang") === "ar" ? "ar-SA" : undefined
  
  if (!imdbId) {
    return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  }
  
  try {
    const title = await getTmdbTitle(imdbId, lang)
    
    if (!title) {
      return NextResponse.json({ title: null }, { status: 404 })
    }
    
    return NextResponse.json({
      title: {
        trailerKey: title.trailerKey,
        logo: title.logo,
        maturityRating: title.maturityRating,
        backdrop: title.backdrop,
        genres: title.genres,
      },
    })
  } catch (error) {
    console.error("Error fetching TMDB title:", error)
    return NextResponse.json({ title: null }, { status: 500 })
  }
}
