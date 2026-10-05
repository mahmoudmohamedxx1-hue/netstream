// GET /api/arabic-stream?site=mycima&title=...&type=movie|series
//                        &imdbId=tt...&season=1&episode=1
//
// Resolves a PLAYABLE embed URL for (mostly Arabic) titles through the
// MyCima / ArabSeed aggregator (alking.mycima.cv) — live-tested end-to-end:
//   search → watch page → mycimafsd base64 token → direct video-host embed
//   (fastvip.space / hglink.to / …) that plays in an iframe through
//   /api/video-proxy.
//
// If the first search (using the client-supplied title) finds nothing and an
// imdbId is supplied, we look up the ARABIC title from TMDB (ar-SA) and retry
// — English titles rarely match Arabic slugs.

import { NextResponse } from "next/server"
import { searchMycima, extractDirectFromEmbed, type MycimaSource } from "@/lib/video-extract"
import { tmdbFindId } from "@/lib/download-sources"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"

// In-memory cache (10 min) — the search + decode flow takes ~2-4s.
const cache = new Map<string, { at: number; payload: unknown }>()
const TTL = 10 * 60 * 1000

type ArabicStreamSource = MycimaSource & {
  directUrl?: string | null
  videoType?: "mp4" | "hls" | null
  /** True when the embed page is alive and serves a player (even if a direct
   *  video URL couldn't be extracted — the embed still plays via the proxy). */
  verified?: boolean
}

/** Lightweight liveness probe: does the embed page answer 200 with player-ish markup? */
async function probeEmbedLiveness(url: string, referer: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
        Referer: referer,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const head = (await res.text()).slice(0, 6000).toLowerCase()
    return /jwplayer|<video|videojs|player|sources|hls/.test(head)
  } catch {
    return false
  }
}

async function tmdbArabicTitle(
  imdbId: string,
  type: "movie" | "series"
): Promise<string | null> {
  try {
    const tmdbId = await tmdbFindId(imdbId)
    if (!tmdbId) return null
    const path = type === "series" ? "tv" : "movie"
    const res = await fetch(
      `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.name || data.title || null
  } catch {
    return null
  }
}

async function resolve(
  title: string,
  type: "movie" | "series",
  season: number | null,
  episode: number | null,
  preExtract: boolean
): Promise<{ sources: ArabicStreamSource[]; movieUrl: string | null }> {
  const { sources, pageUrl } = await searchMycima(title, type, season, episode)
  if (!preExtract || sources.length === 0) {
    return { sources: sources.map((s) => ({ ...s, directUrl: null, videoType: null })), movieUrl: pageUrl }
  }
  // Pre-extract direct video URLs (validity gate + download hooks). The embeds
  // play through /api/video-proxy regardless — extraction mainly tells the
  // player which source is healthiest. When extraction fails we still probe
  // the page for liveness (many hosts build their stream client-side only).
  const probed = await Promise.all(
    sources.slice(0, 4).map(async (s) => {
      try {
        const extracted = await extractDirectFromEmbed(s.url, s.host, s.referer)
        if (extracted?.url) {
          return { ...s, directUrl: extracted.url, videoType: extracted.type, verified: true }
        }
        const verified = await probeEmbedLiveness(s.url, s.referer)
        return { ...s, directUrl: null, videoType: null, verified }
      } catch {
        return { ...s, directUrl: null, videoType: null, verified: false }
      }
    })
  )
  // Verified sources first (healthiest), then unverified-but-alive, then rest.
  probed.sort((a, b) => Number(b.verified) - Number(a.verified))
  return { sources: probed, movieUrl: pageUrl }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const site = url.searchParams.get("site") || "mycima"
  const title = (url.searchParams.get("title") || "").trim()
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const imdbId = url.searchParams.get("imdbId") || ""
  const season = url.searchParams.get("season")
  const episode = url.searchParams.get("episode")
  const seasonNum = season ? Number(season) : null
  const episodeNum = episode ? Number(episode) : null

  if (site !== "mycima") {
    return NextResponse.json({ sources: [], movieUrl: null, error: "Unknown site" })
  }
  if (!title && !imdbId) {
    return NextResponse.json({ sources: [], movieUrl: null, error: "No title" })
  }

  const cacheKey = `${site}|${title}|${type}|${seasonNum}|${episodeNum}|${imdbId}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json(hit.payload)
  }

  let result: { sources: ArabicStreamSource[]; movieUrl: string | null } = { sources: [], movieUrl: null }
  let error: string | null = null

  // 1st attempt: the title as given (usually already Arabic in the AR locale)
  if (title) {
    result = await resolve(title, type, seasonNum, episodeNum, true)
  }
  // 2nd attempt: Arabic title from TMDB
  if (result.sources.length === 0 && imdbId) {
    const arTitle = await tmdbArabicTitle(imdbId, type)
    if (arTitle && arTitle !== title) {
      result = await resolve(arTitle, type, seasonNum, episodeNum, true)
    }
  }

  if (result.sources.length === 0) {
    error = "No sources found on ArabSeed"
  }

  const payload = {
    success: result.sources.length > 0,
    sources: result.sources,
    movieUrl: result.movieUrl,
    error,
  }
  cache.set(cacheKey, { at: Date.now(), payload })
  if (cache.size > 100) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)
    for (const [k] of sorted.slice(0, 50)) cache.delete(k)
  }
  return NextResponse.json(payload)
}
