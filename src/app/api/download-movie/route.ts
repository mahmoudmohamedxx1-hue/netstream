import { NextRequest, NextResponse } from "next/server"
import { resolveVidoraSource, formatBytes } from "@/lib/download-sources"

// GET /api/download-movie?imdbId=tt0111161&type=movie|series&season=1&episode=1
//
// Resolves downloadable HLS sources and returns fully probed variants
// (real segment counts, real size estimates, AES info, container type).
// The client then downloads segments through /api/hls-proxy (CORS-free)
// and assembles the file locally — or triggers /api/download-file for a
// server-side streaming download.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId")
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = url.searchParams.get("season") || "1"
  const episode = url.searchParams.get("episode") || "1"

  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })

  try {
    const source = await resolveVidoraSource(imdbId, type, season, episode)
    if (!source) {
      return NextResponse.json(
        { success: false, error: "No downloadable source found for this title" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      provider: source.provider,
      m3u8Url: source.m3u8Url,
      referer: source.referer,
      variants: source.variants.map((v) => ({
        url: v.url,
        resolution: v.resolution,
        quality: v.quality,
        bandwidth: v.bandwidth,
        segmentCount: v.segmentCount,
        estimatedBytes: v.estimatedBytes,
        estimatedSize: formatBytes(v.estimatedBytes),
        container: v.container,
        aesKeyUrl: v.aesKeyUrl,
        aesIv: v.aesIv,
        mediaSequence: v.mediaSequence,
      })),
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ success: false, error: `Download error: ${error}` }, { status: 500 })
  }
}
