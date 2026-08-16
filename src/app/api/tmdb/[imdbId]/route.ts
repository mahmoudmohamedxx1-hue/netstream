import { NextRequest, NextResponse } from "next/server"
import { getTmdbTitle } from "@/lib/tmdb"

// GET /api/tmdb/[imdbId]?lang=ar — full TMDB metadata (cast, trailer, similar, etc.)
// Pass lang=ar to get Arabic titles/overviews from TMDB (language=ar-SA).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  const lang = req.nextUrl.searchParams.get("lang") === "ar" ? "ar-SA" : undefined
  try {
    const title = await getTmdbTitle(imdbId, lang)
    if (!title) return NextResponse.json({ title: null }, { status: 404 })
    return NextResponse.json({ title })
  } catch (e) {
    console.error("[api/tmdb] error:", e)
    return NextResponse.json({ error: "TMDB request failed" }, { status: 500 })
  }
}
