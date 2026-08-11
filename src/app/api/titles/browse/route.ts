import { NextRequest, NextResponse } from "next/server"

// GET /api/titles/browse?type=movie|series&genre=Action&limit=48&offset=0
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const typeParam = url.searchParams.get("type")
  const genre = url.searchParams.get("genre") ?? undefined
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "48") || 48, 100)
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0

  const type =
    typeParam === "series" ? "series" : typeParam === "movie" ? "movie" : undefined

  try {
    const { browseLocalTitles } = await import("@/lib/local-titles")
    const items = await browseLocalTitles({ type, genre, limit, offset })
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[api/titles/browse] error:", e)
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
