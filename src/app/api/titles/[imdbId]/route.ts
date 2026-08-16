import { NextRequest, NextResponse } from "next/server"

// GET /api/titles/[imdbId]
// Returns local IMDb metadata for the given title id (no API key needed).
// Falls back gracefully if the database or module is unavailable.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  const cleaned = (imdbId || "").trim().toLowerCase()
  if (!cleaned) {
    return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  }
  try {
    const { getLocalTitle } = await import("@/lib/local-titles")
    const title = await getLocalTitle(cleaned)
    if (!title) {
      return NextResponse.json(
        { imdbId: cleaned, title: null },
        { status: 404 }
      )
    }
    return NextResponse.json({ imdbId: cleaned, title })
  } catch (e) {
    console.error("[api/titles] error:", e)
    return NextResponse.json(
      { imdbId: cleaned, title: null, error: "lookup failed" },
      { status: 200 } // Return 200 with null to avoid breaking the frontend
    )
  }
}
