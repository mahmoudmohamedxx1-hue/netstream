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
  MOBILE_SOURCES,
  ARABIC_SOURCES,
  SOURCE_TABS,
  MOBILE_FALLBACK_CHAIN,
  buildPlayerUrl,
  getSource,
  isValidSourceId,
  type VideoSource,
} from "@/lib/vidsrc"
import { useLibrary } from "@/lib/library-store"
import { useToast } from "@/hooks/use-toast"
import { usePictureInPicture } from "@/hooks/use-pip"
import { useIsMobile } from "@/hooks/use-mobile"
import { estimateHourlyData, estimateTotalData, parseQuality } from "@/lib/data-usage"
import { useLastProvider } from "@/hooks/use-last-provider"
import { usePlaybackProgress } from "@/hooks/use-playback-progress"
import { useLang } from "@/lib/lang-context"
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

// ── Preferred providers (top 5, live-tested 2026-10) ──────────────────────
// These are tried first by the auto-switch logic, in this order.
// 2026-10-08 live test (real browser): VidSpark leads — framed direct,
// correct runtimes, movies + series. AnyEmbed aggregates 20+ servers behind
// one embed. The old vidlink/vidcore/vidfast/videasy family was REMOVED —
// their anti-embed probes break every playback path (see src/lib/vidsrc.ts).
const PREFERRED_PROVIDERS = ["moviesapi.to", "anyembed"]
// TMDB-supporting providers — used when a title has no IMDB ID (tmdb- prefix).
// AnyEmbed accepts /embed/tmdb-movie-{id} and /embed/tmdb-tv-{id}-{s}-{e}.
const TMDB_PROVIDERS = ["anyembed"]

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
// Default provider: VidSpark everywhere — the strongest verified server
// (2026-10-08 live test: framed direct, correct runtimes, movie + series).
function sourceForQuality(quality: string, isMobile: boolean): string {
  if (isMobile) {
    switch (quality) {
      case "1080p":
        return "moviesapi.to"
      case "720p":
        return "anyembed"
      case "480p":
        return "anyembed"
      default:
        return "moviesapi.to" // auto → VidSpark on mobile
    }
  }
  switch (quality) {
    case "1080p":
      return "moviesapi.to"
    case "720p":
      return "anyembed"
    case "480p":
      return "anyembed"
    default:
      return "moviesapi.to" // auto → VidSpark on desktop
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

function PlayerShell({ title, onClose }: { title: PlayerTitle; onClose: () => void }) {
  // Detect mobile so we can default to a mobile-optimized provider (touch UI).
  const isMobile = useIsMobile()
  const lastProvider = useLastProvider()
  const { t } = useLang()
  const [quality, setQuality] = useState<string>("auto")
  const savedSourceId = title.sourceId ?? undefined
  const isTmdbOnly = title.imdbId?.startsWith("tmdb-")
  // Default provider: VidSpark — strongest verified server (2026-10-08 live
  // test). A saved/last provider wins, BUT only if it still exists in the
  // catalog — users who last used a removed provider (vidlink etc.) get a
  // clean fallback instead of a phantom server id.
  const savedLastProvider = lastProvider.get(title.imdbId)
  const defaultSource =
    (savedSourceId && isValidSourceId(savedSourceId) ? savedSourceId : undefined) ||
    (savedLastProvider && isValidSourceId(savedLastProvider) ? savedLastProvider : undefined) ||
    // TMDB-only titles (no IMDb id) can ONLY play on TMDB-keyed providers —
    // VidSpark would get a garbage /movie/ URL (user-reported "HTTP 403"/
    // black screen). AnyEmbed accepts tmdb-{id} directly.
    (isTmdbOnly ? "anyembed" : "moviesapi.to")
  const [sourceId, setSourceId] = useState<string>(defaultSource)
  const [season, setSeason] = useState<number>(title.season ?? 1)
  const [episode, setEpisode] = useState<number>(title.episode ?? 1)
  const [reloads, setReloads] = useState(0)
  // True when the current server has been loading for 20s+ without firing
  // onLoad — the provider most likely has no stream for this title (e.g.
  // vidlink on obscure Arabic cinema) and would spin forever. We then show a
  // stronger "switch server" hint in the loading overlay.
  const [slowLoad, setSlowLoad] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [prechecking, setPrechecking] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [subtitleOpen, setSubtitleOpen] = useState(false)
  const [serverCheckOpen, setServerCheckOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("primary")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<((opts: { title: string; description?: string }) => void) | null>(null)
  // When the player was opened — used to avoid reporting a provider as broken
  // when the user closes the modal within seconds (a quick close is a user
  // decision, not a provider failure).
  const openedAtRef = useRef<number>(Date.now())

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

  // Top-navigation hijack guard. The streaming embeds are cross-origin
  // iframes that CANNOT be sandboxed (providers refuse to play in sandboxed
  // frames), and their ad scripts occasionally try window.top.location = …
  // which silently replaces the whole app. NetStream is a SPA — every
  // internal navigation uses the History API and external links open in new
  // tabs — so any top-level unload while the player is open is unsolicited.
  // The browser's native leave-confirmation dialog stops it. Scoped to the
  // player's lifetime so it never interferes with normal browsing.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome requires returnValue to be set to show the dialog.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [])

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

  // Pre-check ref — used by the disabled pre-check effect below.
  const precheckDoneRef = useRef(false)
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
    originalLanguage: string | null
  } | null>(null)
  // True once the /api/tmdb lookup has settled (success OR failure). Used to
  // hold TMDB-keyed providers (AnyEmbed) until we know the TMDB id —
  // avoids a wasted first load with the IMDb id ("couldn't find this
  // content" flash) before the URL switches.
  const [tmdbMetaDone, setTmdbMetaDone] = useState(false)
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

  // 30-second watch-success reporter needs `loaded`; the slow-load timer
  // resets on every server/episode/reload change and flips `slowLoad` after
  // 20s without onLoad firing.
  useEffect(() => {
    setSlowLoad(false)
    if (loaded) return
    const timer = setTimeout(() => setSlowLoad(true), 20_000)
    return () => clearTimeout(timer)
  }, [loaded, sourceId, reloads, season, episode, title.imdbId])

  // ── Auto-fallback chain (2026-10-09) ──────────────────────────────────
  // "Nothing plays at all" fix: when the AUTO-SELECTED provider shows no
  // sign of life (iframe never fires onLoad, or loads its shell but never
  // plays — e.g. VidSpark on a title whose sources all 502), automatically
  // advance to the next provider with a toast. A provider that already
  // failed for THIS (title, season, episode) is never retried, so the chain
  // always terminates. MANUAL server picks are always respected — the chain
  // only runs while the user hasn't interacted with the source picker.
  const failedChainRef = useRef<Set<string>>(new Set())
  const chainExhaustedRef = useRef(false)
  const [chainExhausted, setChainExhausted] = useState(false)
  // Reset the chain when the episode/context changes.
  useEffect(() => {
    failedChainRef.current = new Set()
    chainExhaustedRef.current = false
    setChainExhausted(false)
  }, [title.imdbId, title.type, season, episode])

  // Chain order: Arabic content starts on ArabSeed (it indexes Arabic
  // titles the global CDNs don't carry), then VidSpark (IMDb-keyed — only
  // when an IMDb id exists), then AnyEmbed last (its multi-server check UI
  // is slow but covers TMDB-keyed catalogs).
  const isArabicTitle = meta?.originalLanguage === "ar"
  const providerChain = useMemo(() => {
    const chain: string[] = []
    if (isArabicTitle) chain.push("mycima")
    if (!isTmdbOnly) chain.push("moviesapi.to")
    chain.push("anyembed")
    return chain
  }, [isArabicTitle, isTmdbOnly])

  // Report provider outcome (working/broken) to /api/provider-stats. Used by
  // the auto-fallback chain, the arabic fallback and handleNextServer — must
  // be declared above all of them (TDZ: deps arrays evaluate during render).
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
        // FUNCTIONAL update — never clobber fields the /api/tmdb fetch may
        // have already set. CRITICAL: /api/titles (uncached DB lookup) often
        // resolves AFTER /api/tmdb; a plain setMeta({...}) would wipe the
        // tmdbId and revert the player URL to the IMDb ID — which AnyEmbed's
        // TMDB-keyed routes can't resolve (wider catalog comes from TMDB ids).
        setMeta((prev) => ({
          title: prev?.title ?? t.title,
          year: prev?.year ?? t.year,
          genres: prev?.genres ?? t.genres ?? [],
          runtimeMinutes: prev?.runtimeMinutes ?? t.runtimeMinutes ?? null,
          seasons: prev?.seasons ?? t.seasons ?? null,
          tmdbId: prev?.tmdbId ?? t.tmdbId ?? null,
          poster: prev?.poster ?? t.poster ?? null,
          backdrop: prev?.backdrop ?? null,
          originalLanguage: prev?.originalLanguage ?? null,
        }))
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
        const originalLanguage = tmdbData?.originalLanguage ?? tmdbData?.original_language ?? null
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
            originalLanguage: originalLanguage ?? prev?.originalLanguage ?? null,
          }))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTmdbMetaDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [title.imdbId])

  // ── Arabic-language titles → default to the Arabic provider ──────────────
  // The global providers only carry POPULAR Arabic titles — most Arabic
  // cinema isn't on their CDNs and playback then hangs forever. When the TMDB
  // lookup reports original_language "ar" and the user hasn't already chosen
  // a server for this title (no saved sourceId, no last-provider preference),
  // switch to ArabSeed (MyCima), which searches Arabic sites by title. User
  // choices always win.
  const arabicDefaultRef = useRef(false)
  const hasSavedProvider =
    !!savedSourceId || !!lastProvider.get(title.imdbId)
  useEffect(() => {
    if (arabicDefaultRef.current) return
    if (userInteractedRef.current) return
    if (hasSavedProvider) return
    if (meta?.originalLanguage !== "ar") return
    // Only override the session default — never a provider the user picked.
    if (sourceId !== "moviesapi.to") return
    arabicDefaultRef.current = true
    setSourceId("mycima")
    setLoaded(false)
  }, [meta?.originalLanguage, sourceId, hasSavedProvider])

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

  // ── Direct embeds only (2026-10-08) ────────────────────────────────────────
  // The old ad-blocker toggle routed providers through /api/video-proxy so we
  // could inject the Kuro Ads Killer. That proxy now BREAKS every surviving
  // provider: VidSpark renders a blank page, AnyEmbed serves its 404 shell,
  // and the removed vidlink family's stream tokens were bound to the original
  // client IP (server-side fetch exited from the wrong IP → "FETCHING DATA"
  // forever). All global providers therefore load DIRECTLY in the user's
  // browser — cross-origin iframes can't be script-injected anyway, so the
  // toggle was removed from the UI entirely.

  const rawPlayerUrl = useMemo(
    () =>
      buildPlayerUrl({
        imdbId: title.imdbId,
        tmdbId: meta?.tmdbId ?? undefined,
        type: title.type,
        season,
        episode,
        sourceId,
      }),
    [title, season, episode, sourceId, meta?.tmdbId]
  )

  // Global providers always load DIRECTLY — no proxy:
  //  • VidSpark + AnyEmbed render correctly only on their own origin.
  //  • Any Cloudflare negotiation happens in the user's browser, not from
  //    our datacenter IP.
  const playerUrl = rawPlayerUrl

  // Arabic / search-based provider streaming — when the user selects a
  // search-based provider (ArabSeed/MyCima), we:
  //   1. Call /api/arabic-stream to search the Arabic site by title — it
  //      returns direct video-host embed URLs (fastvip.space, hglink.to, …)
  //      plus pre-extracted direct video URLs when available.
  //   2. Sources without a pre-extracted URL go through /api/extract-video as
  //      a health check.
  //   3. The chosen embed plays through /api/video-proxy (same-origin iframe,
  //      correct Referer, ad stripping) — live-tested working.
  const isArabicProvider = source.searchBased === true

  // ── Pre-check DISABLED per user request ──────────────────────────────────
  // The user wants to stay on the selected server — no auto-switching.
  // The user can manually switch servers via the dropdown or "Next" button.
  useEffect(() => {
    // No-op — pre-check auto-switch disabled
    precheckDoneRef.current = true
     
  }, [title.imdbId, title.type, season, episode])
  type ArabicSource = { url: string; host: string; referer?: string; directUrl?: string | null; videoType?: "mp4" | "hls" | null; verified?: boolean; kind?: "embed" | "mp4"; quality?: string }
  type ExtractedSource = { embedUrl: string; host: string; referer: string; videoUrl: string | null; videoType: "mp4" | "hls" | null; status: "pending" | "extracting" | "ready" | "failed"; kind: "embed" | "mp4"; quality?: string }
  const [arabicStream, setArabicStream] = useState<{
    sources: ArabicSource[]
    movieUrl: string | null
    loading: boolean
    error: string | null
    activeSourceIdx: number
  }>({ sources: [], movieUrl: null, loading: false, error: null, activeSourceIdx: 0 })
  const [extractedSources, setExtractedSources] = useState<ExtractedSource[]>([])
  const [activeExtractedIdx, setActiveExtractedIdx] = useState(0)
  // ── Native-video autoplay fallback ─────────────────────────────────────
  // Chrome blocks unmuted autoplay when the page has no user activation yet
  // (e.g. deep-links ?play=…, Continue Watching auto-opens). The video then
  // sits paused at 0:00 and looks "broken". Strategy: try unmuted play();
  // if the browser rejects it, mute and retry — muted autoplay is always
  // allowed — and surface a one-tap "Tap to unmute" pill. The video always
  // shows motion; sound is one tap away.
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null)
  const nativeVideoAutoplayRanRef = useRef<HTMLVideoElement | null>(null)
  const [autoMuted, setAutoMuted] = useState(false)
  const tryAutoplay = useCallback((el: HTMLVideoElement) => {
    el.play().catch(() => {
      el.muted = true
      el.play()
        .then(() => setAutoMuted(true))
        .catch(() => {
          // Even muted autoplay failed (rare): the native controls render a
          // play button — nothing more we can do.
        })
    })
  }, [])
  const unmuteNative = useCallback(() => {
    const el = nativeVideoRef.current
    if (!el) return
    el.muted = false
    el.volume = 1
    setAutoMuted(false)
    el.play().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isArabicProvider) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setArabicStream({ sources: [], movieUrl: null, loading: true, error: null, activeSourceIdx: 0 })
    })
    const searchTitle = displayTitle || title.title
    if (!searchTitle && !title.imdbId) return
    const p = new URLSearchParams({
      site: source.id,
      title: searchTitle,
      type: title.type,
      imdbId: title.imdbId,
    })
    if (title.type === "series") {
      p.set("season", String(season))
      p.set("episode", String(episode))
    }
    fetch(`/api/arabic-stream?${p.toString()}`, { cache: "no-store" })
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
  }, [isArabicProvider, source.id, displayTitle, title.type, title.title, title.imdbId, season, episode])

  // Auto-fallback: if the Arabic provider search returns 0 sources, switch to
  // a verified-working global provider. WHICH one depends on the title's ID
  // scheme: VidSpark (moviesapi.to) is IMDb-keyed — a tmdb-only title (no
  // IMDb ID — common for Arabic series like جعفر العمدة) would produce a
  // garbage URL like moviesapi.to/tv/-1-1 and their server answers
  // HTTP 403 (user-reported). TMDB-only titles must fall back to AnyEmbed
  // (tmdb-keyed routes) instead.
  // Auto-fallback: if the Arabic provider search returns 0 sources, advance
  // the AUTO-FALLBACK CHAIN to the next global provider (chain-aware — never
  // bounces back to a provider that already failed for this episode, and
  // respects manual picks). TMDB-only titles (no IMDb id — common for Arabic
  // series) can only fall back to AnyEmbed; VidSpark would get a garbage
  // /tv/-1-1 URL and answer HTTP 403 (user-reported).
  useEffect(() => {
    if (!isArabicProvider) return
    if (arabicStream.loading) return
    if (arabicStream.sources.length > 0) return
    if (arabicStream.error === null) return // still resolving
    // No sources found — switch to the best provider for this title's IDs
    const timer = setTimeout(() => {
      if (userInteractedRef.current) return // manual pick — respect it
      failedChainRef.current.add(sourceIdRef.current) // mycima had nothing
      const next = providerChain.find((id) => !failedChainRef.current.has(id))
      if (!next) {
        chainExhaustedRef.current = true
        setChainExhausted(true)
        return
      }
      toast({
        title: t("arabicFallback"),
        description: `${displayTitle || title.title} → ${getSource(next).name}`,
      })
      reportProvider(sourceIdRef.current, false)
      setSourceId(next)
      setLoaded(false)
    }, 1500)
    return () => clearTimeout(timer)
  }, [isArabicProvider, arabicStream.loading, arabicStream.sources.length, arabicStream.error, toast, t, displayTitle, title.title, providerChain, reportProvider])

  // Health-check each Arabic source. The API already verifies sources
  // server-side. By kind:
  //   • mp4    → direct MP4 on link.mycima.cv (video/mp4 + ranges + ACAO:*).
  //              Arrives verified (ranged GET probe) → ready, native playback.
  //   • embed  → direct video-host embed (fastvip/hglink). Verified via
  //              extraction or liveness probe → ready; unverified ones get the
  //              client-side /api/extract-video check.
  // (The old "player" kind — iframing MyCima's own mycima-my.com page — was
  //  removed: it showed users the MyCima WEBSITE instead of the title.)
  useEffect(() => {
    if (!isArabicProvider) return
    if (arabicStream.loading) return
    if (arabicStream.sources.length === 0) return

    let cancelled = false
    const myReferer = "https://alking.mycima.cv/"
    // Initialize extraction state (in a microtask to avoid set-state-in-effect)
    const initSources: ExtractedSource[] = arabicStream.sources.map((s) => {
      const kind = s.kind ?? "embed"
      if (kind === "mp4") {
        return {
          embedUrl: s.url, host: s.host, referer: s.referer || myReferer,
          videoUrl: s.directUrl || s.url, videoType: (s.videoType ?? "mp4") as "mp4" | "hls",
          // Attempt playback even when the server-side probe failed — datacenter
          // probes false-negative on some CDNs, and the native <video> onError
          // handler now falls back to the next source if the URL is really dead.
          status: "ready" as const,
          kind, quality: s.quality,
        }
      }
      return {
        embedUrl: s.url, host: s.host, referer: s.referer || myReferer,
        videoUrl: s.directUrl || (s.verified ? s.url : null),
        videoType: s.videoType || null,
        status: s.directUrl || s.verified ? ("ready" as const) : ("pending" as const),
        kind, quality: s.quality,
      }
    })
    Promise.resolve().then(() => {
      if (!cancelled) {
        setExtractedSources(initSources)
        const firstReady = initSources.findIndex((s) => s.status === "ready")
        setActiveExtractedIdx(firstReady >= 0 ? firstReady : 0)
      }
    })

    // Health-check the embed-kind sources that came back unverified
    arabicStream.sources.forEach((src, idx) => {
      if ((src.kind ?? "embed") !== "embed") return // mp4/player handled above
      if (src.directUrl || src.verified) return // already verified server-side
      const referer = src.referer || myReferer
      setExtractedSources((prev) => prev.map((s, i) => i === idx ? { ...s, status: "extracting" } : s))
      fetch(`/api/extract-video?url=${encodeURIComponent(src.url)}&referer=${encodeURIComponent(referer)}&host=${encodeURIComponent(src.host)}`)
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
  // Selection priority: the user-picked source (if not hard-failed), then the
  // first verified one, then the first non-failed one. LAST RESORT: when every
  // embed source failed our server-side extraction/probe, still iframe the
  // first one — the embed host's own JS player runs in the USER's browser and
  // often works from residential networks even when our datacenter probes
  // can't reach the host (verified: hglink/fasvip CDNs block datacenter IPs).
  const picked = extractedSources[activeExtractedIdx]
  const fallbackSource =
    extractedSources.find((s) => s.status !== "failed") ?? extractedSources[0] ?? null
  const currentVideoSource = picked && picked.status !== "failed"
    ? picked
    : activeExtractedSource ?? fallbackSource

  // Playback strategy for Arabic sources, by source kind:
  //   • mp4    → NATIVE <video> element. link.mycima.cv serves video/mp4 with
  //              byte ranges + access-control-allow-origin:*, so it plays and
  //              seeks without any proxy. (Best path for series episodes.)
  //   • embed  → iframe the video-host embed DIRECTLY — never proxied, never a
  //              mycima page. The embed hosts (fastvip.space etc.) mint stream
  //              tokens for the USER's network: fetching them through our
  //              server-side proxy exits from a different IP and breaks. (The
  //              old "player" kind iframed mycima-my.com and showed users the
  //              MyCima website instead of the title — removed 2026-10-08.)
  const currentKind = currentVideoSource?.kind ?? "embed"
  const nativeVideoUrl =
    currentVideoSource && currentKind === "mp4" && currentVideoSource.videoUrl
      ? currentVideoSource.videoUrl
      : null
  const directVideoUrl = currentVideoSource?.embedUrl
    ? currentVideoSource.embedUrl
    : null
  const directVideoType = nativeVideoUrl ? (currentVideoSource?.videoType ?? "mp4") : null

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
      title: displayTitle,
      type: title.type,
      poster: displayPoster ?? title.poster ?? null,
      year: displayYear ?? title.year ?? null,
      overview: title.overview ?? null,
      rating: title.rating ?? null,
    })
    toast({
      title: added ? "Added to My List" : "Removed from My List",
      description: displayTitle,
    })
  }, [title, displayTitle, displayPoster, displayYear, toggleWatchlist, toast])

  const handleQualityChange = (q: string) => {
    setQuality(q)
    const recommended = sourceForQuality(q, isMobile)
    if (recommended !== sourceId) {
      // User-driven change — disable all auto-pick for the rest of this title.
       
      autoPickAppliedRef.current = true
       
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
     
    autoPickAppliedRef.current = true
     
    userInteractedRef.current = true
    setSourceId(id)
    setLoaded(false)
    // Remember this choice for next time the user opens this title.
    // (All catalog providers are verified working 2026-10-08 — no blocklist.)
    lastProvider.set(title.imdbId, id)
  }

  // Report provider outcome (working/broken) — used by the auto-fallback
  // chain, the arabic fallback and handleNextServer. Must stay ABOVE all of
  // them (TDZ: deps arrays evaluate during render).
  //
  // (kept here for reference — actual definition moved above the arabic
  // stream section)


  // "Next server" — advance to the next WORKING server, skipping dead ones
  // (Enhancement C). Uses health data to filter; falls back to tier<5 sources
  // when health data isn't available. Resets the auto-fallback timer (so the
  // new server gets a fresh 8s window) and disables future auto-pick.
  // A4: also reports the current server as broken (the user is moving on
  // because it didn't work) so future opens of this title deprioritise it.
  const handleNextServer = useCallback(() => {
     
    autoPickAppliedRef.current = true
     
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
    // For TMDB-only titles, filter to only TMDB-supporting providers
    if (isTmdbOnly) {
      chain = chain.filter((s) => s.useTmdbId)
    }
    // Search-based providers (ArabSeed) only make sense for Arabic titles —
    // cycling an English title through an Arabic-site search wastes a click
    // (it finds nothing and auto-falls back anyway).
    if (meta?.originalLanguage !== "ar") {
      chain = chain.filter((s) => !s.searchBased)
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
  }, [sourceId, health, title.imdbId, lastProvider, toast, reportProvider, isTmdbOnly, meta?.originalLanguage])

  // ── Auto-fallback chain — the advance step (defined here, after its deps) ──
  // Advances to the next untried provider in the chain. Runs ONLY while the
  // user hasn't manually picked a server. When the chain is exhausted the
  // loading overlay switches to a "no working server" panel (manual options).
  const advanceChain = useCallback(
    (reasonKey: "noLoad" | "noStream") => {
      if (userInteractedRef.current) return // respect manual picks
      const current = sourceIdRef.current
      if (failedChainRef.current.has(current)) return // already marked failed
      failedChainRef.current.add(current)
      const next = providerChain.find((id) => !failedChainRef.current.has(id))
      if (!next) {
        if (!chainExhaustedRef.current) {
          chainExhaustedRef.current = true
          setChainExhausted(true)
        }
        return
      }
      reportProvider(current, false)
      toast({
        title: t("autoSwitchToast"),
        description: `${getSource(current).name} ${reasonKey === "noLoad" ? "didn't load" : "has no stream for this title"} → ${getSource(next).name}`,
      })
      setSourceId(next)
      setLoaded(false)
    },
    [providerChain, toast, t, reportProvider]
  )

  // User-interaction signal: clicking inside the provider iframe (play /
  // pause / fullscreen / quality) moves focus into it — window blur fires
  // and activeElement becomes the iframe element. That means the user is
  // actively using the provider's player → cancel ALL auto-advance for this
  // session (never interrupt a stream the user is watching).
  useEffect(() => {
    const onBlur = () => {
      const el = document.activeElement as HTMLElement | null
      if (el && el.tagName === "IFRAME") {
        userInteractedRef.current = true
        // also dismiss the exhausted panel if it's up — the user chose this server
        if (chainExhaustedRef.current) {
          chainExhaustedRef.current = false
          setChainExhausted(false)
        }
      }
    }
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [])

  // Trigger 1 — the iframe never even fires onLoad (provider down / blocked).
  useEffect(() => {
    if (isArabicProvider) return // arabic flow resolves via its own API
    if (loaded) return
    const timer = setTimeout(() => advanceChain("noLoad"), 15_000)
    return () => clearTimeout(timer)
  }, [loaded, sourceId, reloads, isArabicProvider, advanceChain])

  // Trigger 2 — the iframe loaded its shell but nothing played for 150s AND
  // the user never interacted with the player. Cross-origin iframes expose
  // NO playback signal, so this is unavoidably time-based. 2026-10-10 live
  // re-test RAISED this from 75s → 150s: VidSpark's HLS regularly takes
  // 60-100s to show first frames through its flaky proxies (verified: the
  // chain interrupted a stream that was actively buffering the Sony logo on
  // Spider-Man). A user facing a truly dead server clicks "Not playing?
  // Switch server" (always visible) long before 150s; a slow stream gets a
  // fair chance. Canceled by any interaction with the player iframe.
  useEffect(() => {
    if (isArabicProvider) return
    if (!loaded) return
    const timer = setTimeout(() => advanceChain("noStream"), 150_000)
    return () => clearTimeout(timer)
  }, [loaded, sourceId, reloads, isArabicProvider, advanceChain])

  // ── Click-to-play hint ─────────────────────────────────────────────────
  // The surviving providers (VidSpark, AnyEmbed) load a player shell that
  // does NOT autoplay until the user clicks ▶ inside it (their nested
  // iframes don't inherit our page's activation). Users read the resulting
  // black screen as "nothing opens". Show a short, non-blocking hint right
  // after the iframe loads so they know to click. Auto-hides after 18s.
  const [showPlayHint, setShowPlayHint] = useState(false)
  useEffect(() => {
    if (isArabicProvider) return
    if (!loaded) return
    setShowPlayHint(true)
    const timer = setTimeout(() => setShowPlayHint(false), 18_000)
    return () => clearTimeout(timer)
  }, [loaded, sourceId, reloads, isArabicProvider])

  // ── Auto-fallback (old, time-based) — superseded by the chain above ──────
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // No-op — replaced by advanceChain + triggers above
  }, [sourceId, title.imdbId])
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
    // Only report a mobile quick-close as a failure if the player was open
    // long enough (≥10s) for the provider to have had a fair chance.
    if (!loaded && isMobile && Date.now() - openedAtRef.current >= 10000) {
      reportProvider(sourceId, false)
    }
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
  }, [])  

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
     
    autoPickAppliedRef.current = true
     
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

  // ── Drag-down-to-close (mobile sheet gesture) ─────────────────────────
  // The video itself is a cross-origin iframe, so touches over it never
  // reach us — but the card chrome (top strip, resume banner, controls,
  // episode list) is ours, and dragging down there is a natural close.
  // Scroll-safe: the gesture only engages while the overlay is scrolled to
  // the top; the moment it turns into a page scroll it cancels. Vertical-
  // dominant drags ≥ 90px release-close; shorter drags spring back.
  const rootScrollRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [dragY, setDragY] = useState(0)

  const onCardTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const scroller = rootScrollRef.current
    if (!scroller || scroller.scrollTop > 2) return
    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onCardTouchMove = (e: React.TouchEvent) => {
    const s = dragStartRef.current
    if (!s) return
    const scroller = rootScrollRef.current
    if (scroller && scroller.scrollTop > 2) {
      // Became a page scroll — abort the gesture.
      dragStartRef.current = null
      setDragY(0)
      return
    }
    const dy = e.touches[0].clientY - s.y
    const dx = e.touches[0].clientX - s.x
    if (dy > 0 && dy > Math.abs(dx) * 1.2) setDragY(Math.min(dy, 200))
    else setDragY(0)
  }
  const onCardTouchEnd = () => {
    const shouldClose = dragY >= 90
    dragStartRef.current = null
    setDragY(0)
    if (shouldClose) handleClose()
  }

  return (
    <motion.div
      ref={rootScrollRef}
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
        animate={{ y: dragY, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", damping: dragY > 0 ? 200 : 26, stiffness: dragY > 0 ? 2000 : 240 }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onCardTouchStart}
        onTouchMove={onCardTouchMove}
        onTouchEnd={onCardTouchEnd}
        onTouchCancel={onCardTouchEnd}
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
                        onClick={() => s.status !== "failed" && setActiveExtractedIdx(idx)}
                        disabled={s.status === "failed"}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[10px] font-bold transition",
                          idx === activeExtractedIdx && s.status !== "failed"
                            ? "bg-primary text-primary-foreground"
                            : s.status === "ready"
                              ? "bg-black/70 text-white/80 hover:bg-black/90"
                              : s.status === "extracting"
                                ? "bg-black/50 text-white/40"
                                : s.status === "failed"
                                  ? "bg-black/50 text-red-400/40"
                                  : "bg-black/50 text-white/50"
                        )}
                        title={s.embedUrl}
                      >
                        {s.status === "extracting" ? "⏳" : s.status === "failed" ? "✗" : ""}
                        {s.host}{s.quality ? ` · ${s.quality}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {nativeVideoUrl ? (
                  /* Direct MP4 (link.mycima.cv) — native <video>: no iframe, no
                     ads, seeking works via byte ranges, plays cross-origin
                     thanks to access-control-allow-origin:*. If the URL is
                     dead (datacenter probes can false-negative → we attempt
                     unverified sources), onError marks this source failed and
                     auto-advances to the next one instead of a black screen. */
                  <video
                    key={nativeVideoUrl}
                    ref={(el) => {
                      nativeVideoRef.current = el
                      // Inline refs re-run on every render — only kick the
                      // autoplay sequence when a NEW element actually mounted
                      // (key={nativeVideoUrl} remount), never on re-renders of
                      // the same element (that would reset autoMuted to false
                      // and hide the unmute pill right after it appears).
                      if (el && el !== nativeVideoAutoplayRanRef.current) {
                        nativeVideoAutoplayRanRef.current = el
                        // New source mounted — clear any stale muted state,
                        // then attempt autoplay (unmuted → muted fallback).
                        setAutoMuted(false)
                        tryAutoplay(el)
                      }
                    }}
                    src={nativeVideoUrl}
                    controls
                    autoPlay
                    playsInline
                    onError={() => {
                      setExtractedSources((prev) =>
                        prev.map((s) =>
                          s.videoUrl === nativeVideoUrl || s.embedUrl === nativeVideoUrl
                            ? { ...s, status: "failed" as const }
                            : s
                        )
                      )
                      // Jump to the next non-failed source (if any)
                      setActiveExtractedIdx((prev) => {
                        const next = extractedSources.findIndex(
                          (s, i) => i !== prev && s.status !== "failed"
                        )
                        return next >= 0 ? next : prev
                      })
                    }}
                    className="absolute inset-0 h-full w-full bg-black"
                  />
                ) : (
                  <iframe
                    key={directVideoUrl}
                    src={directVideoUrl}
                    title={title.title}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; web-share"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    // NOTE: intentionally NO sandbox attribute — live-tested
                    // 2026-10-09: the Arabic video-host embeds (fastvip.space,
                    // hglink.to, …) run the same 3-probe anti-embed framework as
                    // the vidlink family. Their script reads window.frameElement
                    // and, when ANY sandbox attribute is present, refuses to
                    // play and renders "Sandboxed embed is not allowed! /
                    // Please contact your website owner!" (user-reported as the
                    // "sandbox error"). Without the attribute the player loads
                    // and plays normally. Popunder ad hijacks (window.top
                    // navigation) are mitigated by the scoped beforeunload
                    // guard mounted for the player's lifetime — NOT by
                    // sandboxing, which breaks playback outright.
                    className="absolute inset-0 h-full w-full"
                  />
                )}
                {/* Unmute pill — shown when autoplay fell back to MUTED (the
                    browser blocked unmuted autoplay because the page had no
                    user activation yet, e.g. deep-links). One tap restores
                    sound. */}
                {nativeVideoUrl && autoMuted && (
                  <button
                    onClick={unmuteNative}
                    className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs font-semibold text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-black/95"
                  >
                    <span className="text-sm">🔇</span>
                    {t("tapToUnmute")}
                  </button>
                )}
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
              {/* TMDB-keyed providers (AnyEmbed): hold the iframe until
                  the TMDB id is known — loading them with the IMDb id first
                  shows a "couldn't find this content" error for ~1s before
                  the URL switches. The lookup is fast (force-cache) and if it
                  fails we proceed with whatever we have. */}
              {(() => {
                const waitingForTmdb =
                  source.useTmdbId && !isTmdbOnly && !tmdbMetaDone
                return (
                  <>
                    {(!loaded || waitingForTmdb || chainExhausted) && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-4 text-center">
                        {chainExhausted && !waitingForTmdb ? (
                          <>
                            <AlertCircle className="h-10 w-10 text-white/40" />
                            <p className="text-sm font-semibold text-white/80">
                              {t("noServerFound")}
                            </p>
                            <p className="max-w-md text-xs text-white/50">
                              {t("noServerFoundHint")}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  failedChainRef.current = new Set()
                                  chainExhaustedRef.current = false
                                  setChainExhausted(false)
                                  setLoaded(false)
                                  setReloads((r) => r + 1)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                                {t("retry")}
                              </button>
                              <button
                                onClick={() => handleNextServer()}
                                className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                              >
                                <SkipForward className="h-3.5 w-3.5" />
                                {t("nextServer")}
                              </button>
                              <button
                                onClick={() => {
                                  // Hide the panel, give the CURRENT server
                                  // unlimited time (it keeps loading underneath),
                                  // and STOP the auto-chain for this session —
                                  // the user explicitly chose to wait.
                                  userInteractedRef.current = true
                                  chainExhaustedRef.current = false
                                  setChainExhausted(false)
                                }}
                                className="rounded-md px-4 py-1.5 text-xs font-semibold text-white/60 transition hover:text-white"
                              >
                                {t("keepWaiting")}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                            <p className="text-sm text-white/60">
                              {t("loading")} {source.name}…
                            </p>
                            <p className="text-xs text-white/40">
                              {slowLoad && !waitingForTmdb ? t("slowServer") : t("ifNothingPlays")}
                            </p>
                            <p className="mt-2 hidden text-[10px] text-white/30 sm:block">
                              ⌨ R: reload · N: next server · T: test · F: fullscreen · Esc: close
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {/* "Not playing?" helper — manual switch to next server */}
                    <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2">
                      <button
                        onClick={() => handleNextServer()}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-black/90"
                        title="Switch to the next server"
                      >
                        <SkipForward className="h-3 w-3" />
                        Not playing? Switch server
                      </button>
                    </div>
                    {/* Click-to-play hint — providers don't autoplay until the
                        user clicks ▶ inside their player. Non-blocking pill at
                        the bottom of the video area; auto-hides after 18s. */}
                    {loaded && showPlayHint && !chainExhausted && (
                      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
                        <div className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-[11px] font-semibold text-white/90 shadow-lg ring-1 ring-white/15 backdrop-blur">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px]">▶</span>
                          {t("clickPlayHint")}
                        </div>
                      </div>
                    )}
                    {!waitingForTmdb && (
                      <iframe
                        key={`${sourceId}-${reloads}`}
                        src={playerUrl}
                        title={title.title}
                        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; web-share"
                        allowFullScreen
                        referrerPolicy="no-referrer"
                        // NOTE: intentionally NO sandbox attribute — streaming
                        // providers refuse to play inside sandboxed frames and
                        // several run sandbox self-checks ("Please Disable
                        // Sandbox"). Top-navigation hijacks from embed ad
                        // scripts are mitigated by the scoped beforeunload
                        // guard below instead.
                        onLoad={() => setLoaded(true)}
                        className="absolute inset-0 h-full w-full"
                      />
                    )}
                  </>
                )
              })()}
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
            <SelectTrigger className="h-9 w-[200px] border-white/20 bg-white/5 text-xs text-white">
              <ProviderLogo source={source} size="sm" />
              <span className="truncate text-white/80">
                <span className="text-white/50">Server:</span>{" "}
                <span className="font-semibold text-white">{source.name}</span>
              </span>
              {/* Data usage badge — shows total estimated data for THIS title
                  (not a fixed hourly rate), so it differs from title to title.
                  Falls back to hourly rate if runtime is unknown. */}
              <span className={cn("ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-bold", parseQuality(source.quality).color)}>
                {meta?.runtimeMinutes
                  ? estimateTotalData(source.quality, meta.runtimeMinutes)
                  : estimateHourlyData(source.quality)}
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
                          {/* Data usage estimate — total for THIS title (differs
                              per title based on runtime), falls back to hourly
                              rate if runtime unknown. Helps users save internet. */}
                          <span className="text-cyan-400/70">
                            {" "}• {meta?.runtimeMinutes
                              ? estimateTotalData(s.quality, meta.runtimeMinutes)
                              : estimateHourlyData(s.quality)}
                          </span>
                          {/* Also show hourly rate so users can compare */}
                          {meta?.runtimeMinutes ? (
                            <span className="text-white/30">
                              {" "}({estimateHourlyData(s.quality)})
                            </span>
                          ) : null}
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
              src={displayPoster}
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

      {/* Download helper dialog — explicit props (no URL scraping: fixes the
          series-download bug where /tv/ was encoded inside the proxy URL) */}
      <DownloadHelper
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        imdbId={title.imdbId}
        type={title.type}
        season={season}
        episode={episode}
        title={displayTitle}
        poster={displayPoster}
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
