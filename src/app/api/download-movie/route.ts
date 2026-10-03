import { NextRequest, NextResponse } from "next/server"

// GET /api/download-movie?imdbId=tt0111161&type=movie&title=Test
// GET /api/download-movie?imdbId=tt0111161&type=series&season=1&episode=1&title=Test
//
// Downloads a movie/episode from MoviesAPI.to by:
// 1. Getting the TMDB ID from IMDB ID
// 2. Getting a session cookie from moviesapi.to
// 3. Calling moviesapi.to's internal vidora API to get the m3u8 URL
// 4. Downloading the m3u8 segments (with AES decryption if needed)
// 5. Streaming the result as a .ts file download

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const PLAYER_KEY = "3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const imdbId = url.searchParams.get("imdbId")
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"
  const season = url.searchParams.get("season") || "1"
  const episode = url.searchParams.get("episode") || "1"
  const title = url.searchParams.get("title") || "video"

  if (!imdbId) return new NextResponse("imdbId required", { status: 400 })

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)
  const filename = `${safeTitle}.ts`

  try {
    // Step 1: Get TMDB ID from IMDB ID
    const tmdbType = type === "series" ? "tv" : "movie"
    const findRes = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!findRes.ok) return new NextResponse("TMDB lookup failed", { status: 502 })
    const findData = await findRes.json()
    const tmdbId = findData.movie_results?.[0]?.id || findData.tv_results?.[0]?.id
    if (!tmdbId) return new NextResponse("TMDB ID not found", { status: 404 })

    // Step 2: Get session cookie from moviesapi.to
    const pageRes = await fetch(`https://moviesapi.to/movie/${imdbId}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    })
    // Extract cookies from the response
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map(c => c.split(";")[0]).join("; ")

    // Step 3: Call vidora API to get the m3u8 URL
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
    if (!vidoraRes.ok) return new NextResponse(`Vidora API failed: ${vidoraRes.status}`, { status: 502 })
    const vidoraData = await vidoraRes.json()
    
    const m3u8Url = vidoraData?.sources?.[0]?.url
    if (!m3u8Url) return new NextResponse("No video source found", { status: 404 })

    // Step 4: Fetch the m3u8 playlist
    const m3u8Res = await fetch(m3u8Url, {
      headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!m3u8Res.ok) return new NextResponse(`m3u8 fetch failed: ${m3u8Res.status}`, { status: 502 })
    let playlist = await m3u8Res.text()
    const baseUrl = new URL(m3u8Res.url || m3u8Url)

    // Step 5: If master playlist, pick first variant
    if (playlist.includes("#EXT-X-STREAM-INF")) {
      const lines = playlist.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("#EXT-X-STREAM-INF")) {
          const next = lines[i + 1]?.trim()
          if (next && !next.startsWith("#")) {
            const variantUrl = new URL(next, baseUrl).href
            const variantRes = await fetch(variantUrl, {
              headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
              redirect: "follow",
              signal: AbortSignal.timeout(15000),
            })
            if (variantRes.ok) {
              playlist = await variantRes.text()
            }
          }
          break
        }
      }
    }

    // Step 6: Parse segment URLs
    const segments: string[] = []
    const lines = playlist.split("\n")
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        try {
          segments.push(new URL(trimmed, baseUrl).href)
        } catch {
          segments.push(trimmed)
        }
      }
    }

    if (segments.length === 0) {
      return new NextResponse("No segments found in m3u8", { status: 404 })
    }

    // Step 7: Check for AES encryption
    let aesKey: Buffer | null = null
    let aesIv: Buffer | null = null
    for (const line of lines) {
      if (line.includes("#EXT-X-KEY") && line.includes("METHOD=AES-128")) {
        const uriMatch = line.match(/URI="([^"]+)"/)
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/)
        if (uriMatch) {
          try {
            const keyUrl = new URL(uriMatch[1], baseUrl).href
            const keyRes = await fetch(keyUrl, {
              headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
              signal: AbortSignal.timeout(10000),
            })
            if (keyRes.ok) {
              aesKey = Buffer.from(await keyRes.arrayBuffer())
              if (ivMatch) aesIv = Buffer.from(ivMatch[1], "hex")
            }
          } catch {}
        }
      }
    }

    // Step 8: Stream all segments concatenated
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    ;(async () => {
      try {
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
          const segRes = await fetch(segments[segIdx], {
            headers: { "User-Agent": UA, "Referer": "https://moviesapi.to/" },
            redirect: "follow",
            signal: AbortSignal.timeout(60000),
          })
          if (!segRes.ok) continue
          const buf = await segRes.arrayBuffer()

          if (aesKey) {
            try {
              const crypto = await import("crypto")
              const iv = aesIv || Buffer.alloc(16)
              if (!aesIv) iv.writeUInt32BE(segIdx, 12)
              const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey, iv)
              const decrypted = Buffer.concat([
                decipher.update(Buffer.from(buf)),
                decipher.final(),
              ])
              writer.write(new Uint8Array(decrypted))
            } catch {
              writer.write(new Uint8Array(buf))
            }
          } else {
            writer.write(new Uint8Array(buf))
          }
        }
      } catch {} finally {
        writer.close()
      }
    })()

    const responseHeaders = new Headers()
    responseHeaders.set("Content-Type", "video/mp2t")
    responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`)
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Disposition")
    responseHeaders.set("Cache-Control", "no-store")

    return new NextResponse(readable, { status: 200, headers: responseHeaders })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Download error: ${error}`, { status: 500 })
  }
}
