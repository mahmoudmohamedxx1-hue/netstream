"use client"

// Netflix-style hover preview card.
//
// When a user hovers a poster for ~500ms, an expanded card pops up that:
//   • plays a muted, autoplaying YouTube trailer (lazy-fetched on first hover),
//   • shows title / year / rating / match %,
//   • shows Play / +My List / Like / More-info buttons,
//   • animates in with a smooth Framer Motion scale + fade.
//
// The trailer key is fetched lazily because the TMDB /home API doesn't include
// it. We do a two-step fetch:
//   1. /api/tmdb/lookup?tmdbId=…&type=movie|tv   → resolves imdbId
//   2. /api/tmdb/{imdbId}                        → returns trailerKey + genres + backdrop
// Results are cached module-level so subsequent hovers on the same title are
// instant. If anything fails (or there's no trailer), we fall back to the
// backdrop image with a gradient overlay.

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Play, Plus, Check, Star, ThumbsUp, ChevronDown, Film, Tv, Loader2 } from "lucide-react"
import { Poster } from "./poster"
import { useLibrary } from "@/lib/library-store"
import { useToast } from "@/hooks/use-toast"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

export type HoverPreviewTitle = {
  tmdbId: number
  imdbId: string | null
  title: string
  type: "movie" | "series"
  year: string
  rating: string | null
  poster: string | null
  backdrop: string | null
  overview: string
}

type Props = {
  title: HoverPreviewTitle
  onPlay: (t: HoverPreviewTitle) => void
  onAddToList?: (t: HoverPreviewTitle) => void
  rank?: number
  // When true, the base card renders as a 16:9 landscape backdrop (Netflix's
  // default for non-Top-10 / non-Continue-Watching rows) instead of a 2:3
  // portrait poster. The expanded hover preview is identical in both modes.
  landscape?: boolean
  // B12 keyboard nav: when true, the card is the keyboard-cursor target and
  // gets a white ring + scale (matching the hover scale). The parent
  // (TmdbHome) drives this from its `focused` state.
  focused?: boolean
  // B12 keyboard nav: callback ref so the parent can register this card's
  // DOM node in its 2D ref array (used for scrollIntoView on focus moves).
  cardRef?: (el: HTMLButtonElement | null) => void
}

type PreviewData = {
  imdbId: string | null
  trailerKey: string | null
  genres: string[]
  backdrop: string | null
}

// Module-level cache keyed by tmdbId (always present on row titles).
// `null` is a valid cached value meaning "we tried and got nothing".
const previewCache = new Map<number, PreviewData | null>()
// In-flight promise dedupe so two simultaneous hovers share a single fetch.
const inflight = new Map<number, Promise<PreviewData | null>>()

function fetchPreview(title: HoverPreviewTitle): Promise<PreviewData | null> {
  if (previewCache.has(title.tmdbId)) {
    return Promise.resolve(previewCache.get(title.tmdbId) ?? null)
  }
  const existing = inflight.get(title.tmdbId)
  if (existing) return existing

  const p = (async (): Promise<PreviewData | null> => {
    try {
      let imdbId = title.imdbId
      // Step 1: resolve imdbId if missing (TMDB home rows ship without it).
      if (!imdbId) {
        const tmdbType = title.type === "series" ? "tv" : "movie"
        const r1 = await fetch(
          `/api/tmdb/lookup?tmdbId=${title.tmdbId}&type=${tmdbType}`,
          { cache: "no-store" }
        )
        const d1 = await r1.json().catch(() => ({}))
        imdbId = d1.imdbId ?? null
      }
      if (!imdbId) {
        previewCache.set(title.tmdbId, null)
        return null
      }
      // Step 2: fetch full TMDB metadata (trailer + genres + backdrop).
      const r2 = await fetch(`/api/tmdb/${encodeURIComponent(imdbId)}`, {
        cache: "no-store",
      })
      const d2 = await r2.json().catch(() => ({}))
      const t = d2.title
      if (!t) {
        previewCache.set(title.tmdbId, null)
        return null
      }
      const data: PreviewData = {
        imdbId,
        trailerKey: t.trailerKey ?? null,
        genres: Array.isArray(t.genres) ? t.genres : [],
        backdrop: t.backdrop ?? null,
      }
      previewCache.set(title.tmdbId, data)
      return data
    } catch {
      previewCache.set(title.tmdbId, null)
      return null
    } finally {
      inflight.delete(title.tmdbId)
    }
  })()
  inflight.set(title.tmdbId, p)
  return p
}

// Round a rating string ("8.034" or "8") to 1 decimal place ("8.0").
// Returns null for invalid input so the caller can skip rendering.
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

