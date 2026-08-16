import { NextRequest, NextResponse } from "next/server"
import { fetchImdbTitle, imdbConfigured } from "@/lib/imdb"

// GET /api/imdb/[imdbId]
// Returns real IMDb metadata for the given title id.
// Responds with 200 + { configured: false } when IMDb credentials aren't set,
// so the client can fall back gracefully.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  const cleaned = (imdbId || "").trim().toLowerCase()
  if (!cleaned) {
    return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  }

  if (!imdbConfigured()) {
    return NextResponse.json({
      configured: false,
      imdbId: cleaned,
      title: null,
    })
  }

  try {
    const title = await fetchImdbTitle(cleaned)
    if (!title) {
      return NextResponse.json(
        { configured: true, imdbId: cleaned, title: null },
        { status: 404 }
      )
    }
    return NextResponse.json({ configured: true, imdbId: cleaned, title })
  } catch (e) {
    console.error("[api/imdb] error:", e)
    return NextResponse.json(
      { configured: true, error: "IMDb request failed" },
      { status: 502 }
    )
  }
}
