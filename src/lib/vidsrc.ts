// Streaming provider embed URL builders.
// Providers grouped into tiers by reliability:
//   Tier 1: Verified best (live-tested 2026-10)
//   Tier 2: Reliable backups
//   Tier 3: Arabic / search-based (resolved at runtime via /api/arabic-stream)
//
// Live-tested 2026-10 (real-browser verification; Cloudflare-managed providers
// can still work from residential IPs even when blocked from datacenters):
//   ✓ Verified player end-to-end: vidspark (moviesapi.to rebrand)
//   ✓ 200 + player markup: vidlink.pro (TMDB ids ONLY — imdb ids → "couldn't
//     find this content"), vidcore.io, 2embed.skin (via proxy — see below),
//     anyembed.xyz, vidfast.vc (domain rotated from vidfast.pro)
//   ⚠ Domain rotations this pass: vidfast.pro→vidfast.vc,
//     player.videasy.net→player.videasy.to (DDoS-Guard),
//     multiembed.mov→streamingnow.mov (CF challenge — kept as backup tier)
//   ✗ DEAD / degraded (removed 2026-10): vidsrc.su ("No available servers"
//     backend-wide on 2 blockbuster titles), 2embed.stream (empty 200),
//     vidjoy.pro, vidsrc.dev/xyz, cineby, embed.su, autoembed, 111movies,
//     blackvid, vidsrc.pro, 2embed.org, vidsrc.me/io, gomo, twojar, sudostream,
//     rivestream, mosahim, vidzee.wtf (player backend 500s)
//   ⚠ 2embed.skin: their isReallySandboxed() false-positives when framed in
//     modern Chrome (document.domain setter throws) → "Sandbox not allowed"
//     overlay. ALWAYS load through /api/video-proxy (alwaysProxy flag) which
//     neutralizes the check.

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
  /**
   * Always route this provider's embed through /api/video-proxy — on every
   * device, with the ad-blocker on or off. Used for providers whose own JS
   * false-positives a sandbox check when framed directly (2embed.skin).
   */
  alwaysProxy?: boolean
}

// ─── Tier 1: Verified working providers (live-tested 2026-10) ───────────────
const TIER_1: VideoSource[] = [
  {
    id: "vidlink.pro",
    name: "VidLink",
    quality: "1080p",
    tier: 1,
    logo: "VL",
    color: "from-indigo-500 to-purple-600",
    mobile: true,
    region: "Global",
    useTmdbId: true,
    buildMovie: (id) => `https://vidlink.pro/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://vidlink.pro/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`,
  },
  {
    id: "videasy.net",
    name: "Videasy",
    quality: "1080p",
    tier: 1,
    logo: "VE",
    color: "from-emerald-500 to-green-600",
    mobile: true,
    region: "Global",
    useTmdbId: true,
    // Domain rotated 2026-10: player.videasy.net 301→ player.videasy.to
    buildMovie: (id) => `https://player.videasy.to/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://player.videasy.to/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://player.videasy.to/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://player.videasy.to/tv/${tmdbId}/${s}/${e}`,
  },
  {
    id: "vidfast.pro",
    name: "VidFast",
    quality: "1080p",
    tier: 1,
    logo: "VF",
    color: "from-orange-500 to-red-600",
    mobile: true,
    region: "Global",
    useTmdbId: true,
    // Domain rotated 2026-10: vidfast.pro 301→ vidfast.vc
    buildMovie: (id) => `https://vidfast.vc/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidfast.vc/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://vidfast.vc/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://vidfast.vc/tv/${tmdbId}/${s}/${e}`,
  },
  {
    id: "vidcore.net",
    name: "VidCore",
    quality: "1080p",
    tier: 1,
    logo: "VC",
    color: "from-rose-500 to-pink-600",
    mobile: true,
    region: "Global",
    // Domain moved: vidcore.net → vidcore.io (2026-10). Kept the provider id
    // stable ("vidcore.net") so saved last-provider prefs keep working.
    buildMovie: (id) => `https://vidcore.io/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidcore.io/tv/${id}/${s}/${e}`,
  },
  {
    id: "superembed",
    name: "SuperEmbed",
    quality: "Multi",
    tier: 1,
    logo: "SE",
    color: "from-cyan-500 to-teal-600",
    mobile: true,
    region: "Global",
    // multiembed.mov now 403-redirects to streamingnow.mov (same service,
    // CF-managed challenge). Kept — real browsers usually pass the challenge.
    buildMovie: (id) => `https://streamingnow.mov/?video_id=${id}&tmdb=`,
    buildSeries: (id, s, e) =>
      `https://streamingnow.mov/?video_id=${id}&tmdb=&s=${s}&e=${e}`,
  },
  {
    id: "anyembed",
    name: "AnyEmbed",
    quality: "Multi",
    tier: 1,
    logo: "AE",
    color: "from-teal-500 to-emerald-600",
    mobile: true,
    region: "Global",
    note: "Scans 20+ servers",
    buildMovie: (id) => `https://anyembed.xyz/embed/imdb-movie-${id}`,
    buildSeries: (id, s, e) =>
      `https://anyembed.xyz/embed/imdb-tv-${id}-${s}-${e}`,
  },
  {
    id: "vixsrc.to",
    name: "VixSrc",
    quality: "1080p",
    tier: 1,
    logo: "VX",
    color: "from-indigo-500 to-blue-700",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vixsrc.to/movie/${id}?autoPlay=true&lang=en`,
    buildSeries: (id, s, e) => `https://vixsrc.to/tv/${id}/${s}/${e}?autoPlay=true&lang=en`,
  },
  {
    id: "vidsrc.cc.v2",
    name: "VidSrc.cc v2",
    quality: "HD",
    tier: 1,
    logo: "V2",
    color: "from-amber-500 to-yellow-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}?autoPlay=false`,
    buildSeries: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}?autoPlay=false`,
  },
  {
    id: "moviesapi.to",
    name: "VidSpark",
    quality: "HD",
    tier: 1,
    logo: "VS",
    color: "from-cyan-500 to-blue-600",
    mobile: true,
    region: "Global",
    note: "Verified working",
    // moviesapi.to rebranded to VidSpark (same domain + embed paths).
    buildMovie: (id) => `https://moviesapi.to/movie/${id}`,
    buildSeries: (id, s, e) => `https://moviesapi.to/tv/${id}-${s}-${e}`,
  },
]

