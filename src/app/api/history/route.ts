import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// ── Input validation helpers ──────────────────────────────────────────────
const IMDB_ID_RE = /^(tt\d{7,8}|tmdb-\d+)$/
const TYPE_RE = /^(movie|series)$/

function validateHistoryInput(body: any) {
  const errors: string[] = []
  const {
    imdbId, title, type, poster, year, overview, rating,
    season, episode, progress, position, duration, sourceId,
  } = body ?? {}

  if (!imdbId || typeof imdbId !== "string" || !IMDB_ID_RE.test(imdbId)) {
    errors.push("imdbId must be a valid IMDB ID (e.g. tt0111161)")
  }
  if (!title || typeof title !== "string" || title.length === 0 || title.length > 300) {
    errors.push("title is required (max 300 chars)")
  }
  if (!type || !TYPE_RE.test(type)) {
    errors.push("type must be 'movie' or 'series'")
  }
  // Optional numeric fields
  const numFields = { season, episode, progress, position, duration }
  for (const [key, val] of Object.entries(numFields)) {
    if (val !== undefined && val !== null && val !== "") {
      const n = Number(val)
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        errors.push(`${key} must be a non-negative number`)
      }
    }
  }
  if (progress !== undefined && progress !== null && progress !== "") {
    const p = Number(progress)
    if (p < 0 || p > 100) {
      errors.push("progress must be between 0 and 100")
    }
  }
  if (poster !== undefined && poster !== null && (typeof poster !== "string" || poster.length > 1000)) {
    errors.push("poster must be a valid URL string (max 1000 chars)")
  }
  if (sourceId !== undefined && sourceId !== null && (typeof sourceId !== "string" || sourceId.length > 200)) {
    errors.push("sourceId must be a string (max 200 chars)")
  }
  if (overview !== undefined && overview !== null && (typeof overview !== "string" || overview.length > 5000)) {
    errors.push("overview must be a string (max 5000 chars)")
  }

  return {
    errors,
    sanitized: {
      imdbId,
      title: title?.slice(0, 300),
      type,
      poster: poster?.slice(0, 1000) ?? null,
      year: year ?? null,
      overview: overview?.slice(0, 5000) ?? null,
      rating: rating ?? null,
      season: season != null && season !== "" ? Number(season) : null,
      episode: episode != null && episode !== "" ? Number(episode) : null,
      progress: progress != null && progress !== "" ? Number(progress) : null,
      position: position != null && position !== "" ? Number(position) : null,
      duration: duration != null && duration !== "" ? Number(duration) : null,
      sourceId: sourceId?.slice(0, 200) ?? null,
    },
  }
}

// GET /api/history — continue watching list (most recent first)
export async function GET() {
  try {
    const items = await db.watchHistory.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
    })
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}

// POST /api/history — upsert a "continue watching" record when playback starts
export async function POST(req: NextRequest) {
  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { errors, sanitized } = validateHistoryInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
    }
    const item = await db.watchHistory.upsert({
      where: { imdbId: sanitized.imdbId },
      update: { ...sanitized, updatedAt: new Date() },
      create: sanitized,
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
    if (!imdbId || !IMDB_ID_RE.test(imdbId)) {
      return NextResponse.json({ error: "valid imdbId required (e.g. tt0111161)" }, { status: 400 })
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
