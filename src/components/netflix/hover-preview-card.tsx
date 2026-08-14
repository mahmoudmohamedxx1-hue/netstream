"use client"

// Netflix-style hover preview card with React Portal.
//
// FIX 1: The expanded popup is rendered via createPortal to document.body
// with position:fixed, computed from the card's getBoundingClientRect().
// This avoids the CSS spec issue where overflow-x:auto forces overflow-y:auto,
// which clips the popup and forces the user to scroll.
//
// FIX 2: The popup autoplays a muted YouTube trailer (via youtube-nocookie)
// after ~800ms, cross-fading from the backdrop image. If the trailer errors
// or doesn't exist, the backdrop image stays — never a black box.

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Play, Plus, Check, Star, ThumbsUp, ChevronDown, Film, Tv, Loader2, Volume2, VolumeX } from "lucide-react"
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
  landscape?: boolean
  focused?: boolean
  cardRef?: (el: HTMLButtonElement | null) => void
}

type PreviewData = {
  imdbId: string | null
  trailerKey: string | null
  genres: string[]
  backdrop: string | null
}

const previewCache = new Map<number, PreviewData | null>()
const inflight = new Map<number, Promise<PreviewData | null>>()
// Cache of trailer keys that failed to load (so we don't retry)
const failedTrailers = new Set<string>()

function fetchPreview(title: HoverPreviewTitle): Promise<PreviewData | null> {
  if (previewCache.has(title.tmdbId)) return Promise.resolve(previewCache.get(title.tmdbId) ?? null)
  const existing = inflight.get(title.tmdbId)
  if (existing) return existing
  const p = (async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      let imdbId = title.imdbId
      if (!imdbId) {
        const tmdbType = title.type === "series" ? "tv" : "movie"
        const r1 = await fetch(`/api/tmdb/lookup?tmdbId=${title.tmdbId}&type=${tmdbType}`, { cache: "no-store", signal: controller.signal })
        imdbId = (await r1.json().catch(() => ({}))).imdbId ?? null
      }
      if (!imdbId) { previewCache.set(title.tmdbId, null); clearTimeout(timeout); return null }
      const r2 = await fetch(`/api/tmdb/${encodeURIComponent(imdbId)}`, { cache: "no-store", signal: controller.signal })
      clearTimeout(timeout)
      const t = (await r2.json().catch(() => ({}))).title
      if (!t) { previewCache.set(title.tmdbId, null); return null }
      const data: PreviewData = {
        imdbId,
        trailerKey: t.trailerKey ?? null,
        genres: Array.isArray(t.genres) ? t.genres : [],
        backdrop: t.backdrop ?? null,
      }
      previewCache.set(title.tmdbId, data)
      return data
    } catch { previewCache.set(title.tmdbId, null); return null }
    finally { inflight.delete(title.tmdbId) }
  })()
  inflight.set(title.tmdbId, p)
  return p
}

function roundRating(r: string | null | undefined): string | null {
  if (!r) return null; const n = Number(r); return isNaN(n) ? null : n.toFixed(1)
}
function matchPct(r: string | null | undefined): number | null {
  if (!r) return null; const n = Number(r); return isNaN(n) ? null : Math.min(99, Math.max(50, Math.round((n / 10) * 100)))
}

const POPUP_WIDTH = 320
const POPUP_GAP = 8

