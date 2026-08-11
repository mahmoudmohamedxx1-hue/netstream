import { NextRequest, NextResponse } from "next/server"

// GET /api/titles/search?q=...&limit=24
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? "24") || 24,
    100
  )
  if (q.length < 2) {
    return NextResponse.json({ items: [] })
  }
  try {
    const { searchLocalTitles } = await import("@/lib/local-titles")
    const items = await searchLocalTitles(q, limit)
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[api/titles/search] error:", e)
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