// Map a 0–10 TMDB rating to a 50–100 "match" percentage.
function matchPercent(r: string | null | undefined): number | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return Math.round(50 + (n / 10) * 50)
}

export function HoverPreviewCard({ title, onPlay, onAddToList, rank, landscape, focused, cardRef }: Props) {
  const { t, isArabic } = useLang()
  const { toggleWatchlist, isInWatchlist } = useLibrary()
  const { toast } = useToast()

  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  // imdbId resolved by fetchPreview — used for the +My List state when the
  // title ships without an imdbId (TMDB home rows).
  const [resolvedImdbId, setResolvedImdbId] = useState<string | null>(title.imdbId)

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effectiveImdbId = resolvedImdbId ?? title.imdbId
  const inList = effectiveImdbId ? isInWatchlist(effectiveImdbId) : false

  const clearTimers = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    if (videoTimer.current) {
      clearTimeout(videoTimer.current)
      videoTimer.current = null
    }
  }

  const handleEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      setExpanded(true)
      // Use cached preview if available for instant render; otherwise fetch.
      const cached = previewCache.get(title.tmdbId)
      if (cached !== undefined) {
        setPreview(cached)
        setResolvedImdbId(cached?.imdbId ?? title.imdbId)
        if (cached?.trailerKey) {
          videoTimer.current = setTimeout(() => setShowVideo(true), 500)
        }
      } else {
        setPreviewLoading(true)
        fetchPreview(title).then((data) => {
          setPreview(data)
          setPreviewLoading(false)
          setResolvedImdbId(data?.imdbId ?? title.imdbId)
          if (data?.trailerKey) {
            // Wait for the card's scale animation to settle, then swap in
            // the YouTube iframe so the user sees a smooth backdrop → video.
            videoTimer.current = setTimeout(() => setShowVideo(true), 600)
          }
        })
      }
    }, 500)
  }

  const handleLeave = () => {
    clearTimers()
    setExpanded(false)
    setShowVideo(false)
    setPreview(null)
    setPreviewLoading(false)
    setResolvedImdbId(title.imdbId)
  }

  // Cleanup timers if the card unmounts while hovered.
  useEffect(() => {
    return () => clearTimers()
  }, [])

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!effectiveImdbId) return
    if (onAddToList) {
      onAddToList({ ...title, imdbId: effectiveImdbId })
      return
    }
    const added = await toggleWatchlist({
      imdbId: effectiveImdbId,
      title: title.title,
      type: title.type,
      poster: title.poster,
      year: title.year,
      overview: title.overview,
      rating: title.rating,
    })
    toast({
      title: added
        ? isArabic ? "أُضيف إلى قائمتي" : "Added to My List"
        : isArabic ? "أُزيل من قائمتي" : "Removed from My List",
      description: title.title,
    })
  }

  const roundedRating = roundRating(title.rating)
  const matchPct = matchPercent(title.rating)
  const genres = preview?.genres ?? []

  // Use the higher-resolution backdrop from the detail API when available.
  const backdropSrc = preview?.backdrop ?? title.backdrop

  return (
    <div
      className={
        landscape
          ? "group/card relative aspect-video w-[60vw] shrink-0 sm:w-[280px] md:w-[320px]"
          : "group/card relative aspect-[2/3] w-[40vw] shrink-0 sm:w-[180px] md:w-[200px]"
      }
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Rank number for Top 10 rows — kept behind the poster */}
      {rank ? (
        <div className="pointer-events-none absolute -left-3 top-0 z-0 flex h-full items-start">
          <span
            className="select-none font-black leading-none text-transparent"
            style={{
              fontSize: "clamp(72px, 12vw, 120px)",
              WebkitTextStroke: "3px rgba(255,255,255,0.35)",
            }}
          >
            {rank}
          </span>
        </div>
      ) : null}

      <div className="relative z-10 h-full">
        <button
          ref={cardRef}
          tabIndex={0}
          onClick={() => onPlay(title)}
          className={cn(
            "specular-card-outline block h-full w-full overflow-hidden rounded-md bg-neutral-900 text-left transition-transform duration-200 hover:scale-105 hover:z-10",
            // B12 keyboard nav: visible white ring + scale when focused.
            // `focus:outline-none` so we don't double-draw the browser's
            // default outline on top of the ring.
            focused
              ? "z-20 scale-105 ring-2 ring-white ring-offset-2 ring-offset-black focus:outline-none"
              : "focus:outline-none"
          )}
        >
          {/* Inner image container — explicit bg-neutral-900 so the card
              never flashes white while the poster/backdrop <img> is still
              loading over a slow connection. The button already sets
              bg-neutral-900 but we repeat it here as a defense-in-depth
              layer (the inner div is the one that actually contains the
              <img>, so any gap in the image's painted area shows this
              background). */}
          <div className="relative h-full bg-neutral-900">
            {landscape ? (
              <>
                {/* Landscape card: 16:9 backdrop with an always-visible
                    title + year overlay at the bottom. Falls back to the
                    portrait poster (cropped to fill via object-cover) when
                    TMDB has no backdrop for this title. */}
                <Poster
                  title={title.title}
                  src={title.backdrop ?? title.poster}
                  year={title.year}
                  alt={title.title}
                  className="h-full w-full transition duration-300 group-hover/card:opacity-90"
                />
                {/* Rating badge — top-left, same as portrait */}
                {roundedRating && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />
                    {roundedRating}
                  </span>
                )}
                {/* Bottom gradient + title — always visible (Netflix
                    doesn't hide the title on landscape cards). The pt-8
                    gives the gradient room to fade over the backdrop. */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-8">
                  <p className="line-clamp-1 text-xs font-bold text-white drop-shadow">{title.title}</p>
                  {title.year && (
                    <p className="text-[10px] text-white/60">{title.year}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <Poster
                  title={title.title}
                  src={title.poster}
                  year={title.year}
                  alt={title.title}
                  className="h-full w-full transition duration-300 group-hover/card:opacity-90"
                />
                {/* Rating badge — Netflix shows this on the poster */}
                {roundedRating && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />
                    {roundedRating}
                  </span>
                )}
                {/* Hover overlay — only on the base poster, hidden once expanded */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover/card:opacity-100">
                  <p className="line-clamp-2 text-xs font-bold text-white">{title.title}</p>
                  <p className="text-[10px] text-white/60">{title.year}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <Play className="h-3 w-3 fill-current" /> {t("play")}
                  </span>
                </div>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Expanded hover preview — only on md+ screens (mobile taps the poster) */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10, x: "-50%" }}
          animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute left-1/2 top-0 z-50 hidden w-[320px] overflow-hidden rounded-md bg-[#181818] shadow-2xl ring-1 ring-white/10 md:block"
          style={{ transformOrigin: "center top" }}
        >
          {/* 16:9 video / image area */}
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {showVideo && preview?.trailerKey ? (
              <iframe
                key={preview.trailerKey}
                src={`https://www.youtube.com/embed/${preview.trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${preview.trailerKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&enablejsapi=1`}
                title={title.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="pointer-events-none absolute inset-0 h-full w-full"
                frameBorder={0}
              />
            ) : backdropSrc ? (
              <img
                src={backdropSrc}
                alt={title.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <Poster title={title.title} src={title.poster} className="h-full w-full" />
            )}
            {/* Bottom fade into the card body */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
            {/* Type pill — only in the preview, not on the poster */}
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {title.type === "series" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
              {title.type === "series" ? t("seriesShort") : t("movieShort")}
            </span>
            {previewLoading && (
              <div className="absolute bottom-2 right-2 text-white/70">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            )}
          </div>

          {/* Action buttons + metadata */}
          <div className="p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPlay(title)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85"
                aria-label={t("play")}
              >
                <Play className="h-4 w-4 fill-black" />
              </button>
              <button
                onClick={handleAdd}
                disabled={!effectiveImdbId}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition disabled:opacity-40",
                  inList
                    ? "border-white/60 text-white"
                    : "border-white/40 text-white hover:border-white"
                )}
                aria-label={inList ? t("inMyList") : t("myList")}
              >
                {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white"
                aria-label={isArabic ? "أعجبني" : "Like"}
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => onPlay(title)}
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white"
                aria-label={t("moreInfo")}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <h4 className="mt-3 line-clamp-1 text-sm font-bold text-white">
              {title.title}
            </h4>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/70">
              {matchPct != null && (
                <span className="font-semibold text-emerald-400">
                  {matchPct}% {isArabic ? "متطابق" : "match"}
                </span>
              )}
              {roundedRating && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-white">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {roundedRating}
                </span>
              )}
              {title.year && <span>{title.year}</span>}
              <span className="rounded border border-white/30 px-1 text-[9px] uppercase">
                {title.type === "series" ? t("seriesShort") : t("movieShort")}
              </span>
            </div>

            {/* Genre tags — only once we have them from TMDB */}
            {genres.length > 0 && (
              <p className="mt-2 line-clamp-1 text-[11px] text-white/55">
                {genres.slice(0, 3).join(" • ")}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
