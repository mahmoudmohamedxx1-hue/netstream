import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/provider-stats?imdbId=tt0111161
//   Returns reliability stats for every provider that has been reported for
//   this title. Used to show "best match" badges in the server dropdown.
//
// POST /api/provider-stats
//   Body: { imdbId, sourceId, ok }
//   Records a user's report (working/broken) for a (title, provider) pair.
//   Upserts the stat row, incrementing `reports` and updating `ok` + `updatedAt`.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId")?.trim().toLowerCase()
  if (!imdbId) {
    return NextResponse.json({ stats: [] }, { status: 400 })
  }
  try {
    const rows = await db.providerStat.findMany({
      where: { imdbId },
      orderBy: [{ ok: "desc" }, { reports: "desc" }],
    })
    return NextResponse.json({
      stats: rows.map((r) => ({
        sourceId: r.sourceId,
        ok: r.ok,
        reports: r.reports,
        updatedAt: r.updatedAt,
      })),
    })
  } catch (e) {
    console.error("[api/provider-stats] GET error:", e)
    return NextResponse.json({ stats: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const imdbId = (body.imdbId || "").toString().trim().toLowerCase()
    const sourceId = (body.sourceId || "").toString().trim()
    const ok = !!body.ok
    if (!imdbId || !sourceId) {
      return NextResponse.json({ ok: false, error: "imdbId and sourceId required" }, { status: 400 })
    }
    const row = await db.providerStat.upsert({
      where: { imdbId_sourceId: { imdbId, sourceId } },
      create: { imdbId, sourceId, ok, reports: 1 },
      update: { ok, reports: { increment: 1 } },
    })
    return NextResponse.json({ ok: true, stat: row })
  } catch (e) {
    console.error("[api/provider-stats] POST error:", e)
    return NextResponse.json({ ok: false, error: "Failed to record" }, { status: 500 })
  }
}
