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
  if (isMobile) {
    switch (quality) {
      case "1080p":
        return "smashystream"
      case "720p":
        return "vidsrc.me"
      case "480p":
        return "vidsrc.me"
      default:
        return "vidsrc.me" // auto → MoviesHub on mobile
    }
  }
  switch (quality) {
    case "1080p":
      return "2embed.cc"
    case "720p":
      return "anyembed"
    case "480p":
      return "anyembed"
    default:
      return "2embed.cc" // auto → 2Embed on desktop
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
  // Default provider: MoviesHub (vidsrc.me) on mobile, 2Embed.cc on desktop.
  // Both reliably return 200 in browser iframes. MoviesHub is mobile-friendly.
  const [quality, setQuality] = useState<string>("auto")
  const defaultSource = isMobile ? "vidsrc.me" : "2embed.cc"
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
  const playerContainerRef = useRef<HTMLDivElement>(null)

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
  sourceIdRef.current = sourceId
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
        // A4 — Per-title server memory: if we have at least one ok=true
        // stat for this title, auto-pick the best server (most reports
        // among ok=true entries; ties broken by lower tier = more
        // reliable). This takes precedence over the health-check-based
        // auto-pick below — stats reflect real user watch outcomes, which
        // are more trustworthy than a single live HTTP probe. Skipped
        // once the user has manually interacted with the source picker.
        if (!userInteractedRef.current) {
          type StatRow = { sourceId: string; ok: boolean; reports: number }
          const okEntries: StatRow[] = (data.stats ?? [])
            .filter((s: StatRow) => s.ok && s.reports > 0)
          if (okEntries.length > 0) {
            // Prevent the health-based auto-pick from overriding this
            // stats-based choice (it checks `autoPickAppliedRef`).
            // eslint-disable-next-line react-hooks/immutability
            autoPickAppliedRef.current = true
            okEntries.sort((a, b) => {
              if (b.reports !== a.reports) return b.reports - a.reports
              const aTier = VIDEO_SOURCES.find((s) => s.id === a.sourceId)?.tier ?? 99
              const bTier = VIDEO_SOURCES.find((s) => s.id === b.sourceId)?.tier ?? 99
              return aTier - bTier
            })
            const best = okEntries[0]
            if (best && best.sourceId !== sourceIdRef.current) {
              Promise.resolve().then(() => {
                if (cancelled) return
                setSourceId(best.sourceId)
                setLoaded(false)
              })
            }
          }
        }
      })
      .catch(() => setStatsLoaded(true))
    return () => { cancelled = true }
  }, [title.imdbId])
  // Fetch latency data once per title — DEFERRED by 3s so the iframe loads
  // first without competing for network/CPU. Shows response time in ms for
  // every provider so the user can see which are fast even without reliability
  // stats. Non-blocking: fires in the background, updates state when done.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/provider-latency?imdbId=${encodeURIComponent(title.imdbId)}&type=${title.type}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return
          const map: Record<string, { latencyMs: number; ok: boolean }> = {}
          for (const r of data.results ?? []) map[r.id] = { latencyMs: r.latencyMs, ok: r.ok }
          setLatency(map)
        })
        .catch(() => {})
    }, 3000) // 3s delay — lets the iframe start loading first
    return () => { cancelled = true; clearTimeout(timer) }
  }, [title.imdbId, title.type])
  // Live server-health data from /api/server-health — DEFERRED by 5s so the
  // iframe is already loading by the time this heavy request fires.
  // Tests every provider's embed URL in parallel and records ok/dead/timeout
  // + latency. Used to:
  //   3. Show ✓/✗ health indicators next to each provider.
  //   4. Skip dead providers when auto-advancing / clicking "Next server".
  // Falls back gracefully to the existing tier-based ordering if the health
  // check fails (no providers get marked ok/dead → defaults preserved).
  const [health, setHealth] = useState<
    Record<string, { ok: boolean; latencyMs: number; status: "ok" | "dead" | "timeout" }>
  >({})
  // Auto-fallback attempt counter (Enhancement A). Reset by manual "Next
  // server" / "Reload" clicks. Caps at 3 attempts so we don't loop forever.
  const fallbackIdxRef = useRef(0)
  // Tracks whether the auto-pick (fastest-working-default) has already fired
  // OR the user has manually interacted with the source. Once true, auto-pick
  // is disabled for the rest of this title's session (component remounts on
  // title change, so the ref resets per-title).
  const autoPickAppliedRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    // DEFERRED by 5s — the heaviest API call (tests 24 providers in parallel).
    // Waiting 5s ensures the iframe is already loaded and playing before this
    // request competes for network/CPU resources. The player loads immediately
    // with tier-based defaults; health data updates the dropdown when it arrives.
    const timer = setTimeout(() => {
      fetch(`/api/server-health?imdbId=${encodeURIComponent(title.imdbId)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return
          const map: Record<
            string,
            { ok: boolean; latencyMs: number; status: "ok" | "dead" | "timeout" }
          > = {}
          for (const r of data.results ?? []) {
            map[r.id] = {
              ok: !!r.ok,
              latencyMs: r.latencyMs ?? 0,
              status: r.status ?? "dead",
            }
          }
          setHealth(map)
        })
        .catch(() => {})
    }, 5000) // 5s delay — lets the iframe load first
    return () => { cancelled = true; clearTimeout(timer) }
  }, [title.imdbId])
  // Auto-pick the fastest working server when health data first arrives
  // (Enhancement B: "default server becomes the fastest working one, not a
  // hardcoded tier"). Only fires once per title — once the user manually
  // picks a server, clicks Next server, or reloads, auto-pick is disabled.
  // No-op if no providers are working (falls back to the hardcoded default).
  // The setState calls are deferred to a microtask to avoid cascading renders
  // (matches the pattern used by the Arabic-stream effect below).
  useEffect(() => {
    if (autoPickAppliedRef.current) return
    const working = VIDEO_SOURCES.filter((s) => health[s.id]?.ok && s.tier < 5)
    if (working.length === 0) return
    working.sort(
      (a, b) => (health[a.id]?.latencyMs ?? 0) - (health[b.id]?.latencyMs ?? 0)
    )
    const fastest = working[0]
    if (fastest && fastest.id !== sourceId) {
      // eslint-disable-next-line react-hooks/immutability
      autoPickAppliedRef.current = true
      Promise.resolve().then(() => {
        setSourceId(fastest.id)
        setLoaded(false)
      })
    }
  }, [health, sourceId])
  // Auto-filled metadata from the local IMDb dataset (best 11k titles).
  const [meta, setMeta] = useState<{
    title: string
    year: string
    genres: string[]
    runtimeMinutes: number | null
    seasons: { season: number; episodes: number }[] | null
  } | null>(null)
  const { toggleWatchlist, isInWatchlist, recordPlay, updateProgress } = useLibrary()
  const { toast } = useToast()
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
      // Only persist every 30s to avoid hammering the DB.
      if (position > 0 && position % 30 === 0) {
        updateProgress(title.imdbId, pct, position, duration)
      }
    },
  })

  // Auto-fill: when the player opens, fetch real metadata from the backend
  // (local 11k-title dataset). This populates title/year/genres AND the real
  // season/episode counts for series.
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
        })
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

  // Record to "Continue Watching" on mount and whenever season/episode changes.
  // Uses auto-filled metadata when available so history shows real titles.
  useEffect(() => {
    recordPlay({
      imdbId: title.imdbId,
      title: displayTitle,
      type: title.type,
      poster: title.poster ?? null,
      year: displayYear || null,
      overview: title.overview ?? null,
      rating: title.rating ?? null,
      season: isSeries ? season : null,
      episode: isSeries ? episode : null,
    })
  }, [season, episode, displayTitle, displayYear])

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

  // Auto-fallback with timeout heuristic (Enhancement A):
  //   - When a video source is selected, start an 8s timer.
  //   - If the iframe doesn't fire onLoad within 8s, automatically advance to
  //     the next WORKING server (skip dead ones when health data is available).
  //   - Stop auto-advancing after 3 attempts (don't loop forever).
  //   - "Trying server N of M…" toast on each advance.
  //   - Reset by manual "Next server" click or "Reload" (see handlers below).
  //   - Runs on ALL platforms (desktop + mobile). On mobile with no health
  //     data, falls back to MOBILE_FALLBACK_CHAIN; on desktop, to all tier<5.
  //   - Skipped for Arabic providers (they have their own search/extract flow
  //     with its own loading states and shouldn't be auto-cycled).
  useEffect(() => {
    if (loaded) return
    if (isArabicProvider) return
    const timer = setTimeout(() => {
      if (loaded) return
      fallbackIdxRef.current += 1
      // Cap at 3 attempts so we don't cycle forever
      if (fallbackIdxRef.current > 3) return
      // Build the fallback chain. Prefer health-sorted working servers;
      // fall back to MOBILE_FALLBACK_CHAIN (mobile) or all alive tier<5
      // (desktop) when no health data is available yet.
      const healthKeys = Object.keys(health)
      let chain: VideoSource[]
      if (healthKeys.length > 0) {
        chain = VIDEO_SOURCES
          .filter((s) => health[s.id]?.ok && s.tier < 5)
          .sort(
            (a, b) => (health[a.id]?.latencyMs ?? 0) - (health[b.id]?.latencyMs ?? 0)
          )
      } else if (isMobile) {
        chain = MOBILE_FALLBACK_CHAIN
      } else {
        chain = VIDEO_SOURCES.filter((s) => s.tier < 5)
      }
      if (chain.length === 0) return
      const currentIdx = chain.findIndex((s) => s.id === sourceId)
      const nextIdx = (currentIdx + 1) % chain.length
      const next = chain[nextIdx]
      if (next && next.id !== sourceId) {
        setSourceId(next.id)
        lastProvider.set(title.imdbId, next.id)
        setReloads((r) => r + 1)
        toast({
          title: `Trying server ${fallbackIdxRef.current + 1} of ${chain.length}…`,
          description: next.name,
        })
      }
    }, 8000)
    return () => clearTimeout(timer)
  }, [sourceId, reloads, loaded, isMobile, isArabicProvider, title.imdbId, lastProvider, toast, health])
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
  // position to WatchHistory. Also if the iframe never loaded on mobile,
  // report the current provider as broken so future users see a warning.
  const handleClose = useCallback(() => {
    stopProgress()
    if (!loaded && isMobile) reportProvider(sourceId, false)
    onClose()
  }, [stopProgress, loaded, isMobile, reportProvider, sourceId, onClose])

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
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/95 backdrop-blur-sm nf-scroll"
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
          aria-label="Close player"
          className="absolute right-3 top-3 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Fullscreen button overlay (left of close button) */}
        <button
          onClick={toggleFullscreen}
          className="absolute right-14 top-3 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          aria-label="Fullscreen"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>

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
                          "rounded-md px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm transition",
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
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/90"
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
                  const ah = health[a.id]
                  const bh = health[b.id]
                  // No health data → fall back to tier-based "alive" heuristic
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
              aria-label={t("reload")}
              title={`${t("reload")} (R)`}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleNextServer}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              aria-label="Next server"
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

        {/* Netflix-style episode grid for series */}
        {isSeries && (
          <EpisodeGrid
            season={season}
            episode={episode}
            totalEpisodes={currentSeasonEpisodes}
            onChange={(ep) => {
              setEpisode(ep)
              setLoaded(false)
            }}
          />
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
