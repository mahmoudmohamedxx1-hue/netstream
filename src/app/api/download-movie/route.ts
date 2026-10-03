import { NextRequest, NextResponse } from "next/server"

// GET /api/download-movie?imdbId=tt0111161&type=movie&title=Test
//
// Returns the direct m3u8 URL + AES key from MoviesAPI's vidora API.
// The browser then downloads the m3u8 segments client-side.

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const PLAYER_KEY = "3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId")
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = url.searchParams.get("season") || "1"
  const episode = url.searchParams.get("episode") || "1"

  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })

  try {
    // Step 1: Get TMDB ID
    const findRes = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!findRes.ok) return NextResponse.json({ error: "TMDB lookup failed" }, { status: 502 })
    const findData = await findRes.json()
    const tmdbId = findData.movie_results?.[0]?.id || findData.tv_results?.[0]?.id
    if (!tmdbId) return NextResponse.json({ error: "TMDB ID not found" }, { status: 404 })

    // Step 2: Get session cookie
    const pageRes = await fetch(`https://moviesapi.to/movie/${imdbId}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    })
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map(c => c.split(";")[0]).join("; ")

    // Step 3: Call vidora API
    const vidoraPath = type === "series"
      ? `/v1/tv/${tmdbId}/${season}/${episode}`
      : `/v1/movie/${tmdbId}`
    
    const vidoraRes = await fetch(`https://moviesapi.to/api/vidora${vidoraPath}`, {
      headers: {
        "x-player-key": PLAYER_KEY,
        "User-Agent": UA,
        "Referer": `https://moviesapi.to/movie/${imdbId}`,
        "Cookie": cookieStr,
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!vidoraRes.ok) return NextResponse.json({ error: `Vidora API: ${vidoraRes.status}` }, { status: 502 })
    const vidoraData = await vidoraRes.json()
    
    const m3u8Url = vidoraData?.sources?.[0]?.url
    if (!m3u8Url) return NextResponse.json({ error: "No video source" }, { status: 404 })

    // Step 4: Fetch the master playlist to get variant URLs + quality info
    const m3u8Res = await fetch(m3u8Url, {
      headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!m3u8Res.ok) return NextResponse.json({ error: `m3u8 fetch: ${m3u8Res.status}` }, { status: 502 })
    const masterPlaylist = await m3u8Res.text()
    const baseUrl = new URL(m3u8Res.url || m3u8Url)

    // Parse variants from master playlist
    const variants: { url: string; resolution: string; bandwidth: string }[] = []
    const lines = masterPlaylist.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("#EXT-X-STREAM-INF")) {
        const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/)
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/)
        const next = lines[i + 1]?.trim()
        if (next && !next.startsWith("#")) {
          variants.push({
            url: new URL(next, baseUrl).href,
            resolution: resMatch?.[1] || "unknown",
            bandwidth: bwMatch?.[1] || "unknown",
          })
        }
      }
    }

    // If no variants, the m3u8 itself is a media playlist
    if (variants.length === 0) {
      variants.push({
        url: m3u8Res.url,
        resolution: "unknown",
        bandwidth: "unknown",
      })
    }

    // Step 5: Fetch the first variant to get AES key + segment count
    const variantUrl = variants[0].url
    const variantRes = await fetch(variantUrl, {
      headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    const variantPlaylist = await variantRes.text()
    const variantBase = new URL(variantRes.url || variantUrl)

    // Parse AES key
    let aesKeyUrl: string | null = null
    let aesIv: string | null = null
    for (const line of variantPlaylist.split("\n")) {
      if (line.includes("#EXT-X-KEY") && line.includes("AES-128")) {
        const uriMatch = line.match(/URI="([^"]+)"/)
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/)
        if (uriMatch) aesKeyUrl = new URL(uriMatch[1], variantBase).href
        if (ivMatch) aesIv = ivMatch[1]
      }
    }

    // Count segments
    const segmentCount = variantPlaylist.split("\n").filter(l => l.trim() && !l.startsWith("#")).length

    // Return all info to the client
    return NextResponse.json({
      success: true,
      m3u8Url,
      variants: variants.map(v => ({
        url: v.url,
        resolution: v.resolution,
        quality: v.resolution.includes("1920") ? "1080p"
          : v.resolution.includes("1280") ? "720p"
          : v.resolution.includes("640") ? "480p"
          : "auto",
        bandwidth: v.bandwidth,
      })),
      aesKeyUrl,
      aesIv,
      segmentCount,
      estimatedSize: `${Math.round(segmentCount * 3.4)} MB`, // rough estimate
      referer: "https://moviesapi.to/",
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: `Download error: ${error}` }, { status: 500 })
  }
}
