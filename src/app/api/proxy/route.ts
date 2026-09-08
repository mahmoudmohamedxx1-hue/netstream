import { NextRequest, NextResponse } from "next/server"

// GET /api/proxy?url=<provider_url>
// Fetches the provider page server-side and returns it with modified headers
// so the provider can't detect it's being embedded in an iframe.
// This bypasses "Sandbox not allowed" and "Session verification failed" errors.
export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: url,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Provider returned ${res.status}` }, { status: 502 })
    }

    const html = await res.text()

    // Modify the HTML to:
    // 1. Set window.top = window.self (bust frame detection)
    // 2. Remove X-Frame-Options checks
    // 3. Allow playback
    const modified = html
      .replace(
        /<head>/i,
        `<head><script>
          // Anti-frame-detection — make the provider think we're the top window
          try {
            Object.defineProperty(window, 'top', { get: () => window });
            Object.defineProperty(window, 'self', { get: () => window });
            Object.defineProperty(window, 'parent', { get: () => window });
            Object.defineProperty(window, 'frameElement', { get: () => null });
          } catch(e) {}
        </script>`
      )
      // Remove any X-Frame-Options meta tags
      .replace(/<meta[^>]*frame-options[^>]*>/gi, "")

    return new NextResponse(modified, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
      },
    })
  } catch (e) {
    console.error("[api/proxy] error:", e)
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 })
  }
}
