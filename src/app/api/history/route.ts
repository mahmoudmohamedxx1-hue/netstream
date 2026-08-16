import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/history — continue watching list (most recent first)
export async function GET() {
  try {
    const items = await db.watchHistory.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
    })
    return NextResponse.json({ items })
  } catch {
    // DB might not be available (e.g., serverless) — return empty list
    return NextResponse.json({ items: [] })
  }
}

// POST /api/history — upsert a "continue watching" record when playback starts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      imdbId, title, type, poster, year, overview, rating,
      season, episode, progress, position, duration,
    } = body ?? {}
    if (!imdbId || !title || !type) {
      return NextResponse.json(
        { error: "imdbId, title and type are required" },
        { status: 400 }
      )
    }
    const item = await db.watchHistory.upsert({
      where: { imdbId },
      update: {
        title, type, poster, year, overview, rating,
        season: season ?? null, episode: episode ?? null,
        progress: progress ?? null, position: position ?? null,
        duration: duration ?? null,
        updatedAt: new Date(),
      },
      create: {
        imdbId, title, type, poster, year, overview, rating,
        season: season ?? null, episode: episode ?? null,
        progress: progress ?? null, position: position ?? null,
        duration: duration ?? null,
      },
    })
    return NextResponse.json({ item })
  } catch {
    return NextResponse.json(
      { error: "Failed to save history" },
      { status: 500 }
    )
  }
}

// DELETE /api/history?imdbId=tt...  (or ?all=1 to clear)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const imdbId = searchParams.get("imdbId")
    const all = searchParams.get("all")
    if (all === "1") {
      await db.watchHistory.deleteMany()
      return NextResponse.json({ ok: true })
    }
    if (!imdbId) {
      return NextResponse.json({ error: "imdbId required" }, { status: 400 })
    }
    await db.watchHistory.delete({ where: { imdbId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to remove history" },
      { status: 500 }
    )
  }
}
