import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// ── Input validation helpers ──────────────────────────────────────────────
const IMDB_ID_RE = /^tt\d{7,8}$/
const TYPE_RE = /^(movie|series)$/

function validateWatchlistInput(body: any) {
  const errors: string[] = []
  const { imdbId, title, type, poster, year, overview, rating } = body ?? {}

  if (!imdbId || typeof imdbId !== "string" || !IMDB_ID_RE.test(imdbId)) {
    errors.push("imdbId must be a valid IMDB ID (e.g. tt0111161)")
  }
  if (!title || typeof title !== "string" || title.length === 0 || title.length > 300) {
    errors.push("title is required (max 300 chars)")
  }
  if (!type || !TYPE_RE.test(type)) {
    errors.push("type must be 'movie' or 'series'")
  }
  if (poster !== undefined && poster !== null && (typeof poster !== "string" || poster.length > 1000)) {
    errors.push("poster must be a valid URL string (max 1000 chars)")
  }
  if (year !== undefined && year !== null && year !== "") {
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || yearNum < 1888 || yearNum > 2100) {
      errors.push("year must be a valid number between 1888 and 2100")
    }
  }
  if (overview !== undefined && overview !== null && (typeof overview !== "string" || overview.length > 5000)) {
    errors.push("overview must be a string (max 5000 chars)")
  }
  if (rating !== undefined && rating !== null && rating !== "") {
    const ratingNum = Number(rating)
    if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 10) {
      errors.push("rating must be a number between 0 and 10")
    }
  }
  return { errors, sanitized: { imdbId, title: title?.slice(0, 300), type, poster: poster?.slice(0, 1000) ?? null, year: year ?? null, overview: overview?.slice(0, 5000) ?? null, rating: rating ?? null } }
}

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
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { errors, sanitized } = validateWatchlistInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
    }
    const item = await db.watchlist.upsert({
      where: { imdbId: sanitized.imdbId },
      update: sanitized,
      create: sanitized,
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
    if (!imdbId || !IMDB_ID_RE.test(imdbId)) {
      return NextResponse.json({ error: "valid imdbId required (e.g. tt0111161)" }, { status: 400 })
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
