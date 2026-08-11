// Streaming provider embed URL builders.
// Providers grouped into tiers by reliability:
//   Tier 1: User-confirmed best (PC: vidsrc.to/2Embed/AnyEmbed; Mobile: MultiEmbed/SmashyStream)
//   Tier 2: Reliable backups
//   Tier 3: Arabic / Regional
//   Tier 5: "Others" — currently dead/unverified, kept for manual access

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
}

// ─── Tier 1: Best providers that work in browser iframes (tested 2025-01) ──
// Order matters: the FIRST entry is the default provider. 2Embed.cc is first
// because vidsrc.to returns 403 in browser iframes (blocks them), while
// 2Embed.cc returns 200 and renders a video player.
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
    quality: "Multi",
    tier: 1,
    logo: "AE",
    color: "from-teal-500 to-emerald-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://anyembed.xyz/embed/imdb-movie-${id}`,
    buildSeries: (id, s, e) =>
      `https://anyembed.xyz/embed/imdb-tv-${id}-${s}-${e}`,
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

// ─── Tier 1b: Direct video hosts discovered behind 2Embed's server mirrors ──
// 2Embed.cc has 3 server mirrors (Xps, Cnby, Vcr) that each load a DIFFERENT
// video host. We add these hosts directly so they appear as separate providers:
//   vidsrc.hair  (2Embed "Xps" server) — uses IMDB ID
//   cineby.hair  (2Embed "Cnby" server) — uses TMDB ID
//   vidcore.net  (2Embed "Vcr" server) — uses TMDB ID
// These hosts often have different video sources/qualities than the main
// 2Embed embed, giving users more streaming + download options.
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
    tier: 1,
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
    buildMovie: (id) => `https://vidcore.net/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidcore.net/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 2: Backup servers (work from curl but may 403 in browser iframes) ──
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
    tier: 2,
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
  {
    id: "multiembed",
    name: "MultiEmbed",
    quality: "Multi",
    tier: 2,
    logo: "ME",
    color: "from-purple-500 to-fuchsia-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://multiembed.mov/?video_id=${id}`,
    buildSeries: (id, s, e) =>
      `https://multiembed.mov/?video_id=${id}&s=${s}&e=${e}`,
  },
]

