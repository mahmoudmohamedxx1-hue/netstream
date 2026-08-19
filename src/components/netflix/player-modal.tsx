"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  X,
  Play,
  Plus,
  Check,
  Star,
  Tv,
  Film,
  PictureInPicture2,
  ExternalLink,
  RotateCw,
  AlertCircle,
  Download,
  Captions,
  Activity,
  Maximize,
  Minimize,
  SkipForward,
} from "lucide-react"
import { Poster } from "./poster"
import { EpisodeGrid } from "./episode-grid"
import { DownloadHelper } from "./download-helper"
import { SubtitleHelper } from "./subtitle-helper"
import { ServerCheck } from "./server-check"
import {
  VIDEO_SOURCES,
  PRIMARY_SOURCES,
  ADVANCED_SOURCES,
  MOBILE_SOURCES,
  ARABIC_SOURCES,
  SOURCE_TABS,
  MOBILE_FALLBACK_CHAIN,
  buildPlayerUrl,
  getSource,
  type VideoSource,
} from "@/lib/vidsrc"
import { useLibrary } from "@/lib/library-store"
import { useToast } from "@/hooks/use-toast"
import { usePictureInPicture } from "@/hooks/use-pip"
import { useIsMobile } from "@/hooks/use-mobile"
import { useLastProvider } from "@/hooks/use-last-provider"
import { usePlaybackProgress } from "@/hooks/use-playback-progress"
import { useLang } from "@/lib/lang-context"
import { getAdBlockEnabled } from "@/components/netflix/navbar"
import { upsertWatchItem } from "@/lib/client-history"

// ── Favorite servers — saved in localStorage ────────────────────────────────
const FAVORITES_KEY = "netstream:favorites"
function getFavorites(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function toggleFavorite(id: string): string[] {
  const favs = getFavorites()
  const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) } catch {}
  return next
}

// ── Preferred providers (user-specified top 5) ──────────────────────────────
// These are tried first by the auto-switch logic, in this order.
const PREFERRED_PROVIDERS = ["vidfast.pro", "vidcore.net", "superembed", "moviesapi.to", "2embed.cc"]

// ── Watched episodes — saved in localStorage per imdbId+season ──────────────
const WATCHED_KEY = "netstream:watched"
function getWatchedEpisodes(imdbId: string, season: number): Set<number> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(`${WATCHED_KEY}:${imdbId}:${season}`)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}
function markEpisodeWatched(imdbId: string, season: number, episode: number) {
  if (typeof window === "undefined") return
  try {
    const key = `${WATCHED_KEY}:${imdbId}:${season}`
    const set = getWatchedEpisodes(imdbId, season)
    set.add(episode)
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {}
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Relaxed title shape accepted by the player (catalog or saved).
export type PlayerTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  poster?: string | null
  year?: string | null
  overview?: string | null
  rating?: string | null
  season?: number | null
  episode?: number | null
  position?: number | null   // saved playback position in seconds (for resume)
  sourceId?: string | null   // last used streaming provider (for resume on same server)
}

type Props = {
  title: PlayerTitle | null
  onClose: () => void
}

const QUALITY_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "1080p", label: "1080p" },
  { id: "720p", label: "720p" },
  { id: "480p", label: "480p" },
] as const

// Map quality to providers that work in browser iframes.
// Mobile defaults: MoviesHub (vidsrc.me) and SmashyStream
// PC defaults: 2Embed.cc and AnyEmbed
function sourceForQuality(quality: string, isMobile: boolean): string {
  // User-specified top providers: vidfast, vidcore, superembed, moviesapi, 2embed
  // These are the first providers to try on both mobile and desktop.
  if (isMobile) {
    switch (quality) {
      case "1080p":
        return "vidfast.pro"
      case "720p":
        return "vidfast.pro"
      case "480p":
        return "moviesapi.to"
      default:
        return "vidfast.pro" // auto → VidFast on mobile
    }
  }
  switch (quality) {
    case "1080p":
      return "vidfast.pro"
    case "720p":
      return "vidcore.net"
    case "480p":
      return "moviesapi.to"
    default:
      return "vidfast.pro" // auto → VidFast on desktop
  }
}

// Small colored logo badge shown next to each provider in the dropdown and
// server-check list. Renders the provider's 1-2 char `logo` over its gradient.
function ProviderLogo({
  source,
  size = "md",
}: {
  source: Pick<VideoSource, "logo" | "color" | "region">
  size?: "sm" | "md"
}) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-md bg-gradient-to-br font-black text-white shadow-sm ring-1 ring-white/10",
        source.color,
        dim
      )}
      aria-hidden
    >
      {source.logo}
    </span>
  )
}

export function PlayerModal({ title, onClose }: Props) {
  // Lock body scroll while a title is open
  useEffect(() => {
    if (!title) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [title])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <AnimatePresence>
      {title && <PlayerShell key={title.imdbId} title={title} onClose={onClose} />}
    </AnimatePresence>
  )
}

// Native video player — plays direct MP4/M3U8 URLs in a <video> element.
// Uses HLS.js for m3u8 streams (HLS is not natively supported in Chrome).
// Video URLs are proxied through /api/stream-video to add the correct Referer
// header (video CDNs like MixDrop require Referer from their domain).
// This bypasses iframes entirely — no ads, no cross-origin issues.
function NativeVideoPlayer({ src, type, poster, referer }: {
  src: string
  type: "mp4" | "hls" | null
  poster?: string
  referer?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: any = null

    // Use the combined extract+stream endpoint — pass the EMBED URL and let the
  // server extract the video URL and stream it in one request (avoids token expiration).
  // The `src` is the embed URL (e.g. https://mixdrop.top/e/xxx), not the direct video URL.
  const proxiedUrl = `/api/stream-video?embed=${encodeURIComponent(src)}&referer=${encodeURIComponent("https://tv10.egydead.live/")}`

    if (type === "hls" || src.includes(".m3u8")) {
      // HLS.js for m3u8 streams (not natively supported in Chrome)
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari supports HLS natively
        video.src = proxiedUrl
      } else {
        // Use HLS.js for Chrome/Firefox
        import("hls.js").then((Hls) => {
          if (Hls.default.isSupported()) {
            hls = new Hls.default()
            hls.loadSource(proxiedUrl)
            hls.attachMedia(video)
            hls.on(Hls.default.Events.MANIFEST_PARSED, () => {
              video.play().catch(() => {})
            })
          }
        })
      }
    } else {
      // Direct MP4 — play natively via the proxy
      video.src = proxiedUrl
      video.play().catch(() => {})
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [src, type, referer])

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      playsInline
      poster={poster}
      className="absolute inset-0 h-full w-full bg-black"
      style={{ objectFit: "contain" }}
    />
  )
}

