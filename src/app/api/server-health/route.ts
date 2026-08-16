import { NextRequest, NextResponse } from "next/server"
import { VIDEO_SOURCES } from "@/lib/vidsrc"

// GET /api/server-health?imdbId=tt0111161
//
// Live server health-check endpoint. Tests ALL providers from VIDEO_SOURCES in
// parallel by sending a GET request to each provider's movie embed URL for the
// given title. Records ok/dead/timeout status + latency for each provider.
// Results are cached in-memory for 1 hour per imdbId.
//
// Runs entirely server-side (sandbox network) so the browser doesn't have to
// fan out 24+ cross-origin requests. Works in production — no localhost fetch,
// imports VIDEO_SOURCES directly from @/lib/vidsrc.
//
// Response shape:
//   {
//     results: [{ id, name, ok, latencyMs, tier, region, status }],
//     testedAt: number,  // epoch ms
//     count: number,     // === results.length
//     cached?: boolean   // true when served from cache
//   }
//
// Results are sorted: working servers first (by latency asc), then dead/timeout.

type HealthResult = {
  id: string
  name: string
  ok: boolean
  latencyMs: number
  tier: number
  region: string
  status: "ok" | "dead" | "timeout"
}

type HealthEntry = {
  testedAt: number
  results: HealthResult[]
}

// In-memory cache. Keyed by imdbId. Survives for the lifetime of the dev /
// serverless process. TTL: 1 hour.
const CACHE = new Map<string, HealthEntry>()
const TTL_MS = 60 * 60 * 1000 // 1 hour
const TIMEOUT_MS = 5000 // 5 seconds per provider (per task spec)

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  // Default to The Shawshank Redemption (tt0111161) — a universally-available
  // title that every provider should have in their catalog.
  const imdbId = url.searchParams.get("imdbId") ?? "tt0111161"
  const force = url.searchParams.get("force") === "1"

  // Serve from cache if fresh
  const hit = CACHE.get(imdbId)
  if (hit && !force && Date.now() - hit.testedAt < TTL_MS) {
    return NextResponse.json({
      results: hit.results,
      testedAt: hit.testedAt,
      count: hit.results.length,
      cached: true,
    })
  }

  // Test every provider in parallel. Each provider's movie embed URL is fetched
  // with a 5s timeout. We treat:
  //   - 2xx / 3xx → "ok"
  //   - 403       → "ok" (provider blocks server-side requests but still
  //                        renders in browser iframes — same heuristic as
  //                        /api/provider-latency)
  //   - other 4xx/5xx → "dead"
  //   - AbortError / TimeoutError → "timeout"
  //   - other network errors → "dead"
  //
  // We use the movie embed URL (source.buildMovie) even for TMDB-keyed
  // providers — the host still responds even if the specific ID isn't
  // recognized, which is sufficient for a reachability test.
  const results: HealthResult[] = await Promise.all(
    VIDEO_SOURCES.map(async (source): Promise<HealthResult> => {
      const playerUrl = source.buildMovie(imdbId)
      const t0 = Date.now()
      try {
        const res = await fetch(playerUrl, {
          method: "GET",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "follow",
          headers: {
            "User-Agent": USER_AGENT,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        })
        const latencyMs = Date.now() - t0
        const ok = res.ok || res.status === 403
        return {
          id: source.id,
          name: source.name,
          ok,
          latencyMs,
          tier: source.tier,
          region: source.region,
          status: ok ? "ok" : "dead",
        }
      } catch (err: unknown) {
        const latencyMs = Date.now() - t0
        const e = err as { name?: string; message?: string } | null
        const isTimeout =
          e?.name === "TimeoutError" ||
          e?.name === "AbortError" ||
          /timeout|abort/i.test(String(e?.message ?? ""))
        return {
          id: source.id,
          name: source.name,
          ok: false,
          latencyMs,
          tier: source.tier,
          region: source.region,
          status: isTimeout ? "timeout" : "dead",
        }
      }
    })
  )

  // Sort: working first (by latency asc), then dead/timeout ones.
  results.sort(
    (a, b) => Number(b.ok) - Number(a.ok) || a.latencyMs - b.latencyMs
  )

  const testedAt = Date.now()
  CACHE.set(imdbId, { testedAt, results })

  return NextResponse.json({
    results,
    testedAt,
    count: results.length,
    cached: false,
  })
}
