import { NextRequest, NextResponse } from "next/server"

// GET /api/provider-check?url=https://vidfast.pro/movie/tt35512499
// Lightweight single-URL check — does a HEAD request and returns whether the
// provider is responding with HTTP 200. Used by the player modal to pre-check
// a provider before loading it in the iframe, so the user never sees a broken
// page icon when a provider returns 502/403/etc.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const targetUrl = url.searchParams.get("url")

  if (!targetUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  // Basic URL validation — must be a valid http(s) URL
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  if (!parsed.protocol.startsWith("http")) {
    return NextResponse.json({ error: "only http(s) urls allowed" }, { status: 400 })
  }

  try {
    const res = await fetch(parsed.href, {
      method: "GET",
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      url: parsed.href,
    })
  } catch (e: any) {
    // Timeout, DNS failure, connection refused, etc.
    return NextResponse.json({
      ok: false,
      status: 0,
      error: e?.name === "TimeoutError" ? "timeout" : (e?.message ?? "fetch error"),
      url: parsed.href,
    })
  }
}
