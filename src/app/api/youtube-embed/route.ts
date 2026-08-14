import { NextRequest, NextResponse } from "next/server"

// GET /api/youtube-embed?key=cdx31ak4KbQ&mute=1
//
// Proxies the YouTube embed page through our server so the browser loads it
// same-origin. This bypasses YouTube's "Sign in to confirm you're not a bot"
// check that appears when autoplaying from non-whitelisted domains.
//
// The proxy:
// 1. Fetches the YouTube embed HTML server-side
// 2. Strips bot-check / concierge scripts
// 3. Adds a <base> tag so resources load from youtube.com
// 4. Returns the modified HTML with CORS headers

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const key = url.searchParams.get("key")
  const mute = url.searchParams.get("mute") !== "0"

  if (!key) {
    return new NextResponse("key required", { status: 400 })
  }

  try {
    const embedUrl = `https://www.youtube.com/embed/${key}?autoplay=1&${mute ? "mute=1&" : ""}controls=0&loop=1&playlist=${key}&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3`

    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.youtube.com/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return new NextResponse(`YouTube HTTP ${res.status}`, { status: res.status })
    }

    let html = await res.text()

    // Add <base> tag so relative URLs (CSS, JS, images) load from youtube.com
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="https://www.youtube.com/">`
    )

    // Strip bot-check / concierge scripts that trigger "Sign in to confirm"
    // These are inline scripts that check for cookies/domain and show the bot check
    html = html.replace(
      /<script[^>]*src="[^"]*concierge[^"]*"[^>]*><\/script>/gi,
      ""
    )
    html = html.replace(
      /<script[^>]*src="[^"]*botguard[^"]*"[^>]*><\/script>/gi,
      ""
    )

    // Remove the "Sign in to confirm you're not a bot" overlay if present
    html = html.replace(
      /<div[^>]*id="player-unavailable"[^>]*>[\s\S]*?<\/div>/gi,
      ""
    )

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Proxy error: ${error}`, { status: 500 })
  }
}
