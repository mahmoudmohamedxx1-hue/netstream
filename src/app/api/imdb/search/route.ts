import { NextRequest, NextResponse } from "next/server"
import { searchImdbTitles, imdbConfigured } from "@/lib/imdb"

// GET /api/imdb/search?q=...
// Free-text search across IMDb titles.
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  const first = Math.min(
    Number(new URL(req.url).searchParams.get("first") ?? "20") || 20,
    50
  )
  if (!q) {
    return NextResponse.json({ items: [] })
  }
  if (!imdbConfigured()) {
    return NextResponse.json({ configured: false, items: [] })
  }
  try {
    const items = await searchImdbTitles(q, first)
    return NextResponse.json({ configured: true, items })
  } catch (e) {
    console.error("[api/imdb/search] error:", e)
    return NextResponse.json(
      { configured: true, error: "search failed", items: [] },
      { status: 502 }
    )
  }
}
