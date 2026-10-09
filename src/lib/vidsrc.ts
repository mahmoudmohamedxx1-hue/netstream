// Streaming provider embed URL builders.
//
// ─── LIVE-TESTED CATALOG (real-browser verification, 2026-10-08) ─────────────
// Only providers verified end-to-end in a REAL browser (framed, player ready,
// correct runtime) are kept. Everything else was removed because every path
// is broken:
//
//   ✗ vidlink.pro / vidcore.io / vidfast.vc / player.videasy.to — the whole
//     vidlink family now ships a 3-probe anti-embed check in their React
//     chunks (frameElement sandbox attr + document.domain + an INVALID PDF
//     <object> whose onerror fires in EVERY framed load) → "Please Disable
//     Sandbox" whenever framed directly. Routed through /api/video-proxy the
//     page loads, but their stream API tokens are bound to the ORIGINAL
//     client IP — our server-side proxy fetch exits from a different IP →
//     the API returns no sources → player spins at "FETCHING DATA" forever.
//     Both paths dead → removed.
//   ✗ vidsrc.to / vidsrc.cc/v2 / vixsrc.to / streamingnow.mov (superembed) —
//     Cloudflare-walled: a real browser gets a permanent "Just a moment…"
//     challenge inside an iframe (vixsrc hard-blocks). → removed.
//   ✗ 2embed.skin — empty page through the proxy; isReallySandboxed() check
//     when direct. → removed.
//
//   ✓ VidSpark (moviesapi.to) — VERIFIED framed direct: nested
//     cdn.vidspark.to player + HLS backend, correct runtimes.
//     NOTE (2026-10-09 live re-test): VidSpark's catalog is spotty for
//     brand-new / regional titles (its upstream scrapers 502) — the player's
//     auto-fallback chain advances to the next server after a 50s no-play
//     window.
//   ✓ AnyEmbed (anyembed.xyz) — VERIFIED framed direct with BOTH id schemes
//     (/embed/imdb-movie-tt1375666, /embed/tmdb-movie-27205,
//      /embed/tmdb-tv-1396-1-5). Their old /embed/imdb-movie-… route 404s
//     when served through our proxy — must be iframed DIRECTLY.
//     ⚠ 2026-10-09 12:20 UTC: entire domain answers HTTP 451 (Cloudflare
//     legal block) — kept in the catalog because these providers flap in
//     and out; the auto-fallback chain skips it transparently while down.
//   ✓ ArabSeed (alking.mycima.cv) — search-based Arabic resolver via
//     /api/arabic-stream. Direct MP4s are CONTENT-VERIFIED through the
//     CDN's content-disposition filename (the site's download links are
//     frequently crossed with other titles' files — e.g. the عمر وسلمى
//     trilogy pages each serve «مسلسل سلمى الحلقة 9/12/20», and even the
//     الكبير أوي S8E1 page's file is a different-cut label; wrong files
//     are rejected before reaching the player).

export type Region = "Global" | "Arabic" | "Indonesian"

export type VideoSource = {
  id: string
  name: string
  quality: string
  tier: 1 | 2 | 3 | 4 | 5
  /** 1-2 character abbreviation shown in the logo badge. */
  logo: string
  /** Tailwind gradient classes used to color the logo badge. */
  color: string
  /** True if the provider's embed page is touch-friendly / responsive on phones. */
  mobile: boolean
  /** Geographic / language group used to bucket providers in the UI. */
  region: Region
  buildMovie: (imdbId: string) => string
  buildSeries: (imdbId: string, season: number, episode: number) => string
  /** If true, this provider uses TMDB IDs instead of IMDB IDs. */
  useTmdbId?: boolean
  /** Build movie URL using TMDB ID (when useTmdbId is true). */
  buildMovieTmdb?: (tmdbId: number) => string
  /** Build series URL using TMDB ID (when useTmdbId is true). */
  buildSeriesTmdb?: (tmdbId: number, season: number, episode: number) => string
  /**
   * Search-based provider (e.g. Arabic sites indexed by title, not by IMDB ID).
   * The player resolves these at runtime through /api/arabic-stream instead of
   * building a static embed URL. buildMovie/buildSeries are unused placeholders.
   */
  searchBased?: boolean
  /** Short human hint shown under the provider name in the dropdown. */
  note?: string
}

