import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/watchlist — list all saved titles (newest first)
export async function GET() {
  try {
    const items = await db.watchlist.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ items })
  } catch {
    // DB might not be available (e.g., serverless) — return empty list
    return NextResponse.json({ items: [] })
  }
}

// POST /api/watchlist — add a title to My List
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imdbId, title, type, poster, year, overview, rating } = body ?? {}
    if (!imdbId || !title || !type) {
      return NextResponse.json(
        { error: "imdbId, title and type are required" },
        { status: 400 }
      )
    }
    const item = await db.watchlist.upsert({
      where: { imdbId },
      update: { title, type, poster, year, overview, rating },
      create: { imdbId, title, type, poster, year, overview, rating },
    })
    return NextResponse.json({ item })
  } catch {
    return NextResponse.json(
      { error: "Failed to save to watchlist" },
      { status: 500 }
    )
  }
}

// DELETE /api/watchlist?imdbId=tt...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const imdbId = searchParams.get("imdbId")
    if (!imdbId) {
      return NextResponse.json({ error: "imdbId required" }, { status: 400 })
    }
    await db.watchlist.delete({ where: { imdbId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    )
  }
}