// ─── Tier 2: Backups (alive but flaky from some IPs / rate-limited) ─────────
const TIER_2: VideoSource[] = [
  {
    id: "2embed.skin",
    name: "2Embed",
    quality: "1080p",
    tier: 2,
    logo: "2E",
    color: "from-emerald-500 to-teal-600",
    mobile: true,
    region: "Global",
    alwaysProxy: true,
    // 2embed.skin serves the old 2embed.cc catalog. MUST be proxied: their
    // isReallySandboxed() check throws on modern Chrome's disabled
    // document.domain setter → false "Sandbox not allowed" overlay when
    // framed directly. /api/video-proxy neutralizes the check.
    buildMovie: (id) => `https://www.2embed.skin/embed/movie?id=${id}`,
    buildSeries: (id, s, e) =>
      `https://www.2embed.skin/embed/tv?id=${id}&s=${s}&e=${e}`,
  },
  {
    id: "vidsrc.to",
    name: "VidSrc.to",
    quality: "1080p",
    tier: 2,
    logo: "VS",
    color: "from-orange-500 to-amber-600",
    mobile: true,
    region: "Global",
    // Now wraps vsembed.ru — works, but Cloudflare-gated in some regions.
    buildMovie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}-${e}`,
  },
]

// ─── Tier 3: Arabic / search-based providers ────────────────────────────────
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
  ...TIER_2,
  ...TIER_3,
]

// ── Preferred providers (top 5, ordered) ────────────────────────────────────
// Updated 2026-10 after real-browser testing: vidsrc.su dropped ("No available
// servers" backend-wide), VidSpark (ex-MoviesApi) promoted (verified working
// end-to-end), vidlink kept (works again now that the player passes TMDB ids).
const PREFERRED_IDS = ["vidcore.net", "vidlink.pro", "vidfast.pro", "moviesapi.to", "superembed"]

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
// CDNs too and key off TMDB IDs).
export const ARABIC_SOURCES: VideoSource[] = [
  ...SEARCH_SOURCES,
  ...VIDEO_SOURCES.filter((s) => s.id !== "mycima" && s.tier === 1 && s.region === "Global"),
]
// Dead providers are fully removed (2026-10) — no "Others" tab anymore.
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
  // IMDB ID — some providers like vidlink, vidfast, videasy support TMDB IDs)
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
