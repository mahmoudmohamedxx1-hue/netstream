// Streaming provider embed URL builders.
//
// ─── CATALOG RESTORED (2026-10-10) ──────────────────────────────────────────
// Restored the FULL global provider catalog as it stood at commit 372464f
// (the era when every non-Arabic title could find a working server). The
// 2026-10-08 purge had cut the catalog to 2 global providers — correct from
// the datacenter this app is developed in, but residential users (the real
// audience) reach providers that datacenter egress cannot (Cloudflare walls,
// anti-embed probes and IP-bound stream tokens all resolve fine from home
// IPs). The catalog is therefore back at full width, in the era's exact
// tiers/URLs/preferred order:
//   PREFERRED_IDS = vidfast.pro, vidcore.net, superembed, moviesapi.to,
//                   2embed.cc   (user-tuned order from the 372464f era)
//
// ARABIC stays exactly as the latest version (per user instruction):
//   ArabSeed (mycina) — the ONLY Arabic provider, search-based, resolved at
//   runtime via /api/arabic-stream with content-disposition verification
//   (crossed files are rejected before reaching the player). The era's dead
//   Arabic providers (EgyDead/EgyBest/Shahid4u/FaselHD/ArabEmbed/Trembed/
//   Gomoov) are NOT restored.
//
// AnyEmbed keeps its TMDB id builders (needed for tmdb-only titles) and
// moviesapi.to keeps the VidSpark rebrand — same domain + embed paths as
// the era's MoviesApi entry.

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

// ─── Tier 1: Best providers (372464f era, tested 2025-01) ──────────────────
// Order matters within a tier only for documentation — the effective order
// comes from PREFERRED_IDS below.
const TIER_1: VideoSource[] = [
  {
    id: "2embed.cc",
    name: "2Embed",
    quality: "1080p",
    tier: 1,
    logo: "2E",
    color: "from-emerald-500 to-teal-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://www.2embed.cc/embed/${id}`,
    buildSeries: (id, s, e) =>
      `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
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
  {
    id: "vidsrc.me",
    name: "MoviesHub",
    quality: "HD",
    tier: 1,
    logo: "MH",
    color: "from-violet-500 to-purple-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.me/embed/movie?imdb=${id}`,
    buildSeries: (id, s, e) =>
      `https://vidsrc.me/embed/tv?imdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "vidsrc.in",
    name: "VidSrc.in",
    quality: "HD",
    tier: 1,
    logo: "VI",
    color: "from-yellow-500 to-orange-500",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.in/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.in/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: "smashystream",
    name: "SmashyStream",
    quality: "Multi",
    tier: 1,
    logo: "SS",
    color: "from-fuchsia-500 to-pink-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://embed.smashystream.com/playere.php?imdb=${id}`,
    buildSeries: (id, s, e) =>
      `https://embed.smashystream.com/playere.php?imdb=${id}&season=${s}&episode=${e}`,
  },
]

// ─── Tier 1b: Direct video hosts behind 2Embed's server mirrors (era) ───────
//   vidsrc.hair  (2Embed "Xps" server) — IMDB ID
//   cineby.hair  (2Embed "Cnby" server) — TMDB ID (tier 5 in the era: Others)
//   vidcore.net  (2Embed "Vcr" server) — TMDB ID
const TIER_1B: VideoSource[] = [
  {
    id: "vidsrc.hair",
    name: "VidSrc.Hair",
    quality: "1080p",
    tier: 1,
    logo: "VH",
    color: "from-teal-500 to-cyan-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.hair/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.hair/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "cineby.hair",
    name: "Cineby",
    quality: "1080p",
    tier: 5,
    logo: "CB",
    color: "from-purple-500 to-violet-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://cineby.hair/movie/${id}?autostart=true`,
    buildSeries: (id, s, e) => `https://cineby.hair/tv/${id}/${s}/${e}?autostart=true`,
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
    useTmdbId: true,
    buildMovie: (id) => `https://vidcore.net/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidcore.net/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://vidcore.net/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) => `https://vidcore.net/tv/${tmdbId}/${s}/${e}`,
  },
]