// ─── Tier 3: Arabic / Regional (ImZaw repo: cloudstream-extensions-arabic) ──
// IMPORTANT: Arabic movies have IMDB IDs just like any other movie, so they
// play through the regular IMDB-based providers (2Embed, AnyEmbed). The
// Arabic providers below are a FALLBACK — they search Arabic streaming sites
// by title and extract video-host embed URLs. They use the same iframe
// mechanism as regular providers (no redirect to Arabic websites).
//
// The /api/arabic-stream endpoint scrapes the Arabic site (using the exact
// logic from the ImZaw repo's loadLinks() method) and returns embeddable
// video-host URLs that play directly in an iframe.
const TIER_3: VideoSource[] = [
  {
    id: "egydead",
    name: "EgyDead",
    quality: "HD",
    tier: 3,
    logo: "ED",
    color: "from-red-600 to-rose-800",
    mobile: true,
    region: "Arabic",
    buildMovie: (_id) => `https://tv.egydead.live/?s=`,
    buildSeries: (_id, _s, _e) => `https://tv.egydead.live/?s=`,
  },
  {
    id: "egybest",
    name: "EgyBest",
    quality: "HD",
    tier: 3,
    logo: "EB",
    color: "from-amber-500 to-orange-600",
    mobile: true,
    region: "Arabic",
    // EgyBest's original domains are dead — routed through EgyDead's scraper
    buildMovie: (_id) => `https://tv.egydead.live/?s=`,
    buildSeries: (_id, _s, _e) => `https://tv.egydead.live/?s=`,
  },
  {
    id: "shahid4u",
    name: "Shahid4u",
    quality: "HD",
    tier: 3,
    logo: "S4",
    color: "from-blue-500 to-cyan-600",
    mobile: true,
    region: "Arabic",
    buildMovie: (_id) => `https://shed4u.cam/?s=`,
    buildSeries: (_id, _s, _e) => `https://shed4u.cam/?s=`,
  },
  {
    id: "faselhd",
    name: "FaselHD",
    quality: "HD",
    tier: 3,
    logo: "FH",
    color: "from-emerald-500 to-teal-700",
    mobile: true,
    region: "Arabic",
    buildMovie: (_id) => `https://faselhd.club/?s=`,
    buildSeries: (_id, _s, _e) => `https://faselhd.club/?s=`,
  },
  // Old dead Arabic embed providers — kept in "Others" for manual access.
  {
    id: "arabembed",
    name: "ArabEmbed",
    quality: "HD",
    tier: 5,
    logo: "AR",
    color: "from-red-600 to-rose-800",
    mobile: true,
    region: "Arabic",
    buildMovie: (id) => `https://arabembed.xyz/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://arabembed.xyz/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "trembed",
    name: "Trembed",
    quality: "HD",
    tier: 5,
    logo: "TR",
    color: "from-green-600 to-emerald-700",
    mobile: true,
    region: "Arabic",
    buildMovie: (id) => `https://trembed.xyz/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://trembed.xyz/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "gomoov",
    name: "Gomoov",
    quality: "HD",
    tier: 5,
    logo: "GM",
    color: "from-yellow-500 to-amber-600",
    mobile: true,
    region: "Arabic",
    buildMovie: (id) => `https://gomoov.to/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://gomoov.to/embed/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 5: "Others" — providers that are currently dead or unverified ──
// These providers failed our HTTP 200 reachability test (DNS failure, 5xx,
// or timeout). They're kept here (NOT removed) so:
//   1. Users who had a working provider saved as "last used" can still see it.
//   2. If a provider comes back online, it's already wired in — no code change.
//   3. The "Others" tab in the dropdown lets users try them manually.
// The dropdown shows them greyed out with a "⚠ dead" badge.
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
    buildMovie: (id) => `https://vidsrc.net/embed/movie?imdb=${id}`,
    buildSeries: (id, s, e) =>
      `https://vidsrc.net/embed/tv?imdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "vidsrc.xyz",
    name: "VidSrc.xyz",
    quality: "1080p",
    tier: 5,
    logo: "VX",
    color: "from-pink-500 to-rose-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}`,
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
  {
    id: "embedsu",
    name: "Embed.su",
    quality: "1080p",
    tier: 5,
    logo: "ES",
    color: "from-blue-500 to-cyan-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://embed.su/embed/movie/${id}`,
    buildSeries: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    quality: "Multi",
    tier: 5,
    logo: "AE",
    color: "from-emerald-500 to-green-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://autoembed.cc/embed/movie/${id}`,
    buildSeries: (id, s, e) =>
      `https://autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "2embed.org",
    name: "2Embed.org",
    quality: "1080p",
    tier: 5,
    logo: "2O",
    color: "from-amber-500 to-orange-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://2embed.org/embed/${id}`,
    buildSeries: (id, s, e) =>
      `https://2embed.org/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: "vidsrc.stream",
    name: "VidSrc.stream",
    quality: "HD",
    tier: 5,
    logo: "V⏵",
    color: "from-rose-500 to-pink-600",
    mobile: true,
    region: "Global",
    buildMovie: (id) => `https://vidsrc.stream/embed/movie?imdb=${id}`,
    buildSeries: (id, s, e) =>
      `https://vidsrc.stream/embed/tv?imdb=${id}&season=${s}&episode=${e}`,
  },
]

export const VIDEO_SOURCES: VideoSource[] = [
  ...TIER_1,
  ...TIER_1B,
  ...TIER_2,
  ...TIER_3,
  ...TIER_5,
]

// Primary servers shown by default in the dropdown (tiers 1 + 2).
export const PRIMARY_SOURCES = VIDEO_SOURCES.filter((s) => s.tier <= 2)
// Advanced multi-source servers (none currently — tier 3 is Arabic-only).
export const ADVANCED_SOURCES = VIDEO_SOURCES.filter((s) => s.tier === 3 && s.region === "Global")
// Mobile-first providers (touch-friendly, responsive embeds).
export const MOBILE_SOURCES = VIDEO_SOURCES.filter((s) => s.tier === 1)
// All Arabic-region providers (any tier).
export const ARABIC_SOURCES = VIDEO_SOURCES.filter((s) => s.region === "Arabic")
// "Others" — dead/unverified providers kept for manual access.
export const OTHER_SOURCES = VIDEO_SOURCES.filter((s) => s.tier === 5)

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
    // All mobile-flagged providers (excluding "Others" tier 5), de-duped
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
]

// All distinct providers that are flagged mobile-friendly AND alive (tier < 5).
// Used by the mobile auto-fallback chain to cycle through until one plays.
// Dead providers are excluded so we never auto-switch to a known-broken URL.
export const MOBILE_FALLBACK_CHAIN = VIDEO_SOURCES.filter((s) => s.mobile && s.tier < 5)

export function getSource(id: string): VideoSource {
  return VIDEO_SOURCES.find((s) => s.id === id) ?? VIDEO_SOURCES[0]
}

// Build a full player URL for a given title.
export function buildPlayerUrl(opts: {
  imdbId: string
  type: "movie" | "series"
  season?: number
  episode?: number
  sourceId?: string
}): string {
  const source = getSource(opts.sourceId ?? VIDEO_SOURCES[0].id)
  if (opts.type === "series") {
    const s = opts.season ?? 1
    const e = opts.episode ?? 1
    return source.buildSeries(opts.imdbId, s, e)
  }
  return source.buildMovie(opts.imdbId)
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
