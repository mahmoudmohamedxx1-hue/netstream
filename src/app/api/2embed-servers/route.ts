import { NextRequest, NextResponse } from "next/server"
import { get2EmbedServers } from "@/lib/video-extract"

// GET /api/2embed-servers?imdbId=tt1375666&type=movie&season=1&episode=1
//
// Extracts ALL server mirrors from 2Embed.cc's embed page.
// Uses shared logic from @/lib/video-extract so it works in both dev and
// production (no localhost:3000 fetch needed).

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId") || ""
  const type = (url.searchParams.get("type") || "movie") as "movie" | "series"
  const season = url.searchParams.get("season")
  const episode = url.searchParams.get("episode")

  if (!imdbId) {
    return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  }

  try {
    const { servers, directServers } = await get2EmbedServers(imdbId, type, season, episode)
    return NextResponse.json({
      servers,
      directServers,
      count: servers.length + directServers.length,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ servers: [], error })
  }
}
