"use client"

// Netflix-style hover preview card with React Portal.
//
// FIX 1: The expanded popup is rendered via createPortal to document.body
// with position:fixed, computed from the card's getBoundingClientRect().
// This avoids the CSS spec issue where overflow-x:auto forces overflow-y:auto,
// which clips the popup and forces the user to scroll.
//
// FIX 2: The popup autoplays an UNMUTED YouTube trailer by default (with an
//         automatic muted fallback when the browser blocks unmuted autoplay)
// after ~800ms, cross-fading from the backdrop image. If the trailer errors
// or doesn't exist, the backdrop image stays — never a black box.
//
// FIX 3 (mobile): On touch devices the popup opens via a 500ms long-press
// (instantly — no extra hover delay) and behaves like a proper mobile
// popover: a dim scrim behind it, an X button, 44px touch targets — and it
// dismisses on ANY scroll or finger movement, or by tapping the scrim.
// Synthetic mouse events from taps (iOS sticky hover) are ignored so a
// plain tap never opens the preview, and the click that follows a
// long-press is suppressed so lifting the finger doesn't also start
// playback.
//
// FIX 4 (hybrid devices): A touch-screen laptop or ≥lg tablet with a mouse
// attached reports (hover: none)/(pointer: coarse) even though a real mouse
// exists — which used to disable hover previews entirely on those machines
// ("posters don't play on the browser edition"). A real mouse is now
// detected from its mousemove stream (3 distinct cursor positions) and
// earns normal hover behavior; touch-opened popovers keep the mobile
// affordances (scrim/X/scroll-dismiss) and mouse-opened ones keep the
// desktop idiom (close on leave, reposition on scroll).

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Play, Plus, Check, Star, ThumbsUp, ChevronDown, Film, Tv, Loader2, Volume2, VolumeX, Download, X } from "lucide-react"
import { Poster } from "./poster"
import { TrailerIframe } from "./trailer-iframe"
import { DownloadHelper } from "./download-helper"
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
  /** When true, card fills its grid cell (w-full, no shrink-0). When false (default), card has fixed width for horizontal scroll rows. */
  inGrid?: boolean
  /** Hover delay in ms before the preview popup opens. Default: 1000 (1s).
   *  Top IMDB rows use 3000 (3s) so users can read the rank numerals. */
  hoverDelay?: number
}