// ─── Tier 1c: Modern embed aggregators (era, 2025) ──────────────────────────
const TIER_1C: VideoSource[] = [
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
    buildMovie: (id) => `https://player.videasy.net/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://player.videasy.net/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://player.videasy.net/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`,
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
    buildMovie: (id) => `https://vidfast.pro/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}`,
    buildMovieTmdb: (tmdbId) => `https://vidfast.pro/movie/${tmdbId}`,
    buildSeriesTmdb: (tmdbId, s, e) =>
      `https://vidfast.pro/tv/${tmdbId}/${s}/${e}`,
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
    // multiembed.mov variant accepting BOTH the IMDB id (video_id=) and the
    // TMDB id (tmdb=). Empty tmdb= means "not provided" → IMDB lookup.
    buildMovie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=`,
    buildSeries: (id, s, e) =>
      `https://multiembed.mov/?video_id=${id}&tmdb=&s=${s}&e=${e}`,
  },
  {
    id: "vidjoy.pro",
    name: "VidJoy",
    quality: "HD",
    tier: 1,
    logo: "VJ",
    color: "from-pink-500 to-rose-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidjoy.pro/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://vidjoy.pro/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "rivestream",
    name: "RiveStream",
    quality: "HD",
    tier: 5,
    logo: "RS",
    color: "from-violet-500 to-indigo-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://rivestream.xyz/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://rivestream.xyz/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "111movies",
    name: "111movies",
    quality: "HD",
    tier: 1,
    logo: "1M",
    color: "from-amber-500 to-orange-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://111movies.com/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://111movies.com/embed/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 1D: Additional providers (Flickv4/Zangetsu/VortX/TMDB-Player era) ──
const TIER_1D: VideoSource[] = [
  {
    id: "2embed.to",
    name: "2Embed.to",
    quality: "1080p",
    tier: 5,
    logo: "2T",
    color: "from-emerald-500 to-green-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://www.2embed.to/embed/tmdb/movie/${id}`,
    buildSeries: (id, s, e) => `https://www.2embed.to/embed/tmdb/tv/${id}/${s}/${e}`,
  },
  {
    id: "blackvid",
    name: "BlackVid",
    quality: "1080p",
    tier: 5,
    logo: "BV",
    color: "from-gray-600 to-gray-800",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://blackvid.space/embed/${id}`,
    buildSeries: (id, s, e) => `https://blackvid.space/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: "embedsu",
    name: "Embed.su",
    quality: "Multi",
    tier: 5,
    logo: "ES",
    color: "from-blue-500 to-indigo-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://embed.su/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc.xyz",
    name: "VidSrc.xyz",
    quality: "HD",
    tier: 1,
    logo: "VX",
    color: "from-red-500 to-rose-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.dev/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.dev/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "multiembed.mov",
    name: "MultiEmbed",
    quality: "Multi",
    tier: 1,
    logo: "ME",
    color: "from-purple-500 to-violet-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://multiembed.mov/?video_id=${id}`,
    buildSeries: (id, s, e) => `https://multiembed.mov/?video_id=${id}&s=${s}&e=${e}`,
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    quality: "1080p",
    tier: 5,
    logo: "AU",
    color: "from-teal-500 to-cyan-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://autoembed.cc/embed/player.php?id=${id}`,
    buildSeries: (id, s, e) => `https://autoembed.cc/embed/player.php?id=${id}&s=${s}&e=${e}`,
  },
  {
    id: "vidsrc.stream",
    name: "VidSrc.stream",
    quality: "HD",
    tier: 1,
    logo: "VS",
    color: "from-orange-500 to-red-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.io/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.io/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "2embed.org",
    name: "2Embed.org",
    quality: "1080p",
    tier: 5,
    logo: "2O",
    color: "from-green-500 to-emerald-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://www.2embed.org/embed/${id}`,
    buildSeries: (id, s, e) => `https://www.2embed.org/embedtv/${id}&s=${s}&e=${e}`,
  },
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
]

// ─── Tier 2: Backup servers (work from curl; may 403 in browser iframes) ────
const TIER_2: VideoSource[] = [
  {
    id: "vidsrc.to",
    name: "VidSrc.to",
    quality: "1080p",
    tier: 2,
    logo: "VS",
    color: "from-orange-500 to-amber-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: "2embed.stream",
    name: "2Embed.stream",
    quality: "1080p",
    tier: 5,
    logo: "2S",
    color: "from-cyan-500 to-blue-500",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://2embed.stream/embed/${id}`,
    buildSeries: (id, s, e) =>
      `https://2embed.stream/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: "2embed.skin",
    name: "2Embed.skin",
    quality: "1080p",
    tier: 2,
    logo: "2K",
    color: "from-lime-500 to-green-600",
    mobile: false,
    region: "Global",
    buildMovie: (id) => `https://www.2embed.skin/embed/movie?id=${id}`,
    buildSeries: (id, s, e) =>
      `https://www.2embed.skin/embed/tv?id=${id}&s=${s}&e=${e}`,
  },
  {
    id: "vidsrc.pro",
    name: "VidSrc.pro",
    quality: "HD",
    tier: 2,
    logo: "VP",
    color: "from-sky-500 to-indigo-500",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.pro/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: "vidsrc.cc",
    name: "VidSrc.cc",
    quality: "HD",
    tier: 2,
    logo: "VC",
    color: "from-red-500 to-orange-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 3: Arabic / search-based — KEPT AS THE LATEST VERSION ─────────────
// ArabSeed (MyCima) is the ONLY Arabic provider (2026-10 state):
//   search alking.mycima.cv/?s={arabicTitle} → title/episode page →
//   mycimafsd={base64} token → direct video-host embed, CONTENT-VERIFIED via
//   the CDN's content-disposition filename (crossed files are rejected before
//   reaching the player). The 372464f-era Arabic providers (EgyDead, EgyBest,
//   Shahid4u, FaselHD, ArabEmbed, Trembed, Gomoov) are intentionally NOT
//   restored — Arabic playback keeps the current, verified pipeline.
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

// ─── Tier 5: "Others" — dead-from-datacenter / unverified globals (era) ────
// Kept (NOT removed) so: (1) users with a working provider saved as "last
// used" still see it; (2) if a provider comes back online it's already wired
// in; (3) the "Others" tab lets users try them manually. The dropdown shows
// them greyed with a "⚠ dead" badge until health data proves otherwise.
const TIER_5: VideoSource[] = [
  {
    id: "vidsrc.net",
    name: "VidSrc.net",
    quality: "HD",
    tier: 5,
    logo: "VS",
    color: "from-rose-500 to-red-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.to/embed/movie?imdb=${id}`,
    buildSeries: (id, s, e) =>
      `https://vidsrc.to/embed/tv?imdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "twojar",
    name: "Twojar",
    quality: "HD",
    tier: 5,
    logo: "TJ",
    color: "from-amber-500 to-yellow-600",
    mobile: false,
    region: "Global",
    buildMovie: (id) => `https://www.twojar.com/embed/${id}`,
    buildSeries: (id, s, e) => `https://www.twojar.com/tv/${id}/${s}/${e}`,
  },
  {
    id: "gomo",
    name: "Gomo.to",
    quality: "HD",
    tier: 5,
    logo: "GO",
    color: "from-red-500 to-rose-700",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://gomo.to/movie/${id}`,
    buildSeries: (id, s, e) => `https://gomo.to/tv/${id}/${s}-${e}`,
  },
  {
    id: "nonton",
    name: "NontonGo",
    quality: "HD",
    tier: 5,
    logo: "NG",
    color: "from-emerald-600 to-teal-700",
    mobile: true,
    region: "Indonesian",
    buildMovie: (id) => `https://nonton.id/embed/${id}`,
    buildSeries: (id, s, e) => `https://nonton.id/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "sudostream",
    name: "SudoStream",
    quality: "HD",
    tier: 5,
    logo: "SD",
    color: "from-slate-500 to-gray-700",
    mobile: false,
    region: "Global",
    buildMovie: (id) => `https://sudostream.com/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://sudostream.com/embed/tv/${id}/${s}/${e}`,
  },
]

// ── Preferred providers (372464f-era user-tuned order) ──────────────────────
// These are moved to the front of VIDEO_SOURCES so they appear first in the
// server dropdown, are the session default, and are tried first by the
// auto-switch logic.
const PREFERRED_IDS = ["vidfast.pro", "vidcore.net", "superembed", "moviesapi.to", "2embed.cc"]

const ALL_SOURCES = [
  ...TIER_1,
  ...TIER_1B,
  ...TIER_1C,
  ...TIER_1D,
  ...TIER_2,
  ...TIER_3,
  ...TIER_5,
]

export const VIDEO_SOURCES: VideoSource[] = [
  // Preferred providers first (in user-specified order)
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
// Arabic tab — search-based Arabic sources first (kept as latest version),
// then the global providers (some Arabic titles — e.g. Netflix Arabic
// originals — exist on the global CDNs too and key off TMDB/IMDB IDs).
export const ARABIC_SOURCES: VideoSource[] = [
  ...SEARCH_SOURCES,
  ...VIDEO_SOURCES.filter(s => s.id !== "mycima" && s.tier === 1 && s.region === "Global"),
]
// "Others" — dead/unverified providers kept for manual access (era behavior).
export const OTHER_SOURCES: VideoSource[] = VIDEO_SOURCES.filter((s) => s.tier === 5)
// Advanced multi-source servers (none currently — tier 3 is Arabic-only).
export const ADVANCED_SOURCES: VideoSource[] = VIDEO_SOURCES.filter((s) => s.tier === 3 && s.region === "Global")

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
  {
    id: "others",
    label: "Others",
    emoji: "⚠",
    sources: OTHER_SOURCES,
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
  // IMDB ID — some providers support TMDB IDs)
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