export function HoverPreviewCard({ title, onPlay, onAddToList, rank, landscape, focused, cardRef }: Props) {
  const { t, isArabic } = useLang()
  const { toggleWatchlist, isInWatchlist } = useLibrary()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)
  const [trailerFailed, setTrailerFailed] = useState(false)
  const [muted, setMuted] = useState(true)
  const [resolvedImdbId, setResolvedImdbId] = useState<string | null>(title.imdbId)
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null)

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trailerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRefInternal = useRef<HTMLButtonElement | null>(null)
  const isHovering = useRef(false) // shared hover state for card + popup

  const effectiveImdbId = resolvedImdbId ?? title.imdbId
  const inList = effectiveImdbId ? isInWatchlist(effectiveImdbId) : false
  const roundedRating = roundRating(title.rating)
  const mp = matchPct(title.rating)
  const genres = preview?.genres ?? []
  const backdropSrc = preview?.backdrop ?? title.backdrop
  const trailerKey = preview?.trailerKey

  // Compute popup position from card's bounding rect, clamped to viewport
  const computePosition = useCallback(() => {
    const el = cardRefInternal.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = rect.left + rect.width / 2 - POPUP_WIDTH / 2
    let top = rect.top
    // Clamp to viewport
    left = Math.max(POPUP_GAP, Math.min(left, window.innerWidth - POPUP_WIDTH - POPUP_GAP))
    top = Math.max(POPUP_GAP, top)
    setPopupPos({ left, top })
  }, [])

  const clearAllTimers = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (trailerTimer.current) { clearTimeout(trailerTimer.current); trailerTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const handleClose = () => {
    clearAllTimers()
    setExpanded(false)
    setShowTrailer(false)
    setTrailerFailed(false)
    setPreview(null)
    setPreviewLoading(false)
    setPopupPos(null)
    setResolvedImdbId(title.imdbId)
  }

  // Reposition on scroll — use a ref to avoid accessing handleClose before declaration
  const handleCloseRef = useRef<() => void>(() => {})
  useEffect(() => { handleCloseRef.current = handleClose })

  useEffect(() => {
    if (!expanded) return
    computePosition()
    const onScroll = () => { computePosition(); if (!isHovering.current) handleCloseRef.current() }
    window.addEventListener("scroll", onScroll, true)
    return () => window.removeEventListener("scroll", onScroll, true)
  }, [expanded, computePosition])

  const handleEnter = () => {
    isHovering.current = true
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      setExpanded(true)
      computePosition()
      const cached = previewCache.get(title.tmdbId)
      if (cached !== undefined) {
        setPreview(cached)
        setResolvedImdbId(cached?.imdbId ?? title.imdbId)
        startTrailerTimer(cached?.trailerKey)
      } else {
        setPreviewLoading(true)
        fetchPreview(title).then(d => {
          setPreview(d)
          setPreviewLoading(false)
          setResolvedImdbId(d?.imdbId ?? title.imdbId)
          startTrailerTimer(d?.trailerKey)
        }).catch(() => setPreviewLoading(false))
      }
    }, 500)
  }

  const startTrailerTimer = (key: string | null | undefined) => {
    if (!key || failedTrailers.has(key)) return
    if (trailerTimer.current) clearTimeout(trailerTimer.current)
    trailerTimer.current = setTimeout(() => setShowTrailer(true), 800)
  }

  const handleLeave = () => {
    isHovering.current = false
    // Small delay so moving from card to popup doesn't close it
    closeTimer.current = setTimeout(() => handleClose(), 200)
  }

  const handlePopupEnter = () => {
    isHovering.current = true
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const handlePopupLeave = () => {
    isHovering.current = false
    closeTimer.current = setTimeout(() => handleClose(), 200)
  }

  useEffect(() => { return () => clearAllTimers() }, [])

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!effectiveImdbId) return
    if (onAddToList) { onAddToList({ ...title, imdbId: effectiveImdbId }); return }
    const added = await toggleWatchlist({ imdbId: effectiveImdbId, title: title.title, type: title.type, poster: title.poster, year: title.year, overview: title.overview, rating: title.rating })
    toast({ title: added ? (isArabic ? "أُضيف إلى قائمتي" : "Added to My List") : (isArabic ? "أُزيل من قائمتي" : "Removed from My List"), description: title.title })
  }

  const trailerSrc = showTrailer && trailerKey && !trailerFailed
    ? `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3`
    : null

  return (
    <>
      <div
        className={cn("group/card relative shrink-0", landscape ? "aspect-video w-[45vw] sm:w-[240px] md:w-[280px]" : "aspect-[2/3] w-[35vw] sm:w-[160px] md:w-[180px]")}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {rank && (
          <div className="pointer-events-none absolute -left-3 top-0 z-0 flex h-full items-start">
            <span className="select-none font-black leading-none text-transparent" style={{ fontSize: "clamp(72px, 12vw, 120px)", WebkitTextStroke: "3px rgba(255,255,255,0.35)" }}>{rank}</span>
          </div>
        )}
        <div className="relative z-10 h-full">
          <button
            ref={(el) => { cardRefInternal.current = el; cardRef?.(el) }}
            onClick={() => onPlay(title)}
            className={cn("specular-card-outline block h-full w-full overflow-hidden rounded-md bg-neutral-900 text-left transition-transform duration-200 hover:scale-105", focused ? "z-20 scale-105 ring-2 ring-white ring-offset-2 ring-offset-black focus:outline-none" : "focus:outline-none")}
          >
            <div className="relative h-full bg-neutral-900">
              {landscape ? (
                <>
                  <Poster title={title.title} src={title.backdrop ?? title.poster} year={title.year} alt={title.title} className="h-full w-full" />
                  {roundedRating && <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm"><Star className="h-2.5 w-2.5 fill-yellow-400" />{roundedRating}</span>}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-8">
                    <p className="line-clamp-1 text-xs font-bold text-white drop-shadow">{title.title}</p>
                    {title.year && <p className="text-[10px] text-white/60">{title.year}</p>}
                  </div>
                </>
              ) : (
                <>
                  <Poster title={title.title} src={title.poster} year={title.year} alt={title.title} className="h-full w-full" />
                  {roundedRating && <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm"><Star className="h-2.5 w-2.5 fill-yellow-400" />{roundedRating}</span>}
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover/card:opacity-100">
                    <p className="line-clamp-2 text-xs font-bold text-white">{title.title}</p>
                    <p className="text-[10px] text-white/60">{title.year}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary"><Play className="h-3 w-3 fill-current" /> {t("play")}</span>
                  </div>
                </>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Portal popup — rendered to document.body with position:fixed */}
      {expanded && popupPos && typeof document !== "undefined" && createPortal(
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed z-[200] overflow-hidden rounded-lg bg-[#181818] shadow-2xl ring-1 ring-white/10"
          style={{ left: popupPos.left, top: popupPos.top, width: POPUP_WIDTH, transformOrigin: "center top" }}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
        >
          {/* 16:9 video / image area */}
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {/* Backdrop image — always rendered underneath so there's never a black flash */}
            {backdropSrc ? (
              <img src={backdropSrc} alt={title.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Poster title={title.title} src={title.poster} className="absolute inset-0 h-full w-full" />
            )}
            {/* YouTube trailer — cross-fades in on top of the backdrop */}
            {trailerSrc && (
              <iframe
                key={trailerKey}
                src={trailerSrc}
                title={title.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                className="absolute inset-0 h-full w-full"
                style={{ opacity: showTrailer ? 1 : 0, transition: "opacity 0.5s" }}
                frameBorder={0}
                onError={() => { if (trailerKey) failedTrailers.add(trailerKey); setTrailerFailed(true); setShowTrailer(false) }}
              />
            )}
            {/* 5s watchdog: if trailer hasn't shown, give up gracefully */}
            {showTrailer && trailerKey && !trailerFailed && (
              <TrailerWatchdog key={trailerKey} onTimeout={() => { failedTrailers.add(trailerKey); setTrailerFailed(true); setShowTrailer(false) }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {title.type === "series" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
              {title.type === "series" ? t("seriesShort") : t("movieShort")}
            </span>
            {/* Mute toggle */}
            {showTrailer && !trailerFailed && (
              <button
                onClick={() => setMuted(m => !m)}
                className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full border border-white/40 bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            )}
            {previewLoading && (
              <div className="absolute bottom-2 right-2 text-white/70"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
            )}
          </div>

          {/* Action buttons + metadata — all in the same card, no scrolling needed */}
          <div className="p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => onPlay(title)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85" aria-label={t("play")}><Play className="h-4 w-4 fill-black" /></button>
              <button onClick={handleAdd} disabled={!effectiveImdbId} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition", inList ? "border-white/60 text-white" : "border-white/40 text-white hover:border-white")} aria-label={inList ? "Remove" : "Add"}>{inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white" aria-label="Like"><ThumbsUp className="h-4 w-4" /></button>
              <button onClick={() => onPlay(title)} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white" aria-label="More info"><ChevronDown className="h-4 w-4" /></button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
              {mp && <span className="font-semibold text-green-400">{mp}% Match</span>}
              {roundedRating && <span className="inline-flex items-center gap-1 font-semibold text-white"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{roundedRating}</span>}
              <span>{title.year}</span>
              <span className="rounded border border-white/30 px-1 text-[9px] uppercase">{title.type === "series" ? t("seriesShort") : t("movieShort")}</span>
            </div>
            <h4 className="mt-1.5 line-clamp-1 text-sm font-semibold text-white">{title.title}</h4>
            {genres.length > 0 && <p className="mt-1 line-clamp-1 text-[11px] text-white/60">{genres.slice(0, 3).join(" • ")}</p>}
          </div>
        </motion.div>,
        document.body
      )}
    </>
  )
}

// 5-second watchdog: if the trailer hasn't reached a playing state, fall back
function TrailerWatchdog({ onTimeout }: { onTimeout: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, 5000)
    return () => clearTimeout(timer)
  }, [onTimeout])
  return null
}
