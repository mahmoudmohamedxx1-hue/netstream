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
  /** If true, this provider uses TMDB IDs instead of IMDB IDs. */
  useTmdbId?: boolean
  /** Build movie URL using TMDB ID (when useTmdbId is true). */
  buildMovieTmdb?: (tmdbId: number) => string
  /** Build series URL using TMDB ID (when useTmdbId is true). */
  buildSeriesTmdb?: (tmdbId: number, season: number, episode: number) => string
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
    buildMovie: (id) => `https://vidcore.net/movie/${id}`,
    buildSeries: (id, s, e) => `https://vidcore.net/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 1c: Modern embed aggregators (2025) ──
// Newer embed providers that bundle multiple upstream video hosts behind a
// clean REST-style URL (/movie/{id}, /tv/{id}/{s}/{e}). Some of them
// (VidLink, Videasy, VidFast) key off TMDB IDs instead of IMDB IDs — these
// set useTmdbId: true and expose buildMovieTmdb/buildSeriesTmdb. When a
// caller passes a TMDB ID through buildPlayerUrl, it will route to those
// builders; otherwise it falls back to the IMDB builders (which for these
// providers will produce a URL keyed off the IMDB ID — less reliable for
// TMDB-only sources, but still functional). The rest (VidJoy, RiveStream,
// 111movies, SuperEmbed) continue to key off the IMDB ID.
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
    // SuperEmbed is a multiembed.mov variant that accepts BOTH the IMDB id
    // (video_id=) and the TMDB id (tmdb=). The TMDB id is optional at the
    // URL level; here we pass an empty tmdb= when only the IMDB id is
    // available at this layer (the multiembed.mov scraper treats an empty
    // tmdb param as "not provided" and falls back to IMDB lookup).
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
    buildSeries: (id, s, e) =>
      `https://111movies.com/embed/tv/${id}/${s}/${e}`,
  },
]

// ─── Tier 1D: Additional providers from Flickv4/Zangetsu/VortX/TMDB-Player ──
// Providers commonly used by open-source streaming apps, added for more
// source variety and redundancy.
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
    name: "MoviesApi",
    quality: "HD",
    tier: 1,
    logo: "MA",
    color: "from-cyan-500 to-blue-600",
    mobile: true,
    region: "Global",
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

// ── Preferred providers (user-specified top 5) ──────────────────────────────
// These are moved to the front of VIDEO_SOURCES so they appear first in the
// server dropdown and are tried first by the auto-switch logic.
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
  if (source.useTmdbId && opts.tmdbId && source.buildMovieTmdb) {
    if (opts.type === "series" && source.buildSeriesTmdb) {
      return source.buildSeriesTmdb(
        opts.tmdbId,
        opts.season ?? 1,
        opts.episode ?? 1,
      )
    }
    return source.buildMovieTmdb(opts.tmdbId)
  }
  // Fall back to IMDB ID
  if (opts.type === "series") {
    return source.buildSeries(opts.imdbId, opts.season ?? 1, opts.episode ?? 1)
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
