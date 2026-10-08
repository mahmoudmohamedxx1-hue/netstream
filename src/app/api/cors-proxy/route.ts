import { NextRequest, NextResponse } from "next/server"

// GET/POST/… /api/cors-proxy?url=<absolute-url>
//
// Generic CORS-enabling passthrough for the video-proxy player pages.
// Provider embed pages (vidlink etc.) are served same-origin through
// /api/video-proxy, so their OWN API calls become cross-origin — and assets
// that don't send Access-Control-Allow-Origin (e.g. vidlink.pro/fu.wasm,
// their WebAssembly stream decryptor) fail with "TypeError: Failed to fetch",
// leaving the player stuck at "Fetching Data, Please wait…". The URL shim
// injected by the video proxy retries failed fetches through this route,
// which forwards the request server-side (no CORS from the browser's view)
// and returns the bytes with permissive CORS headers.

// Headers never forwarded from the browser request (hop-by-hop, or ones we
// set ourselves server-side).
const SKIP_REQ_HEADERS = new Set([
  "host", "connection", "content-length", "accept-encoding",
  "origin", "referer", "user-agent", "cookie", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "sec-fetch-mode", "sec-fetch-site",
  "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
])
// Response headers we copy back (everything else is rebuilt).
const PASS_RES_HEADERS = [
  "content-type", "content-range", "content-length", "accept-ranges",
  "etag", "last-modified", "cache-control",
]

async function handle(req: NextRequest, method: string): Promise<NextResponse> {
  const url = new URL(req.url)
  const target = url.searchParams.get("url")
  if (!target || !/^https?:\/\//i.test(target)) {
    return new NextResponse("url required", { status: 400 })
  }
  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return new NextResponse("invalid url", { status: 400 })
  }

  // Forward the original request headers (minus hop-by-hop/browser noise).
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: req.headers.get("accept") ?? "*/*",
    Referer: targetUrl.origin + "/",
  }
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (!SKIP_REQ_HEADERS.has(k) && k !== "accept") headers[key] = value
  })

  let body: ArrayBuffer | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer()
    if (body.byteLength === 0) body = undefined
  }

  try {
    const res = await fetch(targetUrl.href, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    })
    const buf = await res.arrayBuffer()
    const out = new Headers()
    for (const h of PASS_RES_HEADERS) {
      const v = res.headers.get(h)
      if (v) out.set(h, v)
    }
    if (!out.has("content-type")) {
      out.set("content-type", "application/octet-stream")
    }
    out.set("Access-Control-Allow-Origin", "*")
    out.set("Access-Control-Allow-Headers", "*")
    out.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
    return new NextResponse(buf, { status: res.status, headers: out })
  } catch {
    return new NextResponse("upstream fetch failed", { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req, "GET")
}
export async function HEAD(req: NextRequest) {
  return handle(req, "HEAD")
}
export async function POST(req: NextRequest) {
  return handle(req, "POST")
}
export async function PUT(req: NextRequest) {
  return handle(req, "PUT")
}
export async function PATCH(req: NextRequest) {
  return handle(req, "PATCH")
}
export async function DELETE(req: NextRequest) {
  return handle(req, "DELETE")
}
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    },
  })
}
