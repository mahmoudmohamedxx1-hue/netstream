import { NextRequest, NextResponse } from "next/server"
import {
  resolveVidoraSource,
  resolveEmbedSources,
  formatBytes,
  type EmbedDownloadSource,
} from "@/lib/download-sources"

// GET /api/download-movie?imdbId=tt0111161&type=movie|series&season=1&episode=1&title=Fight+Club
//
// Resolves downloadable sources and returns fully probed variants (real
// segment counts, real size estimates, AES info, container type). The client
// then downloads segments through /api/hls-proxy (CORS-free) and assembles
// the file locally — or triggers /api/download-file for a server-side
// streaming download.
//
// FALLBACK (2026-10-20): vidora only serves titles moviesapi has encoded
// (~50% of trending movies, far fewer series/classics). When it misses, we
// resolve direct/embed download sources from MyCima/ArabSeed via the
// existing searchMycima pipeline and return them as `embedSources` — the
// dialog offers them as one-tap downloads via /api/download (?url= direct
// MP4 / ?embed= atomic extract+download).

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId")
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = url.searchParams.get("season") || "1"
  const episode = url.searchParams.get("episode") || "1"
  const title = (url.searchParams.get("title") || "").trim()

  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })

  let vidoraError = "No downloadable source found for this title"
  try {
    const source = await resolveVidoraSource(imdbId, type, season, episode)
    if (source && source.variants.length > 0) {
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
    }
    if (source) vidoraError = "No playable variants found for this title"
  } catch (e) {
    vidoraError = e instanceof Error ? e.message : "Source resolution failed"
  }

  // ── Fallback: MyCima/ArabSeed direct + embed sources ───────────────────
  if (title) {
    try {
      const embedSources: EmbedDownloadSource[] = await resolveEmbedSources(
        title,
        type,
        season,
        episode
      )
      if (embedSources.length > 0) {
        return NextResponse.json({
          success: true,
          provider: "mycima",
          variants: [],
          embedSources,
        })
      }
    } catch {
      /* fall through to error */
    }
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "This title isn't available on our download provider (not yet encoded) and no direct download sources were found. You can still stream it — try the server mode or play it in the app.",
    },
    { status: 404 }
  )
}
