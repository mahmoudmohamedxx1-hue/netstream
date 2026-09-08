import { NextRequest, NextResponse } from "next/server"
import puppeteer from "puppeteer-core"

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/stream/[imdbId]?type=movie|series&season=1&episode=1&provider=2embed.cc
//
// Server-side video URL extractor using a HEADLESS BROWSER (Puppeteer).
//
// Unlike simple HTML scraping, this approach actually EXECUTES the provider's
// JavaScript (sbx.js, player.js, etc.) in a real browser engine, waits for
// the video element to load, then extracts the src attribute — which is the
// direct .m3u8 or .mp4 URL.
//
// This bypasses ALL JavaScript obfuscation that providers use to hide their
// video URLs, because the browser runs the same JS the user's browser would.
//
// Flow:
//   1. Launch headless Chrome
//   2. Navigate to the provider's embed URL
//   3. Wait for network requests to find .m3u8/.mp4 URLs
//   4. Also check the <video> element's src after JS execution
//   5. Extract subtitle tracks from the page
//   6. Return { videoUrl, sources, subtitles } to the client
// ═══════════════════════════════════════════════════════════════════════════

const CHROME_PATH = "/home/z/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome"

function buildEmbedUrl(provider: string, imdbId: string, type: string, season: number, episode: number): string {
  const isMovie = type === "movie"
  switch (provider) {
    case "vidsrc.to":
      return isMovie ? `https://vidsrc.to/embed/movie/${imdbId}` : `https://vidsrc.to/embed/tv/${imdbId}/${season}-${episode}`
    case "vidsrc.me":
      return isMovie ? `https://vidsrc.me/embed/movie?imdb=${imdbId}` : `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`
    case "vidsrc.in":
      return isMovie ? `https://vidsrc.in/embed/movie/${imdbId}` : `https://vidsrc.in/embed/tv/${imdbId}/${season}-${episode}`
    case "vidsrc.hair":
      return isMovie ? `https://vidsrc.hair/embed/movie/${imdbId}` : `https://vidsrc.hair/embed/tv/${imdbId}/${season}/${episode}`
    case "2embed.cc":
      return isMovie ? `https://www.2embed.cc/embed/${imdbId}` : `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}`
    case "2embed.to":
      return isMovie ? `https://www.2embed.to/embed/tmdb/movie/${imdbId}` : `https://www.2embed.to/embed/tmdb/tv/${imdbId}/${season}/${episode}`
    case "smashystream":
      return isMovie ? `https://embed.smashystream.com/playere.php?imdb=${imdbId}` : `https://embed.smashystream.com/playere.php?imdb=${imdbId}&season=${season}&episode=${episode}`
    case "anyembed":
      return isMovie ? `https://anyembed.xyz/embed/imdb-movie-${imdbId}` : `https://anyembed.xyz/embed/imdb-tv-${imdbId}-${season}-${episode}`
    case "vidsrc.cc":
    case "vidsrc.cc.v2":
      return isMovie ? `https://vidsrc.cc/v2/embed/movie/${imdbId}` : `https://vidsrc.cc/v2/embed/tv/${imdbId}/${season}/${episode}`
    case "embedsu":
      return isMovie ? `https://embed.su/embed/movie/${imdbId}` : `https://embed.su/embed/tv/${imdbId}/${season}/${episode}`
    case "multiembed.mov":
      return isMovie ? `https://multiembed.mov/?video_id=${imdbId}` : `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}`
    default:
      return isMovie ? `https://www.2embed.cc/embed/${imdbId}` : `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}`
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })

  const url = new URL(req.url)
  const type = url.searchParams.get("type") ?? "movie"
  const season = parseInt(url.searchParams.get("season") ?? "1", 10)
  const episode = parseInt(url.searchParams.get("episode") ?? "1", 10)
  const provider = url.searchParams.get("provider") ?? "2embed.cc"

  const embedUrl = buildEmbedUrl(provider, imdbId, type, season, episode)

  let browser = null
  try {
    // Launch headless Chrome with anti-detection flags
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images", // Don't load images — faster
        "--disable-javascript-harmony-shipping",
        "--aggressive-cache-discard",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--window-size=1280,720",
      ],
    })

    const page = await browser.newPage()
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    // Collect ALL network requests — look for .m3u8 and .mp4 URLs
    const foundUrls: { url: string; type: string }[] = []
    const foundSubs: { url: string; label: string; lang: string }[] = []

    page.on("request", (request) => {
      const reqUrl = request.url()
      if (reqUrl.includes(".m3u8")) {
        foundUrls.push({ url: reqUrl, type: "hls" })
      } else if (reqUrl.includes(".mp4") && !reqUrl.includes(".gif")) {
        foundUrls.push({ url: reqUrl, type: "mp4" })
      } else if (reqUrl.includes(".vtt") || reqUrl.includes(".srt") || reqUrl.includes("subtitle")) {
        foundSubs.push({ url: reqUrl, label: reqUrl.split("/").pop() ?? "Unknown", lang: "en" })
      }
    })

    page.on("response", (response) => {
      const resUrl = response.url()
      if (resUrl.includes(".m3u8")) {
        foundUrls.push({ url: resUrl, type: "hls" })
      } else if (resUrl.includes(".mp4") && !resUrl.includes(".gif") && !resUrl.includes("favicon")) {
        foundUrls.push({ url: resUrl, type: "mp4" })
      }
    })

    // Navigate to the embed page and wait for network to settle
    await page.goto(embedUrl, {
      waitUntil: "networkidle2",
      timeout: 15000,
    })

    // Wait a bit more for JS to execute and load the video
    await new Promise((r) => setTimeout(r, 3000))

    // Also try to extract from the DOM (video element src, source tags)
    const domData = await page.evaluate(() => {
      const result: { videoSrc: string | null; sources: { url: string; quality: string }[]; subtitles: { url: string; label: string; lang: string }[] } = {
        videoSrc: null,
        sources: [],
        subtitles: [],
      }

      // Check <video> element
      const video = document.querySelector("video")
      if (video) {
        result.videoSrc = video.src || video.querySelector("source")?.src || null

        // Check for text tracks (subtitles)
        const tracks = video.querySelectorAll("track")
        tracks.forEach((track) => {
          if (track.src && track.kind === "subtitles") {
            result.subtitles.push({
              url: track.src,
              label: track.label || "Unknown",
              lang: track.srclang || "en",
            })
          }
        })
      }

      // Check for <source> elements
      const sourceEls = document.querySelectorAll("source")
      sourceEls.forEach((source) => {
        if (source.src) {
          result.sources.push({
            url: source.src,
            quality: source.getAttribute("label") || source.getAttribute("size") || "Auto",
          })
        }
      })

      // Check for iframes (some providers nest embeds)
      const iframes = document.querySelectorAll("iframe")
      iframes.forEach((iframe) => {
        if (iframe.src && (iframe.src.includes(".m3u8") || iframe.src.includes(".mp4"))) {
          result.sources.push({ url: iframe.src, quality: "Auto" })
        }
      })

      // Check for JSON-encoded sources in scripts
      const scripts = document.querySelectorAll("script")
      scripts.forEach((script) => {
        const text = script.textContent || ""
        // Look for sources: [{"file":"url","label":"quality"}]
        const jsonMatch = text.match(/\{\s*"file"\s*:\s*"([^"]+)"[^}]*?"label"\s*:\s*"([^"]*)"/gi)
        if (jsonMatch) {
          jsonMatch.forEach((m) => {
            const urlMatch = m.match(/"file"\s*:\s*"([^"]+)"/i)
            const labelMatch = m.match(/"label"\s*:\s*"([^"]*)"/i)
            if (urlMatch) {
              result.sources.push({
                url: urlMatch[1],
                quality: labelMatch?.[1] || "Auto",
              })
            }
          })
        }
        // Look for tracks/captions arrays
        const trackMatch = text.match(/\{\s*"file"\s*:\s*"([^"]+)"[^}]*?"label"\s*:\s*"([^"]*)"[^}]*?"kind"\s*:\s*"captions"/gi)
        if (trackMatch) {
          trackMatch.forEach((m) => {
            const urlMatch = m.match(/"file"\s*:\s*"([^"]+)"/i)
            const labelMatch = m.match(/"label"\s*:\s*"([^"]*)"/i)
            if (urlMatch) {
              result.subtitles.push({
                url: urlMatch[1],
                label: labelMatch?.[1] || "Unknown",
                lang: (labelMatch?.[1] || "").toLowerCase().includes("ar") ? "ar" : "en",
              })
            }
          })
        }
      })

      return result
    })

    // Merge network-found URLs with DOM-found URLs (deduplicate)
    const allSources: { url: string; quality: string }[] = []
    const seenUrls = new Set<string>()

    // Add network-found URLs first (these are the actual video streams)
    for (const found of foundUrls) {
      if (!seenUrls.has(found.url)) {
        seenUrls.add(found.url)
        allSources.push({ url: found.url, quality: found.type === "hls" ? "Auto (HLS)" : "SD" })
      }
    }

    // Add DOM-found sources
    for (const src of domData.sources) {
      if (!seenUrls.has(src.url)) {
        seenUrls.add(src.url)
        allSources.push(src)
      }
    }

    // Add video src if not already included
    if (domData.videoSrc && !seenUrls.has(domData.videoSrc)) {
      allSources.push({ url: domData.videoSrc, quality: "Auto" })
    }

    // Merge subtitles
    const allSubs = [...domData.subtitles]
    for (const sub of foundSubs) {
      if (!allSubs.some((s) => s.url === sub.url)) {
        allSubs.push(sub)
      }
    }

    // Pick the best source (prefer HLS for quality adaptation)
    const hlsSource = allSources.find((s) => s.url.includes(".m3u8"))
    const mp4Source = allSources.find((s) => s.url.includes(".mp4"))
    const bestSource = hlsSource ?? mp4Source ?? null

    return NextResponse.json({
      videoUrl: bestSource?.url ?? null,
      sources: allSources,
      subtitles: allSubs,
      embedUrl,
      provider,
      method: bestSource ? "puppeteer" : "failed",
    })
  } catch (e: any) {
    return NextResponse.json({
      videoUrl: null,
      sources: [],
      subtitles: [],
      error: e.message ?? "Extraction failed",
      embedUrl,
      provider,
      method: "error",
    }, { status: 500 })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