// ─── Verified working global providers (live-tested 2026-10-08) ──────────────
const TIER_1: VideoSource[] = [
  {
    id: "moviesapi.to",
    name: "VidSpark",
    quality: "1080p",
    tier: 1,
    logo: "VS",
    color: "from-cyan-500 to-blue-600",
    mobile: true,
    region: "Global",
    note: "Verified working",
    // moviesapi.to rebranded to VidSpark (same domain + embed paths). Serves a
    // top page that nests the cdn.vidspark.to player — works framed directly.
    // MUST NOT be routed through /api/video-proxy (their app renders blank
    // when served same-origin from another host).
    buildMovie: (id) => `https://moviesapi.to/movie/${id}`,
    buildSeries: (id, s, e) => `https://moviesapi.to/tv/${id}-${s}-${e}`,
  },
  {
    id: "anyembed",
    name: "AnyEmbed",
    quality: "1080p",
    tier: 1,
    logo: "AE",
    color: "from-teal-500 to-emerald-600",
    mobile: true,
    region: "Global",
    note: "Scans 20+ servers",
    // AnyEmbed is a client-side SPA: it MUST be iframed directly — through the
    // proxy it serves its "404 Page not found" shell. Supports both id schemes;
    // TMDB ids have the widest catalog coverage so we prefer them when known.
    useTmdbId: true,
    buildMovie: (id) => `https://anyembed.xyz/embed/imdb-movie-${id}`,
    buildSeries: (id, s, e) => `https://anyembed.xyz/embed/imdb-tv-${id}-${s}-${e}`,
    buildMovieTmdb: (tmdbId) => `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}-${s}-${e}`,
  },
]

// ─── Arabic / search-based providers ────────────────────────────────────────
// MyCima (ArabSeed) is live-tested end-to-end (2026-10):
//   search alking.mycima.cv/?s={arabicTitle} → title/episode page →
//   mycimafsd={base64} token in the raw HTML → decodes to a direct video-host
//   embed (fastvip.space, hglink.to, …) that plays in an iframe.
// The player resolves it at runtime via /api/arabic-stream — buildMovie /
// buildSeries are only placeholders so the dropdown can render a row.
const TIER_3: VideoSource[] = [
  {
    id: "mycima",
    name: "ArabSeed",
    quality: "HD",
    tier: 3,
    logo: "ع",
    color: "from-red-500 to-amber-600",
    mobile: true,
    region: "Arabic",
    searchBased: true,
    note: "Arabic movies & series",
    buildMovie: () => "https://alking.mycima.cv/",
    buildSeries: () => "https://alking.mycima.cv/",
  },
]

const ALL_SOURCES = [
  ...TIER_1,
  ...TIER_3,
]

// ── Preferred providers (ordered) ────────────────────────────────────────────
// 2026-10-08 live test: VidSpark is the strongest single provider (framed
// direct, correct runtimes, movie+series). AnyEmbed second (multi-server
// aggregator, TMDB-keyed catalog).
const PREFERRED_IDS = ["moviesapi.to", "anyembed"]

export const VIDEO_SOURCES: VideoSource[] = [
  // Preferred providers first (in order)
  ...PREFERRED_IDS.map(id => ALL_SOURCES.find(s => s.id === id)).filter((s): s is VideoSource => !!s),
  // Then all the rest (excluding preferred to avoid duplicates)
  ...ALL_SOURCES.filter(s => !PREFERRED_IDS.includes(s.id)),
]

// Primary servers shown by default in the dropdown (tiers 1 + 2).
export const PRIMARY_SOURCES = VIDEO_SOURCES.filter((s) => s.tier <= 2)
// Mobile-first providers (touch-friendly, responsive embeds).
export const MOBILE_SOURCES = VIDEO_SOURCES.filter((s) => s.tier === 1)
// Search-based Arabic providers (resolved via /api/arabic-stream at runtime).
export const SEARCH_SOURCES = VIDEO_SOURCES.filter((s) => s.searchBased)
// Arabic tab — search-based Arabic sources first, then the global providers
// (some Arabic titles — e.g. Netflix Arabic originals — exist on the global
// CDNs too and key off TMDB/IMDB IDs).
export const ARABIC_SOURCES: VideoSource[] = [
  ...SEARCH_SOURCES,
  ...VIDEO_SOURCES.filter((s) => s.id !== "mycima" && s.tier === 1 && s.region === "Global"),
]
// Dead providers are fully removed (2026-10-08) — no "Others" tab anymore.
export const OTHER_SOURCES: VideoSource[] = []