type PreviewData = {
  imdbId: string | null
  trailerKey: string | null
  trailerSite: string | null
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
        trailerSite: t.trailerSite ?? null,
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

export function HoverPreviewCard({ title, onPlay, onAddToList, rank, landscape, focused, cardRef, inGrid, hoverDelay = 1000 }: Props) {
  const { t, isArabic } = useLang()
  const { toggleWatchlist, isInWatchlist } = useLibrary()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)
  const [trailerFailed, setTrailerFailed] = useState(false)
  const [muted, setMuted] = useState(false)
  const [resolvedImdbId, setResolvedImdbId] = useState<string | null>(title.imdbId)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [popupPos, setPopupPos] = useState<{ left: number; top: number; width: number } | null>(null)
  // Touch device? (no hover / coarse pointer). Computed once — drives the
  // mobile popover behavior (long-press open, scrim, dismiss-on-scroll).
  const [coarsePointer] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none), (pointer: coarse)").matches
      : false
  )

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trailerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)
  const cardRefInternal = useRef<HTMLButtonElement | null>(null)
  const isHovering = useRef(false) // shared hover state for card + popup
  const expandedRef = useRef(false)    // mirrors `expanded` for touch handlers
  const longPressFired = useRef(false) // long-press opened the preview?
  const touchActiveRef = useRef(false) // a touch session is in progress
  const touchOpenedRef = useRef(false) // preview opened from touch (hybrid devices)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  // ── Hybrid-device support (touch-screen laptop / tablet + mouse) ──────────
  // `coarsePointer` is BLUNT: a touch-screen laptop or a ≥lg tablet with a
  // mouse attached still reports (hover: none)/(pointer: coarse) for its
  // PRIMARY pointer, which used to kill ALL hover previews on those machines
  // — the desktop-layout user hovers with the trackpad/mouse and nothing
  // plays ("the posters don't play"). A REAL mouse produces a continuous
  // mousemove stream with changing coordinates; a tap synthesizes at most
  // one or two moves at the tap point. Require 3 distinct cursor positions
  // (>2px apart) before trusting hover events on a coarse-pointer device.
  const mousePresentRef = useRef(false)
  // Reactive mirror of touchOpenedRef — drives the scrim/X affordances
  // (touch-opened popovers get them; mouse-opened popovers don't, even on
  // hybrid devices running the desktop layout).
  const [touchOpenedUi, setTouchOpenedUi] = useState(false)

  useEffect(() => {
    if (!coarsePointer) return // fine-pointer devices always get hover
    let lastX: number | null = null
    let lastY: number | null = null
    let distinct = 0
    const onMove = (e: MouseEvent) => {
      if (lastX === null || Math.hypot(e.clientX - lastX, e.clientY - (lastY ?? e.clientY)) > 2) {
        distinct++
        lastX = e.clientX
        lastY = e.clientY
        if (distinct >= 3) {
          mousePresentRef.current = true
          window.removeEventListener("mousemove", onMove)
        }
      }
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [coarsePointer])

  const effectiveImdbId = resolvedImdbId ?? title.imdbId
  const inList = effectiveImdbId ? isInWatchlist(effectiveImdbId) : false
  const roundedRating = roundRating(title.rating)
  const mp = matchPct(title.rating)
  const genres = preview?.genres ?? []
  const backdropSrc = preview?.backdrop ?? title.backdrop
  const trailerKey = preview?.trailerSite === "YouTube" ? preview.trailerKey : null

  // Compute popup position from card's bounding rect, clamped to viewport.
  // Width is responsive (never wider than viewport − gutters) and the whole
  // popup is kept inside the viewport vertically (video + action row).
  const computePosition = useCallback(() => {
    const el = cardRefInternal.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // 320px fixed overflows small phones (320px iPhone SE) — cap to viewport
    const width = Math.min(POPUP_WIDTH, window.innerWidth - 2 * POPUP_GAP)
    let left = rect.left + rect.width / 2 - width / 2
    let top = rect.top
    // Clamp horizontally
    left = Math.max(POPUP_GAP, Math.min(left, window.innerWidth - width - POPUP_GAP))
    // If the popup would run past the bottom of the viewport, slide it up so
    // the whole card (16:9 video + ~150px metadata) stays visible.
    const estHeight = (width * 9) / 16 + 150
    top = top + estHeight > window.innerHeight - POPUP_GAP
      ? Math.max(POPUP_GAP, window.innerHeight - estHeight - POPUP_GAP)
      : Math.max(POPUP_GAP, top)
    setPopupPos({ left, top, width })
  }, [])

  const clearAllTimers = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (trailerTimer.current) { clearTimeout(trailerTimer.current); trailerTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (touchTimer.current) { clearTimeout(touchTimer.current); touchTimer.current = null }
  }

  const handleClose = () => {
    clearAllTimers()
    setExpanded(false)
    expandedRef.current = false
    setShowTrailer(false)
    setTrailerFailed(false)
    setPreview(null)
    setPreviewLoading(false)
    setPopupPos(null)
    setResolvedImdbId(title.imdbId)
    touchOpenedRef.current = false
    setTouchOpenedUi(false)
  }

  // Reposition on scroll — use a ref to avoid accessing handleClose before declaration
  const handleCloseRef = useRef<() => void>(() => {})
  useEffect(() => { handleCloseRef.current = handleClose })

  useEffect(() => {
    if (!expanded) return
    computePosition()
    const onScroll = () => {
      // A touch-opened preview (long-press) must dismiss on ANY scroll — it
      // must never follow the page or linger while scrolling (the
      // user-reported mobile bug). A mouse-opened preview — including a real
      // mouse on a hybrid touch-screen laptop — repositions while hovered and
      // closes once the pointer has left the card/popup.
      if (touchOpenedRef.current) { handleCloseRef.current(); return }
      computePosition()
      if (!isHovering.current) handleCloseRef.current()
    }
    window.addEventListener("scroll", onScroll, true)
    return () => window.removeEventListener("scroll", onScroll, true)
  }, [expanded, computePosition])

  const startTrailerTimer = (key: string | null | undefined) => {
    if (!key) return
    if (trailerTimer.current) clearTimeout(trailerTimer.current)
    trailerTimer.current = setTimeout(() => setShowTrailer(true), 800)
  }

  // Open the preview NOW (state + position + preview/trailer fetch kick-off).
  const expandNow = () => {
    setExpanded(true)
    expandedRef.current = true
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
  }

  // Open the preview. Desktop hover waits `hoverDelay` (intent); touch
  // long-press opens immediately.
  const openPreview = (fromTouch = false) => {
    isHovering.current = true
    touchOpenedRef.current = fromTouch
    setTouchOpenedUi(fromTouch)
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (fromTouch) { expandNow(); return }
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(expandNow, hoverDelay)
  }

  const handleEnter = () => {
    // Pure touch devices: taps emit synthetic mouseenter (iOS sticky hover) —
    // ignore them; the preview opens ONLY via the 500ms long-press. Hybrid
    // devices (touch screen + real mouse, detected above): a verified real
    // mouse earns normal hover behavior even though matchMedia says coarse.
    if (coarsePointer && !mousePresentRef.current) return
    openPreview()
  }

  const handleLeave = () => {
    // Pure touch: synthetic mouseleave (e.g. sticky-hover release) must not
    // close a preview the user just long-pressed open — touch dismissal is
    // handled by scroll / finger movement / the scrim only. (Hybrid devices
    // with a verified real mouse get normal mouse-leave behavior.)
    if (coarsePointer && !mousePresentRef.current) return
    isHovering.current = false
    // Small delay so moving from card to popup doesn't close it
    closeTimer.current = setTimeout(() => handleClose(), 200)
  }

  // ── Touch handlers for mobile long-press ──────────────────────────────────
  // On touch devices there is no hover: a 500ms long-press opens the preview
  // instantly (no extra hover delay). The preview then behaves like a mobile
  // popover: it closes on any scroll or finger movement, and taps on the scrim
  // dismiss it. The synthetic click after a long-press is suppressed so
  // releasing the finger doesn't ALSO start playback.
  const TOUCH_SLOP = 10 // px of finger jitter tolerated during a long-press

  const handleTouchStart = (e: React.TouchEvent) => {
    touchActiveRef.current = true
    touchMoved.current = false
    longPressFired.current = false
    const t = e.touches[0]
    touchStartPos.current = t ? { x: t.clientX, y: t.clientY } : null
    if (touchTimer.current) clearTimeout(touchTimer.current)
    touchTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        longPressFired.current = true
        openPreview(true) // from touch → open immediately
      }
    }, 500)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // 10px slop: long-press jitter doesn't count as a scroll gesture
    if (!touchMoved.current) {
      const t = e.touches[0]
      if (!touchStartPos.current || !t) {
        touchMoved.current = true
      } else {
        const dx = t.clientX - touchStartPos.current.x
        const dy = t.clientY - touchStartPos.current.y
        if (Math.hypot(dx, dy) > TOUCH_SLOP) touchMoved.current = true
      }
    }
    if (!touchMoved.current) return
    // Finger moved → this is a scroll gesture. Cancel any pending open…
    if (touchTimer.current) { clearTimeout(touchTimer.current); touchTimer.current = null }
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    // …and if the preview already opened, close it — it must never linger
    // while the page scrolls underneath (user-reported mobile bug).
    if (expandedRef.current) handleClose()
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchActiveRef.current = false
    if (touchTimer.current) { clearTimeout(touchTimer.current); touchTimer.current = null }
    if (longPressFired.current) {
      // The preview opened from this long-press — suppress the synthetic
      // click so lifting the finger doesn't ALSO start playback.
      e.preventDefault()
    } else if (hoverTimer.current) {
      // Quick tap: cancel any pending open (synthetic mouseenter path on
      // devices where matchMedia failed to detect the touch screen).
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  const handleTouchCancel = () => {
    touchActiveRef.current = false
    touchMoved.current = true // treat as a gesture → cancel everything
    if (touchTimer.current) { clearTimeout(touchTimer.current); touchTimer.current = null }
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
  }

  const handlePopupEnter = () => {
    if (coarsePointer && !mousePresentRef.current) return
    isHovering.current = true
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const handlePopupLeave = () => {
    if (coarsePointer && !mousePresentRef.current) return
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

  // The reusable <TrailerIframe> handles the embed URL, delay, mute, and
  // mount/unmount. We render it on top of the backdrop image (which stays
  // visible underneath). `showTrailer` gates whether we pass the key to the
  // component — when false we pass null and it renders nothing (just the
  // backdrop shows). When true (after the hover delay), it passes the key and
  // the component mounts the iframe after its own short internal delay.

  return (
    <div
      className={cn(
        "group/card relative select-none",
        rank
          ? "w-[100vw] shrink-0 sm:w-[400px] md:w-[500px]"
          : (inGrid ? "w-full aspect-video" : "w-[68vw] shrink-0 aspect-video sm:w-[280px] md:w-[320px]")
      )}
      style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onContextMenu={(e) => { if (touchActiveRef.current) e.preventDefault() }}
    >
        {rank && (
          /* Large outlined number BEHIND the poster (Netflix style).
             The number is absolute-positioned to the left, and the poster
             overlaps it from the right. z-0 = behind, z-10 = poster on top. */
          <div className="pointer-events-none absolute bottom-0 left-0 z-0 flex items-end" style={{ height: "100%" }}>
            <span
              // Netflix-authentic Top-10 numeral: solid near-black fill with a
              // thick white outline (the real top-10 treatment — the old ghost
              // outline at 25% opacity read as a rendering glitch). A soft
              // drop shadow lifts the numeral off the poster behind it.
              className="select-none font-black"
              style={{
                fontSize: rank >= 10
                  ? "clamp(50px, 7vw, 100px)"
                  : "clamp(80px, 12vw, 160px)",
                color: "#0a0a0a",
                WebkitTextStroke: "3px rgba(255,255,255,0.85)",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
                fontFamily: "Arial Black, sans-serif",
                display: "block",
                lineHeight: "0.8",
                marginLeft: "-8px",
              }}
            >
              {rank}
            </span>
          </div>
        )}
        <div className={cn("relative h-full", rank ? "aspect-video z-10 ml-auto w-[85%]" : "h-full")}>
          <button
            ref={(el) => { cardRefInternal.current = el; cardRef?.(el) }}
            onClick={() => { handleClose(); onPlay(title) }}
            className={cn("specular-card-outline block h-full w-full overflow-hidden rounded-md bg-neutral-900 text-left transition-transform duration-200 active:scale-[0.97]", focused ? "z-20 scale-105 ring-2 ring-white ring-offset-2 ring-offset-black focus:outline-none" : "focus:outline-none")}
          >
            <div className="relative h-full bg-neutral-900">
              {true ? (
                <>
                  <Poster title={title.title} src={title.backdrop ?? title.poster} year={title.year} alt={title.title} className="h-full w-full" />
                  {roundedRating && <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm"><Star className="h-2.5 w-2.5 fill-yellow-400" />{roundedRating}</span>}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-8">
                    <p className="line-clamp-1 text-xs font-bold text-white drop-shadow">{title.title}</p>
                    {title.year && <p className="text-[10px] text-white/60">{title.year}</p>}
                  </div>
                </>
              ) : (
                <>
                  <Poster title={title.title} src={title.poster} year={title.year} alt={title.title} className="h-full w-full" />
                  {roundedRating && <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm"><Star className="h-2.5 w-2.5 fill-yellow-400" />{roundedRating}</span>}
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

      {/* Portal popup — rendered to document.body with position:fixed */}
      {expanded && popupPos && typeof document !== "undefined" && createPortal(
        <>
        {/* Touch-opened popover: dim scrim behind the popup — tap to dismiss.
            (Mouse-opened previews — desktop AND hybrid — skip it.) */}
        {touchOpenedUi && (
          <div
            className="fixed inset-0 z-[199] bg-black/50"
            onClick={() => handleClose()}
            aria-hidden
          />
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed z-[200] overflow-hidden rounded-lg bg-[#181818] shadow-2xl ring-1 ring-white/10"
          style={{ left: popupPos.left, top: popupPos.top, width: popupPos.width, transformOrigin: "center top" }}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
        >
          {/* 16:9 video area — backdrop image underneath, trailer iframe on top */}
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {/* Backdrop image — always underneath so there's never a black flash */}
            {backdropSrc ? (
              <img src={backdropSrc} alt={title.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Poster title={title.title} src={title.poster} className="absolute inset-0 h-full w-full" />
            )}
            {/* YouTube trailer — one reusable <TrailerIframe> on top of the
                backdrop. The backdrop stays visible underneath so there's
                never a black flash. Pass null when not ready so the component
                renders nothing and the backdrop shows alone. The hover timer
                (500ms) + trailer timer (800ms) already provide the delay, so
                the component's own delay is set to 0. */}
            <TrailerIframe
              trailerKey={showTrailer ? trailerKey : null}
              title={title.title}
              delay={0}
              muted={muted}
              onAutoMuted={() => setMuted(true)}
              background
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {title.type === "series" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
              {title.type === "series" ? t("seriesShort") : t("movieShort")}
            </span>
            {/* Touch-opened popover: explicit close button (44px) — discoverable
                dismissal. (Mouse-opened previews close on mouse-leave instead.) */}
            {touchOpenedUi && (
              <button
                onClick={handleClose}
                className="absolute left-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white transition active:scale-90"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            )}
            {/* Mute toggle — 44px on touch, 36px on desktop */}
            {showTrailer && !trailerFailed && (
              <button
                onClick={() => setMuted(m => !m)}
                className="absolute bottom-2 right-2 grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-black/60 text-white transition hover:bg-black/80 active:scale-90 sm:h-9 sm:w-9 sm:active:scale-95"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <Volume2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
              </button>
            )}
            {previewLoading && (
              <div className="absolute bottom-2 left-2 text-white/70"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
            )}
          </div>

          {/* Action buttons + metadata — all in the same card, no scrolling needed.
              44px targets on touch (HIG), 40px circles with press feedback on
              desktop — comfortable, mobile-edition-sized controls everywhere. */}
          <div className="p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { handleClose(); onPlay(title) }} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85 active:scale-90 sm:h-10 sm:w-10 sm:active:scale-95" aria-label={t("play")}><Play className="h-4 w-4 fill-black" /></button>
              <button onClick={handleAdd} disabled={!effectiveImdbId} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-full border-2 transition active:scale-90 sm:h-10 sm:w-10 sm:active:scale-95", inList ? "border-white/60 text-white" : "border-white/40 text-white hover:border-white")} aria-label={inList ? "Remove" : "Add"}>{inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
              <button
                onClick={() => setDownloadOpen(true)}
                disabled={!effectiveImdbId}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white disabled:opacity-40 active:scale-90 sm:h-10 sm:w-10 sm:active:scale-95"
                aria-label={t("downloadVideo")}
                title={t("downloadVideo")}
              ><Download className="h-4 w-4" /></button>
              <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white active:scale-90 sm:h-10 sm:w-10 sm:active:scale-95" aria-label="Like"><ThumbsUp className="h-4 w-4" /></button>
              <button onClick={() => { handleClose(); onPlay(title) }} className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white active:scale-90 sm:h-10 sm:w-10 sm:active:scale-95" aria-label="More info"><ChevronDown className="h-4 w-4" /></button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
              {mp && <span className="font-semibold text-green-400">{mp}% Match</span>}
              {roundedRating && <span className="inline-flex items-center gap-1 font-semibold text-white"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{roundedRating}</span>}
              <span>{title.year}</span>
              <span className="rounded border border-white/30 px-1 text-[9px] uppercase">{title.type === "series" ? t("seriesShort") : t("movieShort")}</span>
            </div>
            <h4 className="mt-1.5 line-clamp-1 text-sm font-semibold text-white">{title.title}</h4>
            {genres.length > 0 && <p className="mt-1 line-clamp-1 text-[11px] text-white/60">{genres.slice(0, 3).join(" • ")}</p>}
            {title.overview && <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/50">{title.overview}</p>}
          </div>

          {/* Download manager — nested fixed overlay (z-200) works inside the portal */}
          <DownloadHelper
            open={downloadOpen}
            onClose={() => setDownloadOpen(false)}
            imdbId={effectiveImdbId || `tmdb-${title.tmdbId}`}
            type={title.type}
            title={title.title}
            poster={title.poster}
          />
        </motion.div>
        </>
        ,
        document.body
      )}
    </div>
  )
}

// 5-second watchdog

// 5-second watchdog: if the trailer hasn't reached a playing state, fall back
function TrailerWatchdog({ onTimeout }: { onTimeout: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, 30000)
    return () => clearTimeout(timer)
  }, [onTimeout])
  return null
}
