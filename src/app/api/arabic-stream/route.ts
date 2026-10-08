// GET /api/arabic-stream?site=mycima&title=...&type=movie|series
//                        &imdbId=tt...&season=1&episode=1
//
// Resolves a PLAYABLE source for (mostly Arabic) titles through the
// MyCima / ArabSeed aggregator (alking.mycima.cv) — live-tested end-to-end:
//   search → watch page → two source kinds:
//     • kind "embed"  — mycimafsd base64 token → direct video-host embed
//                       (fastvip.space / hglink.to / …) → iframe DIRECTLY in
//                       the user's browser (tokens are network-bound)
//     • kind "mp4"    — secure_stream zlib token → link.mycima.cv DIRECT MP4
//                       (video/mp4 + byte ranges + ACAO:*) → native <video>
//   (The old "player" kind — MyCima's own mycima-my.com page — was removed
//    2026-10-08: iframing it showed users the MyCima website, not the title.)
//
// Title matching: 1st attempt uses the client-supplied title; when that finds
// nothing and an imdbId is supplied, we look up ARABIC titles from TMDB
// (ar-SA title + alternative Arabic titles + original title) and retry —
// English titles rarely match Arabic slugs.

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
  /** True when the source is verified playable server-side (direct media URL
   *  extracted, or the embed page probed alive). "player" sources can't be
   *  verified from datacenters (Cloudflare) and stay unverified. */
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

/** Verify a direct MP4 URL with a tiny ranged GET (content-type + reachability). */
async function probeDirectMedia(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-256", "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok && res.status !== 206) return false
    const ct = res.headers.get("content-type") ?? ""
    return ct.startsWith("video/") || ct.startsWith("audio/") || ct === "application/octet-stream"
  } catch {
    return false
  }
}

/** Arabic title candidates from TMDB: ar-SA title, alternative Arabic titles, original. */
async function tmdbArabicTitles(
  imdbId: string,
  type: "movie" | "series"
): Promise<string[]> {
  try {
    const tmdbId = await tmdbFindId(imdbId)
    if (!tmdbId) return []
    const path = type === "series" ? "tv" : "movie"
    const titles: string[] = []
    const res = await fetch(
      `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const data = await res.json()
      const primary = data.name || data.title
      if (primary) titles.push(primary)
    }
    // Alternative titles (any Arabic-script entry) — MyCima slugs often use
    // different transliterations than TMDB's primary ar-SA title.
    const altRes = await fetch(
      `https://api.themoviedb.org/3/${path}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (altRes.ok) {
      const altData = await altRes.json()
      const list: { title?: string; name?: string }[] = altData.titles ?? altData.results ?? []
      for (const t of list) {
        const v = t.title ?? t.name
        if (v && /[\u0600-\u06FF]/.test(v)) titles.push(v)
      }
    }
    return [...new Set(titles)].slice(0, 4)
  } catch {
    return []
  }
}

// Source-kind priority: series rely on direct MP4s; movies usually have
// working embed hosts.
const KIND_ORDER_SERIES = { mp4: 0, embed: 1 } as const
const KIND_ORDER_MOVIE = { embed: 0, mp4: 1 } as const

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
  // Verify each source. kind=mp4 → tiny ranged GET; kind=embed → direct-video
  // extraction with a liveness fallback.
  const probed = await Promise.all(
    sources.slice(0, 5).map(async (s): Promise<ArabicStreamSource> => {
      if (s.kind === "mp4") {
        const ok = await probeDirectMedia(s.url)
        return { ...s, directUrl: ok ? s.url : null, videoType: ok ? "mp4" : null, verified: ok }
      }
      // embed
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
  // Sort: by kind priority for the content type, then verified first.
  const kindOrder = type === "series" ? KIND_ORDER_SERIES : KIND_ORDER_MOVIE
  probed.sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 9
    const kb = kindOrder[b.kind] ?? 9
    if (ka !== kb) return ka - kb
    return Number(b.verified) - Number(a.verified)
  })
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
  // 2nd attempt: Arabic titles from TMDB (primary + alternatives + original)
  if (result.sources.length === 0 && imdbId) {
    const arTitles = await tmdbArabicTitles(imdbId, type)
    for (const arTitle of arTitles) {
      if (arTitle === title) continue
      result = await resolve(arTitle, type, seasonNum, episodeNum, true)
      if (result.sources.length > 0) break
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