// Categorized tabs used by the player's Server dropdown. Each tab shows a
// label + icon and the sources that belong to it.
export type SourceTab = {
  id: string
  label: string
  emoji: string
  sources: VideoSource[]
}

export const SOURCE_TABS: SourceTab[] = [
  {
    id: "primary",
    label: "Primary",
    emoji: "⚡",
    sources: PRIMARY_SOURCES,
  },
  {
    id: "mobile",
    label: "Mobile",
    emoji: "📱",
    // All mobile-flagged providers, de-duped
    sources: Array.from(
      new Map(
        VIDEO_SOURCES.filter((s) => s.mobile && s.tier < 5).map((s) => [s.id, s])
      ).values()
    ),
  },
  {
    id: "arabic",
    label: "Arabic",
    emoji: "🌍",
    sources: ARABIC_SOURCES,
  },
].filter((tab) => tab.sources.length > 0)

// All distinct providers that are flagged mobile-friendly AND alive.
// Used by the mobile auto-fallback chain to cycle through until one plays.
export const MOBILE_FALLBACK_CHAIN = VIDEO_SOURCES.filter((s) => s.mobile && s.tier < 5)

export function getSource(id: string): VideoSource {
  return VIDEO_SOURCES.find((s) => s.id === id) ?? VIDEO_SOURCES[0]
}

export function isValidSourceId(id: string): boolean {
  return VIDEO_SOURCES.some((s) => s.id === id)
}

// Build a full player URL for a given title.
//
// Some providers (those with useTmdbId: true) prefer TMDB IDs over IMDB IDs.
// When `tmdbId` is provided AND the source declares useTmdbId, we route to
// the source's buildMovieTmdb / buildSeriesTmdb builders. Otherwise we fall
// back to the standard IMDB-keyed builders (which every source must define).
export function buildPlayerUrl(opts: {
  imdbId: string
  tmdbId?: number
  type: "movie" | "series"
  season?: number
  episode?: number
  sourceId?: string
}): string {
  const source = getSource(opts.sourceId ?? VIDEO_SOURCES[0].id)

  // Extract TMDB ID from the "tmdb-{id}" format (used when a title has no
  // IMDB ID — some providers like AnyEmbed support TMDB IDs)
  let tmdbId = opts.tmdbId
  if (!tmdbId && opts.imdbId?.startsWith("tmdb-")) {
    tmdbId = Number(opts.imdbId.replace("tmdb-", ""))
  }

  // If the source supports TMDB IDs and we have one, use it
  if (source.useTmdbId && tmdbId && source.buildMovieTmdb) {
    if (opts.type === "series" && source.buildSeriesTmdb) {
      return source.buildSeriesTmdb(
        tmdbId,
        opts.season ?? 1,
        opts.episode ?? 1,
      )
    }
    return source.buildMovieTmdb(tmdbId)
  }

  // Fall back to IMDB ID (skip the "tmdb-" prefix — those providers don't
  // support TMDB IDs, so the title won't play on them. The auto-fallback
  // will switch to a TMDB-supporting provider.)
  const imdbId = opts.imdbId?.startsWith("tmdb-") ? "" : opts.imdbId
  if (opts.type === "series") {
    return source.buildSeries(imdbId, opts.season ?? 1, opts.episode ?? 1)
  }
  return source.buildMovie(imdbId)
}

// Validate an IMDB id (e.g. "tt0111161"). Tolerant: adds "tt" prefix if missing.
export function normalizeImdbId(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase()
  if (!cleaned) return null
  if (/^\d+$/.test(cleaned)) {
    return `tt${cleaned.padStart(7, "0")}`
  }
  if (/^tt\d{7,}$/.test(cleaned)) return cleaned
  if (/^tt\d+$/.test(cleaned)) return cleaned
  return null
}

export function isValidImdbId(raw: string): boolean {
  return normalizeImdbId(raw) !== null
}