function PlayerShell({ title, onClose }: { title: PlayerTitle; onClose: () => void }) {
  // Detect mobile so we can default to a mobile-optimized provider (touch UI).
  const isMobile = useIsMobile()
  const lastProvider = useLastProvider()
  const { t } = useLang()
  // Default provider: vidfast.pro on both mobile and desktop.
  // If the user has a saved sourceId from watch history (resume), use that.
  const [quality, setQuality] = useState<string>("auto")
  const savedSourceId = title.sourceId ?? undefined
  const defaultSource = savedSourceId || lastProvider.get(title.imdbId) || "vidfast.pro"
  const [sourceId, setSourceId] = useState<string>(defaultSource)
  const [season, setSeason] = useState<number>(title.season ?? 1)
  const [episode, setEpisode] = useState<number>(title.episode ?? 1)
  const [reloads, setReloads] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [subtitleOpen, setSubtitleOpen] = useState(false)
  const [serverCheckOpen, setServerCheckOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("primary")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<((opts: { title: string; description?: string }) => void) | null>(null)

  // Load favorites from localStorage on mount
  useEffect(() => {
    Promise.resolve().then(() => setFavorites(getFavorites()))
  }, [])

  const handleToggleFavorite = useCallback((id: string) => {
    const next = toggleFavorite(id)
    setFavorites(next)
    const source = VIDEO_SOURCES.find(s => s.id === id)
    const isFav = next.includes(id)
    // Defer toast to avoid using it before declaration
    Promise.resolve().then(() => {
      toastRef.current?.({
        title: isFav ? "Added to favorites" : "Removed from favorites",
        description: source?.name ?? id,
      })
    })
  }, [])

  // Fullscreen toggle — works on the player CONTAINER (not the iframe directly,
  // because cross-origin iframes block requestFullscreen). The container
  // includes the video frame + controls, so fullscreen shows everything.
  const toggleFullscreen = useCallback(() => {
    const el = playerContainerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {
        // Fallback: try to fullscreen the iframe directly (some browsers allow it)
        const iframe = el.querySelector("iframe")
        iframe?.requestFullscreen?.().catch(() => {})
      })
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  // Track fullscreen changes (e.g. user presses Esc)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  // Per-title reliability stats from the DB (used to show ✓/✗ badges AND to
  // auto-pick the best-matching provider on first open).
  const [stats, setStats] = useState<Record<string, { ok: boolean; reports: number }>>({})
  const [statsLoaded, setStatsLoaded] = useState(false)
  // Latency data from /api/provider-latency — shows response time in ms for
  // each provider so the user can see which are fast even without stats.
  const [latency, setLatency] = useState<Record<string, { latencyMs: number; ok: boolean }>>({})
  // Tracks whether the user has MANUALLY interacted with the source picker
  // (picked a server, clicked Next server, reloaded, changed quality). Once
  // true, all auto-pick logic (stats-based and health-based) is disabled for
  // the rest of this title's session. Distinct from `autoPickAppliedRef`,
  // which also flips when ANY auto-pick fires — we need both because the
  // stats-based pick (A4) should override a prior health-based pick, but
  // neither should override a user choice.
  const userInteractedRef = useRef(false)
  // Mirror of `sourceId` that always reflects the latest value, so async
  // callbacks (e.g. the stats fetch's .then) can compare against the current
  // sourceId without re-subscribing.
  const sourceIdRef = useRef(sourceId)
  useEffect(() => { sourceIdRef.current = sourceId }, [sourceId])
  // Fetch reliability stats once per title.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/provider-stats?imdbId=${encodeURIComponent(title.imdbId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const map: Record<string, { ok: boolean; reports: number }> = {}
        for (const s of data.stats ?? []) map[s.sourceId] = { ok: s.ok, reports: s.reports }
        setStats(map)
        setStatsLoaded(true)
        // Auto-pick DISABLED — server switching is now fully manual.
        // The user picks servers via the dropdown or "Next server" button.
      })
      .catch(() => setStatsLoaded(true))
    return () => { cancelled = true }
  }, [title.imdbId])
  // provider-latency and server-health calls REMOVED — they were the main
  // source of lag (each tests 24+ external providers in parallel). Since
  // server switching is now fully manual, the user doesn't need health
  // indicators — they just try a server and move on if it doesn't work.
  // The latency/health state stays as empty objects (no data = no lag).
  const [health, setHealth] = useState<
    Record<string, { ok: boolean; latencyMs: number; status: "ok" | "dead" | "timeout" }>
  >({})
  const fallbackIdxRef = useRef(0)
  const autoPickAppliedRef = useRef(false)
  // Auto-pick DISABLED — server switching is now fully manual.
  // The user picks servers via the dropdown or "Next server" button.
  // This effect is kept as a no-op to avoid breaking the dependency chain.
  useEffect(() => {
    // No-op — manual server switching only
  }, [health, sourceId])
  // Auto-filled metadata from the local IMDb dataset (best 11k titles).
  const [meta, setMeta] = useState<{
    title: string
    year: string
    genres: string[]
    runtimeMinutes: number | null
    seasons: { season: number; episodes: number }[] | null
    tmdbId: number | null
    poster: string | null
    backdrop: string | null
  } | null>(null)
  const { toggleWatchlist, isInWatchlist } = useLibrary()
  const { toast } = useToast()
  useEffect(() => { toastRef.current = toast }, [toast])
  const pip = usePictureInPicture()

  const isSeries = title.type === "series"
  const source = getSource(sourceId)

  // Track playback progress (elapsed time as a proxy for video.currentTime
  // since the iframe is cross-origin and we can't read it). Reports final
  // progress to WatchHistory on close so Continue Watching shows a red bar.
  const { progress: watchProgress, stop: stopProgress } = usePlaybackProgress({
    imdbId: title.imdbId,
    runtimeMinutes: meta?.runtimeMinutes ?? null,
    onProgress: ({ position, progress: pct, duration }) => {
      // Only persist every 30s to avoid hammering IndexedDB.
      if (position > 0 && position % 30 === 0) {
        upsertWatchItem({
          imdbId: title.imdbId,
          title: (displayTitle && !displayTitle.startsWith("IMDB ")) ? displayTitle : title.title,
          type: title.type,
          poster: displayPoster ?? title.poster ?? null,
          position,
          progress: pct,
          duration,
          sourceId,
          season: isSeries ? season : null,
          episode: isSeries ? episode : null,
        }).catch(() => {})
      }
    },
  })

  // Auto-fill: when the player opens, fetch real metadata from the backend
  // (local 11k-title dataset). This populates title/year/genres AND the real
  // season/episode counts for series. Also fetches the TMDB ID for episode
  // thumbnails/descriptions.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/titles/${encodeURIComponent(title.imdbId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.title) return
        const t = data.title
        setMeta({
          title: t.title,
          year: t.year,
          genres: t.genres ?? [],
          runtimeMinutes: t.runtimeMinutes ?? null,
          seasons: t.seasons ?? null,
          tmdbId: t.tmdbId ?? null,
          poster: null,
          backdrop: null,
        })
      })
      .catch(() => {})
    // Also fetch TMDB data (poster, backdrop, tmdbId for episodes)
    // The endpoint returns { title: { tmdbId, poster, backdrop, ... } }
    fetch(`/api/tmdb/${encodeURIComponent(title.imdbId)}`, { cache: "force-cache" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const tmdbData = data?.title ?? data
        const tmdbId = tmdbData?.tmdbId ?? null
        const poster = tmdbData?.poster ?? null
        const backdrop = tmdbData?.backdrop ?? null
        if (tmdbId || poster || backdrop) {
          setMeta((prev) => ({
            title: prev?.title ?? title.title,
            year: prev?.year ?? "",
            genres: prev?.genres ?? [],
            runtimeMinutes: prev?.runtimeMinutes ?? null,
            seasons: prev?.seasons ?? null,
            tmdbId: tmdbId ?? prev?.tmdbId ?? null,
            poster: poster ?? prev?.poster ?? null,
            backdrop: backdrop ?? prev?.backdrop ?? null,
          }))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [title.imdbId])

  // Real season/episode counts from the IMDb dataset (fallback to a sensible
  // default if the title isn't in our local DB).
  const seasonsData = meta?.seasons
  const seasonCount = seasonsData?.length ?? 8
  const currentSeasonEpisodes =
    seasonsData?.find((s) => s.season === season)?.episodes ?? 24

  // Clamp season/episode to valid ranges when metadata arrives. We do this
  // via a layout effect to avoid cascading renders but still fix invalid
  // values before paint.
  const safeSeason = seasonsData ? Math.min(season, seasonCount) : season
  const safeEpisode = seasonsData
    ? Math.min(episode, currentSeasonEpisodes)
    : episode
  if (safeSeason !== season) setSeason(safeSeason)
  if (safeEpisode !== episode) setEpisode(safeEpisode)

  // Display title: prefer auto-filled metadata, then the passed title.
  const displayTitle = meta?.title ?? title.title
  const displayYear = meta?.year ?? title.year ?? ""
  const displayGenres = meta?.genres ?? []
  const displayPoster = meta?.poster ?? title.poster ?? null

  const playerUrl = useMemo(
    () =>
      buildPlayerUrl({
        imdbId: title.imdbId,
        type: title.type,
        season,
        episode,
        sourceId,
      }),
    [title, season, episode, sourceId]
  )

  // Arabic provider streaming — when the user selects an Arabic scraper site
  // (EgyDead, EgyBest, etc.), we:
  //   1. Call /api/arabic-stream to search the Arabic site and get embed URLs
  //   2. Call /api/extract-video for each embed URL to get the DIRECT video URL
  //      (MP4 or M3U8) — using the same logic as sussy-code/providers extractors
  //   3. Play the direct URL in a native <video> element with HLS.js
  //   This bypasses iframes entirely — no ads, no cross-origin issues.
  const isArabicProvider = source.region === "Arabic" && source.tier === 3
  type ArabicSource = { url: string; host: string; originalUrl: string }
  type ExtractedSource = { embedUrl: string; host: string; videoUrl: string | null; videoType: "mp4" | "hls" | null; status: "pending" | "extracting" | "ready" | "failed" }
  const [arabicStream, setArabicStream] = useState<{
    sources: ArabicSource[]
    movieUrl: string | null
    loading: boolean
    error: string | null
    activeSourceIdx: number
  }>({ sources: [], movieUrl: null, loading: false, error: null, activeSourceIdx: 0 })
  const [extractedSources, setExtractedSources] = useState<ExtractedSource[]>([])
  const [activeExtractedIdx, setActiveExtractedIdx] = useState(0)

  useEffect(() => {
    if (!isArabicProvider) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setArabicStream({ sources: [], movieUrl: null, loading: true, error: null, activeSourceIdx: 0 })
    })
    const searchTitle = displayTitle || title.title
    if (!searchTitle) return
    fetch(
      `/api/arabic-stream?site=${source.id}&title=${encodeURIComponent(searchTitle)}&type=${title.type}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setArabicStream({
          sources: data.sources ?? [],
          movieUrl: data.movieUrl ?? null,
          loading: false,
          error: data.error ?? null,
          activeSourceIdx: 0,
        })
      })
      .catch(() => {
        if (cancelled) return
        setArabicStream({
          sources: [],
          movieUrl: null,
          loading: false,
          error: "Stream search failed",
          activeSourceIdx: 0,
        })
      })
    return () => { cancelled = true }
  }, [isArabicProvider, source.id, displayTitle, title.type, title.title])

  // Auto-fallback: if the Arabic provider search returns 0 sources, switch to
  // 2Embed.cc. Otherwise, stay on the Arabic provider — the video plays through
  // the /api/video-proxy which handles Referer headers and ad blocking.
  useEffect(() => {
    if (!isArabicProvider) return
    if (arabicStream.loading) return
    if (arabicStream.sources.length > 0) return
    // No sources found — switch to 2Embed.cc
    const timer = setTimeout(() => {
      setSourceId("2embed.cc")
    }, 1500)
    return () => clearTimeout(timer)
  }, [isArabicProvider, arabicStream.loading, arabicStream.sources.length])

  // The active embeddable video URL (for the iframe). When the Arabic provider
  // is selected, we proxy the embed URL through /api/video-proxy with the
  // When Arabic sources are found, extract direct video URLs from each embed.
  // This calls /api/extract-video which uses the sussy-code/providers logic:
  //   MixDrop → unpack eval(p,a,c,k,e,d) → MDCore.wurl → MP4 URL
  //   VOE → follow JS redirect → find 'hls':'...' → M3U8 URL
  // The extracted URLs play directly in a <video> element — no iframe, no ads.
  useEffect(() => {
    if (!isArabicProvider) return
    if (arabicStream.loading) return
    if (arabicStream.sources.length === 0) return

    let cancelled = false
    // Initialize extraction state (in a microtask to avoid set-state-in-effect)
    const initSources: ExtractedSource[] = arabicStream.sources.map((s) => ({
      embedUrl: s.url,
      host: s.host,
      videoUrl: null,
      videoType: null,
      status: "pending" as const,
    }))
    Promise.resolve().then(() => {
      if (!cancelled) {
        setExtractedSources(initSources)
        setActiveExtractedIdx(0)
      }
    })

    // Extract from each source in parallel
    arabicStream.sources.forEach((src, idx) => {
      setExtractedSources((prev) => prev.map((s, i) => i === idx ? { ...s, status: "extracting" } : s))
      fetch(`/api/extract-video?url=${encodeURIComponent(src.url)}&referer=${encodeURIComponent("https://tv10.egydead.live/")}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return
          if (data.success && data.videoUrl) {
            setExtractedSources((prev) => prev.map((s, i) =>
              i === idx ? { ...s, videoUrl: data.videoUrl, videoType: data.videoType, status: "ready" } : s
            ))
          } else {
            setExtractedSources((prev) => prev.map((s, i) => i === idx ? { ...s, status: "failed" } : s))
          }
        })
        .catch(() => {
          if (cancelled) return
          setExtractedSources((prev) => prev.map((s, i) => i === idx ? { ...s, status: "failed" } : s))
        })
    })

    return () => { cancelled = true }
  }, [isArabicProvider, arabicStream.sources, arabicStream.loading])

  // The first successfully extracted video URL (auto-select it)
  const activeExtractedSource = extractedSources.find((s) => s.status === "ready" && s.videoUrl)
  // Use the first ready source, or the one the user selected
  const currentVideoSource = extractedSources[activeExtractedIdx]?.status === "ready"
    ? extractedSources[activeExtractedIdx]
    : activeExtractedSource ?? null

  // Use the video-proxy approach: serve the embed page same-origin through
  // /api/video-proxy with the correct Referer + ad blocking. The video host's
  // JS runs, builds the m3u8 URL, and plays the video as a blob URL.
  // This was verified working — the video loads and plays.
  const directVideoUrl = currentVideoSource?.embedUrl
    ? `/api/video-proxy?url=${encodeURIComponent(currentVideoSource.embedUrl)}&referer=${encodeURIComponent("https://tv10.egydead.live/")}`
    : null
  const directVideoType = null // iframe mode, not native video

  // Record to Continue Watching via IndexedDB on mount and whenever season/episode changes.
  // Saves the full title metadata so Continue Watching has real titles.
  // Also saves the current sourceId (server) so reopening resumes on the same server.
  useEffect(() => {
    // Skip if the title hasn't resolved yet (still showing "IMDB xxx" or empty)
    if (!displayTitle || displayTitle.startsWith("IMDB ")) return
    upsertWatchItem({
      imdbId: title.imdbId,
      title: displayTitle,
      type: title.type,
      poster: displayPoster ?? title.poster ?? null,
      year: displayYear || null,
      overview: title.overview ?? null,
      rating: title.rating ?? null,
      season: isSeries ? season : null,
      episode: isSeries ? episode : null,
      sourceId: sourceId,
    }).catch(() => {})
  }, [season, episode, displayTitle, displayYear, displayPoster, sourceId])

  const inList = isInWatchlist(title.imdbId)

  const handleToggleList = useCallback(async () => {
    const added = await toggleWatchlist({
      imdbId: title.imdbId,
      title: title.title,
      type: title.type,
      poster: title.poster ?? null,
      year: title.year ?? null,
      overview: title.overview ?? null,
      rating: title.rating ?? null,
    })
    toast({
      title: added ? "Added to My List" : "Removed from My List",
      description: title.title,
    })
  }, [title, toggleWatchlist, toast])

  const handleQualityChange = (q: string) => {
    setQuality(q)
    const recommended = sourceForQuality(q, isMobile)
    if (recommended !== sourceId) {
      // User-driven change — disable all auto-pick for the rest of this title.
      // eslint-disable-next-line react-hooks/immutability
      autoPickAppliedRef.current = true
      // eslint-disable-next-line react-hooks/immutability
      userInteractedRef.current = true
      setSourceId(recommended)
      setLoaded(false)
      toast({
        title: `Quality set to ${q}`,
        description: `Switched to ${getSource(recommended).name}`,
      })
    }
  }

  const handleSourceChange = (id: string) => {
    // eslint-disable-next-line react-hooks/immutability
    autoPickAppliedRef.current = true
    // eslint-disable-next-line react-hooks/immutability
    userInteractedRef.current = true
    setSourceId(id)
    setLoaded(false)
    // Remember this choice for next time the user opens this title.
    // But DON'T save providers that are known to 403 in browser iframes.
    const BLOCKED = ["vidsrc.to", "vidsrc.cc", "vidsrc.pro", "multiembed"]
    if (!BLOCKED.includes(id)) {
      lastProvider.set(title.imdbId, id)
    }
  }

  // Report provider outcome (working/broken) when the user closes the player
  // A4 — Report provider working/broken. Moved here (before handleNextServer)
  // to avoid "Cannot access variable before it is declared" error.
  const reportProvider = useCallback(
    async (sid: string, ok: boolean) => {
      try {
        await fetch("/api/provider-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imdbId: title.imdbId, sourceId: sid, ok }),
        })
      } catch {}
    },
    [title.imdbId]
  )


  // "Next server" — advance to the next WORKING server, skipping dead ones
  // (Enhancement C). Uses health data to filter; falls back to tier<5 sources
  // when health data isn't available. Resets the auto-fallback timer (so the
  // new server gets a fresh 8s window) and disables future auto-pick.
  // A4: also reports the current server as broken (the user is moving on
  // because it didn't work) so future opens of this title deprioritise it.
  const handleNextServer = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    autoPickAppliedRef.current = true
    // eslint-disable-next-line react-hooks/immutability
    userInteractedRef.current = true
    fallbackIdxRef.current = 0
    // Report the outgoing server as broken. Fire-and-forget — don't block
    // the server switch on the network round-trip.
    reportProvider(sourceId, false)
    const healthKeys = Object.keys(health)
    let chain: VideoSource[]
    if (healthKeys.length > 0) {
      // Health-aware: only working servers, sorted by latency asc
      chain = VIDEO_SOURCES
        .filter((s) => health[s.id]?.ok && s.tier < 5)
        .sort(
          (a, b) => (health[a.id]?.latencyMs ?? 0) - (health[b.id]?.latencyMs ?? 0)
        )
    } else {
      // No health data — fall back to all alive (tier < 5) sources
      chain = VIDEO_SOURCES.filter((s) => s.tier < 5)
    }
    if (chain.length === 0) return
    const currentIdx = chain.findIndex((s) => s.id === sourceId)
    const next = chain[(currentIdx + 1) % chain.length]
    if (next && next.id !== sourceId) {
      setSourceId(next.id)
      lastProvider.set(title.imdbId, next.id)
      setLoaded(false)
      toast({
        title: "Switched server",
        description: `Now trying ${next.name}`,
      })
    }
  }, [sourceId, health, title.imdbId, lastProvider, toast, reportProvider])

  // ── Reliable auto-fallback ──────────────────────────────────────────────
  // When the iframe doesn't fire onLoad within 6s, try the next preferred
  // provider. The fallback chain is:
  //   1. User's favorite servers (if any) — sorted by tier
  //   2. PREFERRED_PROVIDERS (vidfast, vidcore, superembed, moviesapi, 2embed)
  //   3. All tier 1 providers
  // Caps at 3 attempts. Reset by manual "Next server" / "Reload".
  // Skipped for Arabic providers (they have their own flow).
  useEffect(() => {
    if (loaded) return
    if (isArabicProvider) return
    const timer = setTimeout(() => {
      if (loaded) return
      fallbackIdxRef.current += 1
      if (fallbackIdxRef.current > 3) return
      // Build the fallback chain: favorites first, then preferred, then tier 1
      const favSources = favorites
        .map(id => VIDEO_SOURCES.find(s => s.id === id))
        .filter((s): s is VideoSource => !!s && s.tier < 5)
      const preferredSources = PREFERRED_PROVIDERS
        .map(id => VIDEO_SOURCES.find(s => s.id === id))
        .filter((s): s is VideoSource => !!s)
      const tier1Sources = VIDEO_SOURCES.filter(s => s.tier === 1)
      // Combine, deduplicate
      const chain = [...favSources, ...preferredSources, ...tier1Sources]
        .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
      if (chain.length === 0) return
      const currentIdx = chain.findIndex(s => s.id === sourceId)
      const nextIdx = (currentIdx + 1) % chain.length
      const next = chain[nextIdx]
      if (next && next.id !== sourceId) {
        setSourceId(next.id)
        lastProvider.set(title.imdbId, next.id)
        setReloads(r => r + 1)
        toast({
          title: `Trying ${next.name}…`,
          description: `Server ${fallbackIdxRef.current + 1} of ${chain.length}`,
        })
      }
    }, 6000)
    return () => clearTimeout(timer)
  }, [sourceId, reloads, loaded, isArabicProvider, title.imdbId, favorites, lastProvider, toast])
  // A4 — 30-second watch-success reporter.
  const reportedOkRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!loaded) return
    if (isArabicProvider) return
    if (reportedOkRef.current.has(sourceId)) return
    const timer = setTimeout(() => {
      reportedOkRef.current.add(sourceId)
      reportProvider(sourceId, true)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [loaded, sourceId, isArabicProvider, reportProvider])

  const openInNewTab = () => {
    window.open(playerUrl, "_blank", "noopener,noreferrer")
  }

  // When the player closes, stop the progress timer and persist the final
  // position + sourceId + full title info to IndexedDB.
  // This is the GUARANTEED save — even if recordPlay never fired.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleClose = useCallback(() => {
    const result = stopProgress()
    const pos = result.position
    const pct = result.progress
    const dur = result.duration
    if (pos > 5) {
      const titleToSave = (displayTitle && !displayTitle.startsWith("IMDB "))
        ? displayTitle
        : title.title
      upsertWatchItem({
        imdbId: title.imdbId,
        title: titleToSave,
        type: title.type,
        poster: displayPoster ?? title.poster ?? null,
        year: displayYear || title.year || null,
        overview: title.overview ?? null,
        rating: title.rating ?? null,
        season: isSeries ? season : null,
        episode: isSeries ? episode : null,
        sourceId: sourceId,
        position: pos,
        progress: pct,
        duration: dur,
      }).catch(() => {})
    }
    if (!loaded && isMobile) reportProvider(sourceId, false)
    onClose()
  }, [stopProgress, loaded, isMobile, reportProvider, sourceId, onClose, title.imdbId, title.title, title.type, title.poster, title.year, title.overview, title.rating, displayTitle, displayYear, isSeries, season, episode])

  // Save progress on unmount (e.g., when navigating away or closing browser tab)
  useEffect(() => {
    return () => {
      const result = stopProgress()
      if (result.position > 5) {
        upsertWatchItem({
          imdbId: title.imdbId,
          title: (displayTitle && !displayTitle.startsWith("IMDB ")) ? displayTitle : title.title,
          type: title.type,
          poster: displayPoster ?? title.poster ?? null,
          position: result.position,
          progress: result.progress,
          duration: result.duration,
          sourceId,
          season: isSeries ? season : null,
          episode: isSeries ? episode : null,
        }).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openPiP = () => {
    pip.open(playerUrl, title.title)
    toast({
      title: pip.state === "unsupported" ? "Opened in popup" : "Picture in Picture",
      description:
        pip.state === "unsupported"
          ? "Your browser doesn't support Document PiP — opened in a popup window."
          : "Floating window stays on top across all tabs.",
    })
  }

  const reload = useCallback(() => {
    // Reset auto-fallback state so the user gets a fresh 8s window for this
    // source (Enhancement A: "If the user manually clicks Next server or
    // Reload, reset the timer"). Also disable future auto-pick — the user
    // has now interacted with the player.
    fallbackIdxRef.current = 0
    // eslint-disable-next-line react-hooks/immutability
    autoPickAppliedRef.current = true
    // eslint-disable-next-line react-hooks/immutability
    userInteractedRef.current = true
    setLoaded(false)
    setReloads((r) => r + 1)
  }, [])

  // Keyboard shortcuts (enhancement D):
  //   R = reload stream
  //   N = next server (cycle through alive providers)
  //   T = open server health check
  //   F = fullscreen the iframe
  //   S = focus the server dropdown
  //   Escape = close (already handled by the parent)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea/select
      const target = e.target as HTMLElement
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return
      const key = e.key.toLowerCase()
      if (key === "r") { e.preventDefault(); reload() }
      else if (key === "n") {
        e.preventDefault()
        // Advance to the next WORKING server (skip dead ones via health data)
        handleNextServer()
      }
      else if (key === "t") { e.preventDefault(); setServerCheckOpen(true) }
      else if (key === "f") {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sourceId, handleNextServer, reload])

  const seasonList = useMemo(
    () => Array.from({ length: seasonCount }, (_, i) => i + 1),
    [seasonCount]
  )

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black nf-scroll"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
    >
      <motion.div
        ref={playerContainerRef}
        className="relative my-0 w-full max-w-5xl bg-[#0a0a0a] shadow-2xl sm:my-6 sm:rounded-xl"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          aria-label="Close player" data-testid="close-player"
          className="absolute right-3 top-3 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Fullscreen button overlay (left of close button) */}
        <button
          onClick={toggleFullscreen}
          className="absolute right-14 top-3 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          aria-label="Fullscreen" data-testid="fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>

        {/* Resume banner — shows the saved position and server when reopening */}
        {title.position && title.position > 10 && title.sourceId && (
          <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs">
            <span className="text-emerald-400">
              ▶ Resuming from {Math.floor(title.position / 60)}:{String(Math.floor(title.position % 60)).padStart(2, "0")}
              {source && ` · ${source.name}`}
            </span>
          </div>
        )}

        {/* Video frame — Arabic providers extract DIRECT video URLs (MP4/M3U8)
            using the sussy-code/providers extractor logic, then play them in a
            native <video> element with HLS.js. No iframe, no ads, no cross-origin. */}
        <div className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-t-xl">
          {isArabicProvider ? (
            arabicStream.loading ? (
              /* Loading: searching the Arabic site for video sources */
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                <p className="text-sm text-white/60">
                  {t("loading")} {source.name}…
                </p>
                <p className="text-xs text-white/40">Searching Arabic sources</p>
              </div>
            ) : directVideoUrl ? (
              /* Success: play the DIRECT video URL in a native <video> element */
              <>
                {/* Server switcher — shows extraction status for each host */}
                {extractedSources.length > 1 && (
                  <div className="absolute right-14 top-3 z-20 flex flex-wrap gap-1.5">
                    {extractedSources.map((s, idx) => (
                      <button
                        key={s.embedUrl}
                        onClick={() => s.status === "ready" && setActiveExtractedIdx(idx)}
                        disabled={s.status !== "ready"}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[10px] font-bold transition",
                          idx === activeExtractedIdx && s.status === "ready"
                            ? "bg-primary text-primary-foreground"
                            : s.status === "ready"
                              ? "bg-black/70 text-white/80 hover:bg-black/90"
                              : s.status === "extracting"
                                ? "bg-black/50 text-white/40"
                                : "bg-black/50 text-red-400/40"
                        )}
                        title={s.embedUrl}
                      >
                        {s.status === "extracting" ? "⏳" : s.status === "failed" ? "✗" : ""}
                        {s.host}
                      </button>
                    ))}
                  </div>
                )}
                <iframe
                  key={directVideoUrl}
                  src={directVideoUrl}
                  title={title.title}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; web-share"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full"
                />
                {/* Watched-progress bar */}
                {watchProgress > 0 && (
                  <div className="absolute bottom-0 left-0 z-20 h-1 w-full bg-white/10">
                    <div
                      className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                      style={{ width: `${watchProgress}%` }}
                    />
                  </div>
                )}
              </>
            ) : arabicStream.sources.length > 0 && extractedSources.length > 0 && !extractedSources.some(s => s.status === "ready") && extractedSources.every(s => s.status !== "extracting" && s.status !== "pending") ? (
              /* All extractions failed — show error */
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                <AlertCircle className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/60">{t("ifNothingPlays")}</p>
                <p className="text-xs text-white/40">
                  {source.name}: Could not extract video from any source
                </p>
              </div>
            ) : arabicStream.sources.length > 0 ? (
              /* Sources found, extracting video URLs... */
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                <p className="text-sm text-white/60">Extracting video URLs…</p>
                <p className="text-xs text-white/40">
                  {extractedSources.filter(s => s.status === "ready").length}/{extractedSources.length} sources ready
                </p>
              </div>
            ) : (
              /* No sources found */
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                <AlertCircle className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/60">{t("ifNothingPlays")}</p>
                <p className="text-xs text-white/40">
                  {source.name}: {arabicStream.error || "No video found"}
                </p>
              </div>
            )
          ) : (
            <>
              {!loaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                  <p className="text-sm text-white/60">
                    {t("loading")} {source.name}…
                  </p>
                  <p className="text-xs text-white/40">
                    {t("ifNothingPlays")}
                  </p>
                  <p className="mt-2 hidden text-[10px] text-white/30 sm:block">
                    ⌨ R: reload · N: next server · T: test · F: fullscreen · Esc: close
                  </p>
                </div>
              )}
              {/* "Not playing?" helper — always visible, overlaid at top-left */}
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2">
                <a
                  href={playerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-black/90"
                  title={t("openInTab")}
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("openInTab")}
                </a>
              </div>
              <iframe
                key={`${sourceId}-${reloads}`}
                src={playerUrl}
                title={title.title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; web-share"
                allowFullScreen
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
                className="absolute inset-0 h-full w-full"
              />
          {/* Watched-progress bar (Netflix-style red strip at bottom of video) */}
          {watchProgress > 0 && (
            <div className="absolute bottom-0 left-0 z-20 h-1 w-full bg-white/10">
              <div
                className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${watchProgress}%` }}
              />
            </div>
          )}
            </>
          )}
        </div>

        {/* Controls strip */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-6">
          {/* Source — tabbed dropdown with Primary / Mobile / Arabic / Advanced.
              We render the trigger from the `source` state directly (not SelectValue)
              because our items use complex JSX — SelectValue would mirror that JSX
              into the trigger and double the logo. */}
          <Select value={sourceId} onValueChange={handleSourceChange}>
            <SelectTrigger className="h-9 w-[170px] border-white/20 bg-white/5 text-xs text-white">
              <ProviderLogo source={source} size="sm" />
              <span className="truncate text-white/80">
                <span className="text-white/50">Server:</span>{" "}
                <span className="font-semibold text-white">{source.name}</span>
              </span>
            </SelectTrigger>
            <SelectContent className="z-[200] max-h-[24rem] border-white/15 bg-[#181818] text-white">
              {/* Tab buttons — switching tabs swaps the visible provider list */}
              <div className="sticky top-0 z-10 flex gap-1 border-b border-white/10 bg-[#181818] p-1.5">
                {SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setActiveTab(tab.id)
                    }}
                    className={cn(
                      "flex-1 rounded px-1.5 py-1 text-[10px] font-bold transition",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    )}
                  >
                    <span className="mr-0.5">{tab.emoji}</span>
                    {t(tab.id)}
                  </button>
                ))}
              </div>
              {/* Render the active tab's sources, health-sorted:
                  working servers first (by latency asc), dead ones last.
                  Falls back to tier-based ordering when no health data. */}
              {(SOURCE_TABS.find((t) => t.id === activeTab)?.sources ?? [])
                .slice()
                .sort((a, b) => {
                  // Favorites always sort to the top
                  const aFav = favorites.includes(a.id) ? 0 : 1
                  const bFav = favorites.includes(b.id) ? 0 : 1
                  if (aFav !== bFav) return aFav - bFav
                  // Then by health
                  const ah = health[a.id]
                  const bh = health[b.id]
                  const aOk = ah ? ah.ok : a.tier < 5
                  const bOk = bh ? bh.ok : b.tier < 5
                  if (aOk !== bOk) return Number(bOk) - Number(aOk)
                  if (aOk && ah && bh) return ah.latencyMs - bh.latencyMs
                  return 0
                })
                .map((s) => {
                const stat = stats[s.id]
                const lat = latency[s.id]
                const h = health[s.id]
                // "Dead" = health says dead OR (no health data AND tier === 5)
                const isDead = h ? !h.ok : s.tier === 5
                return (
                  <SelectItem key={s.id} value={s.id} className={cn("py-2", isDead && "opacity-50")}>
                    <div className="flex items-center gap-2">
                      <ProviderLogo source={s} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {/* Health indicator: green ✓ / red ✗ (only when we have health data) */}
                          {h && (
                            <span
                              className={h.ok ? "text-emerald-400" : "text-red-400"}
                              aria-label={h.ok ? "working" : "dead"}
                            >
                              {h.ok ? "✓ " : "✗ "}
                            </span>
                          )}
                          {s.name}
                          {s.mobile && <span className="ml-1 text-[9px]">📱</span>}
                          {s.region !== "Global" && (
                            <span className="ml-1 rounded bg-white/10 px-1 py-0.5 text-[8px] uppercase text-white/50">
                              {s.region}
                            </span>
                          )}
                          {isDead && (
                            <span className="ml-1 rounded bg-yellow-500/20 px-1 py-0.5 text-[8px] uppercase text-yellow-400">
                              ⚠ dead
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-white/40">
                          {s.quality}
                          {/* Show health latency (preferred) or provider-latency data */}
                          {h ? (
                            <span className={h.ok ? " text-emerald-400/70" : " text-red-400/70"}>
                              {" "}• {h.ok ? `${h.latencyMs}ms` : h.status === "timeout" ? "timeout" : "dead"}
                            </span>
                          ) : !isDead && lat ? (
                            <span className={lat.ok ? " text-emerald-400/70" : " text-red-400/70"}>
                              {" "}• {lat.ok ? `${lat.latencyMs}ms` : "timeout"}
                            </span>
                          ) : isDead && !stat ? (
                            <span className=" text-yellow-500/70"> • unverified</span>
                          ) : null}
                          {/* Show reliability stats if we have them */}
                          {stat ? (
                            <span className={stat.ok ? " text-emerald-400" : " text-red-400"}>
                              {" "}• {stat.ok ? "✓ working" : "✗ broken"} ({stat.reports})
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {/* Favorite star — click to toggle, saved in localStorage */}
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleToggleFavorite(s.id)
                        }}
                        className="shrink-0 p-1 transition hover:scale-110"
                        title={favorites.includes(s.id) ? "Remove from favorites" : "Add to favorites"}
                        aria-label={favorites.includes(s.id) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star className={cn(
                          "h-3.5 w-3.5 transition",
                          favorites.includes(s.id)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-white/30 hover:text-white/60"
                        )} />
                      </button>
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              "h-9 rounded-md px-2.5 text-[10px] font-semibold transition",
              showAdvanced
                ? "bg-primary text-primary-foreground"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
            title="Toggle advanced servers"
          >
            {showAdvanced ? "− Less" : `+ More (${VIDEO_SOURCES.length})`}
          </button>

          {/* Quality */}
          <Select value={quality} onValueChange={handleQualityChange}>
            <SelectTrigger className="h-9 w-[110px] border-white/20 bg-white/5 text-xs text-white">
              <span className="text-white/50">Quality:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[200] border-white/15 bg-[#181818] text-white">
              {QUALITY_OPTIONS.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isSeries && (
            <Select
              value={String(season)}
              onValueChange={(v) => {
                setSeason(Number(v))
                setEpisode(1)
                setLoaded(false)
              }}
            >
              <SelectTrigger className="h-9 w-[130px] border-white/20 bg-white/5 text-xs text-white">
                <span className="text-white/50">Season:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200] max-h-72 border-white/15 bg-[#181818] text-white">
                {seasonList.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Season {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs text-white/80 sm:inline-flex">
              {isSeries ? <Tv className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
              {isSeries ? t("seriesShort") : t("movieShort")}
            </span>
            <button
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              aria-label={t("reload")} data-testid="reload-button"
              title={`${t("reload")} (R)`}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleNextServer}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              aria-label="Next server" data-testid="next-server"
              title="Next working server (N)"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Next</span>
            </button>
            <button
              onClick={() => setServerCheckOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title={`${t("serverStatus")} (T)`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("test")}</span>
            </button>
            <button
              onClick={openPiP}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title="Picture in Picture (stays on top across tabs)"
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PiP</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
            </button>
            <button
              onClick={openInNewTab}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDownloadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title={t("downloadVideo")}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("download")}</span>
            </button>
            <button
              onClick={() => setSubtitleOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title={t("subtitles")}
            >
              <Captions className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("subtitles")}</span>
            </button>
            <button
              onClick={handleToggleList}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                inList
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-white text-black hover:bg-white/80"
              )}
            >
              {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span className="hidden sm:inline">{inList ? t("inMyList") : t("myList")}</span>
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                {displayTitle}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                {displayYear ? <span>{displayYear}</span> : null}
                {title.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {title.rating}
                  </span>
                ) : null}
                {meta?.runtimeMinutes ? (
                  <span>{meta.runtimeMinutes}m</span>
                ) : null}
                {isSeries ? (
                  <span>
                    S{season} • E{episode}
                  </span>
                ) : null}
                <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                  {title.imdbId}
                </span>
              </div>
              {displayGenres.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {displayGenres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70"
                    >
                      {g}
                    </span>
                  ))}
                </p>
              ) : null}
              {title.overview ? (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">
                  {title.overview}
                </p>
              ) : null}
            </div>

            <Poster
              title={displayTitle}
              src={title.poster}
              year={displayYear}
              className="hidden h-44 w-30 shrink-0 rounded-md sm:block"
            />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-white/80">
                {t("playbackTips")}
              </p>
              <p className="mt-1">
                {t("playbackTipsBody")}{" "}
                <ExternalLink className="inline h-3 w-3" /> <strong>open-in-new-tab</strong>{" "}
                — {t("restrictions")} <strong>{t("server")}</strong> ({VIDEO_SOURCES.length}{" "}
                {t("providersAvailable")} {MOBILE_SOURCES.length} {t("mobileOptimized")}{" "}
                {ARABIC_SOURCES.length} {t("arabicProviders")}).
              </p>
              <p className="mt-1.5 text-yellow-400/80">
                ⚠ {t("adWarning")}
              </p>
            </div>
          </div>
        </div>

        {/* Netflix-style episode grid for series — with season selector */}
        {isSeries && (
          <div className="border-t border-white/10">
            {/* Season selector — same style as title-detail page */}
            <div className="px-4 pt-5 sm:px-6">
              <div className="mb-3 flex items-center gap-2">
                <label className="text-sm font-semibold text-white/60">Season:</label>
                <select
                  value={season}
                  onChange={(e) => {
                    setSeason(Number(e.target.value))
                    setEpisode(1)
                    setLoaded(false)
                  }}
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white focus:outline-none"
                >
                  {seasonList.map((s) => (
                    <option key={s} value={s} className="bg-[#181818]">Season {s}</option>
                  ))}
                </select>
              </div>
            </div>
            <EpisodeGrid
              season={season}
              episode={episode}
              totalEpisodes={currentSeasonEpisodes}
              tmdbId={meta?.tmdbId ?? undefined}
              watchedEpisodes={getWatchedEpisodes(title.imdbId, season)}
              onChange={(ep) => {
                setEpisode(ep)
                markEpisodeWatched(title.imdbId, season, ep)
                setLoaded(false)
              }}
            />
          </div>
        )}
      </motion.div>

      {/* Download helper dialog */}
      <DownloadHelper
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        streamUrl={playerUrl}
        title={displayTitle}
        imdbId={title.imdbId}
        type={title.type}
        sourceId={sourceId}
        season={season}
        episode={episode}
      />

      {/* Subtitle helper dialog */}
      <SubtitleHelper
        open={subtitleOpen}
        onClose={() => setSubtitleOpen(false)}
        imdbId={title.imdbId}
        title={displayTitle}
      />

      {/* Server health check dialog */}
      <ServerCheck
        open={serverCheckOpen}
        onClose={() => setServerCheckOpen(false)}
        imdbId={title.imdbId}
        type={title.type}
        season={isSeries ? season : undefined}
        episode={isSeries ? episode : undefined}
        onSelectServer={handleSourceChange}
      />
    </motion.div>
  )
}
