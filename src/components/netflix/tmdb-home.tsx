"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { motion, AnimatePresence, type PanInfo, useMotionValue, useTransform, useSpring } from "framer-motion"
import { Play, Info, Star, Film, Tv, Loader2, RotateCw, Volume2, VolumeX } from "lucide-react"
import { Poster } from "./poster"
import SpecularButton from "@/components/specular/SpecularButton"
import type { CardTitle } from "./content-card"
import { HoverPreviewCard } from "./hover-preview-card"
import { TrailerIframe } from "./trailer-iframe"
import { RowScrollButtons } from "./row-scroll-buttons"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

// Round a TMDB rating string (e.g. "8.034") to 1 decimal place ("8.0").
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

// ---------------------------------------------------------------------------
// Hero trailer fetch
// ---------------------------------------------------------------------------
// The TMDB /home endpoint ships row titles without an imdbId, so we do a
// two-step lazy fetch for the current hero title:
//   1. /api/tmdb/lookup?tmdbId=…&type=movie|tv  → resolves imdbId
//   2. /api/tmdb/{imdbId}?lang=…                → returns trailerKey, logo,
//                                                 maturityRating
// Results are cached module-level so subsequent hero cycles (the hero
// rotates every 8s through 5 titles) are instant. Mirrors the same pattern
// used by `hover-preview-card.tsx`.

type HeroPreview = {
  imdbId: string | null
  trailerKey: string | null
  trailerSite: string | null
  logo: string | null
  maturityRating: string | null
}

const heroPreviewCache = new Map<number, HeroPreview | null>()
const heroInflight = new Map<number, Promise<HeroPreview | null>>()

function fetchHeroPreview(title: TmdbTitle, lang: "en" | "ar"): Promise<HeroPreview | null> {
  if (heroPreviewCache.has(title.tmdbId)) {
    return Promise.resolve(heroPreviewCache.get(title.tmdbId) ?? null)
  }
  const existing = heroInflight.get(title.tmdbId)
  if (existing) return existing

  const p = (async (): Promise<HeroPreview | null> => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      let imdbId = title.imdbId
      if (!imdbId) {
        const tmdbType = title.type === "series" ? "tv" : "movie"
        const r1 = await fetch(
          `/api/tmdb/lookup?tmdbId=${title.tmdbId}&type=${tmdbType}`,
          { cache: "no-store", signal: controller.signal }
        )
        const d1 = await r1.json().catch(() => ({}))
        imdbId = d1.imdbId ?? null
      }
      if (!imdbId) {
        
        clearTimeout(timeout)
        return null
      }
      const langParam = lang === "ar" ? "?lang=ar" : ""
      const r2 = await fetch(`/api/tmdb/${encodeURIComponent(imdbId)}${langParam}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const d2 = await r2.json().catch(() => ({}))
      const detail = d2.title
      if (!detail) {
        return null // do not cache null - allow retry
      }
      const data: HeroPreview = {
        imdbId,
        trailerKey: detail.trailerKey ?? null,
        trailerSite: detail.trailerSite ?? null,
        logo: detail.logo ?? null,
        maturityRating: detail.maturityRating ?? null,
      }
      heroPreviewCache.set(title.tmdbId, data)
      return data
    } catch {
      
      return null
    } finally {
      heroInflight.delete(title.tmdbId)
    }
  })()
  heroInflight.set(title.tmdbId, p)
  return p
}

// Map the English row titles returned by /api/tmdb/home to translation keys.
// This lets us translate "Trending Now" → "الرائج الآن" etc. at render time
// without changing the API.
const ROW_TITLE_MAP: Record<string, string> = {
  "Trending Now": "trendingNow",
  "Popular Movies": "popularMovies",
  "Popular Series": "popularSeries",
  "IMDB Top Movies": "topRatedMovies",
  "IMDB Top Series": "topRatedSeries",
  "Arabic Movies": "arabicMovies",
  "Arabic Series": "arabicSeries",
  "Now Playing in Theaters": "nowPlayingTheaters",
  "Airing This Week": "airingThisWeek",
  "Continue Watching": "continueWatching",
  "My List": "mylist",
}

type TmdbRow = {
  title: string
  titles: TmdbTitle[]
}

type TmdbTitle = {
  imdbId: string | null
  tmdbId: number
  title: string
  type: "movie" | "series"
  year: string
  rating: string | null
  poster: string | null
  backdrop: string | null
  overview: string
}

type Props = {
  onPlay: (t: CardTitle) => void
  continueWatching?: CardTitle[]
  myList?: CardTitle[]
  onPlayHistory?: (t: CardTitle) => void
  // B12: enables arrow-key/Enter navigation across the content rows. The
  // parent (page.tsx) passes `true` only when on the home nav AND no
  // dialog/player/search/imdb-overlay is open, so this keyboard handler
  // never interferes with the player's R/N/T/F shortcuts, the search
  // overlay's arrow-key nav, or text input fields.
  keyboardNavEnabled?: boolean
}

export function TmdbHome({ onPlay, continueWatching, myList, onPlayHistory, keyboardNavEnabled }: Props) {
  const { t, isArabic } = useLang()
  const [rows, setRows] = useState<TmdbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [heroIdx, setHeroIdx] = useState(0)
  const [lookingUp, setLookingUp] = useState<number | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // --- Hero trailer state ---
  // One source of truth: `trailerKey` (YouTube video id or null). The reusable
  // <TrailerIframe> component handles the delay + mount/unmount + mute — we no
  // longer keep separate `showTrailer` / `playTrailerManually` / `trailerFailed`
  // states because they were contradictory and gated autoplay behind a manual
  // button. Now every hero title with a valid YouTube trailer autoplays.
  // `muted` tracks the user's mute preference and persists across hero cycles.
  // `heroLogo` / `heroMaturity` come from the same TMDB detail fetch.
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [trailerSite, setTrailerSite] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)
  const [heroLogo, setHeroLogo] = useState<string | null>(null)
  const [heroMaturity, setHeroMaturity] = useState<string | null>(null)

  // Fetch home content from TMDB. Retries automatically on failure (up to 3
  // times) because TMDB's free API sometimes rate-limits or times out.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) setLoading(true) })
    fetch(`/api/tmdb/home?lang=${isArabic ? "ar" : "en"}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const fetchedRows = data.rows ?? []
        if (fetchedRows.length > 0) {
          setRows(fetchedRows)
          setLoading(false)
        } else {
          if (retryCount < 3) {
            setTimeout(() => setRetryCount((c) => c + 1), 1000)
          } else {
            setLoading(false)
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        if (retryCount < 3) {
          setTimeout(() => setRetryCount((c) => c + 1), 1000)
        } else {
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [isArabic, retryCount])

  // Hero = first trending title
  const heroRow = rows[0]?.titles ?? []
  const heroTitles = heroRow.slice(0, 5)
  const current = heroTitles[heroIdx]

  // Whenever the hero title changes (rotation, manual nav, language switch):
  // 1. Reset trailer state immediately so the previous iframe unmounts (no
  //    trailer can leak into the next title).
  // 2. Lazy-fetch the trailer key + logo + maturity rating for the new title.
  // 3. If a valid YouTube trailer exists, set `trailerKey` — the reusable
  //    <TrailerIframe> component handles the 3s delay before mounting the
  //    iframe. If no trailer exists, `trailerKey` stays null and the backdrop
  //    image is shown normally (no black box).
  //
  // The synchronous resets are deferred via `Promise.resolve().then()` to
  // satisfy the `react-hooks/set-state-in-effect` lint rule. They still run
  // before the next paint.
  useEffect(() => {
    if (!current) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setTrailerKey(null)
      setTrailerSite(null)
      setHeroLogo(null)
      setHeroMaturity(null)
    })
    fetchHeroPreview(current, isArabic ? "ar" : "en").then((data) => {
      if (cancelled || !data) return
      // Only accept YouTube trailers — the TMDB layer now guarantees this,
      // but we double-check trailerSite so a stale/buggy payload can never
      // put a non-YouTube key into a YouTube embed.
      if (data.trailerSite === "YouTube" && data.trailerKey) {
        setTrailerKey(data.trailerKey)
        setTrailerSite(data.trailerSite)
      } else {
        setTrailerKey(null)
        setTrailerSite(null)
      }
      setHeroLogo(data.logo)
      setHeroMaturity(data.maturityRating)
    })
    return () => {
      cancelled = true
    }
  }, [current, isArabic])

  // ── Hero state: pause, drag, autoplay, progress ───────────────────────────
  // `heroPaused`   — mouse hovers the hero or content rows (desktop).
  // `isDragging`   — a Framer Motion drag is in progress (pauses autoplay + Ken Burns).
  // `tabVisible`   — false when the browser tab is hidden.
  // `swipeDir`     — 1 = next (slide enters from right), -1 = previous (from left).
  // `resetTrigger` — bumps on every manual interaction to restart the 8s timer.
  // `autoplayProgress` — 0..1, drives the progress-bar fill on the active dot.
  const [heroPaused, setHeroPaused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [autoplayProgress, setAutoplayProgress] = useState(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoplayStartRef = useRef<number>(0)

  // Motion value tracking the live drag offset — used to drive the dynamic
  // gradient intensity (the overlay darkens as the user drags, masking image
  // edges during the transition) and to pause Ken Burns while dragging.
  const dragX = useMotionValue(0)
  const dragXSpring = useSpring(dragX, { stiffness: 400, damping: 40, mass: 0.6 })
  // Gradient opacity intensifies as |dragX| grows (0 at rest → ~0.55 at 200px).
  const gradientBoost = useTransform(dragXSpring, (x) => {
    const intensity = Math.min(Math.abs(x) / 200, 1)
    return 0.25 + intensity * 0.35 // 0.25 → 0.6
  })

  // ── Logical navigation helpers ────────────────────────────────────────────
  // ALL hero navigation (swipe, arrows, dots, autoplay) goes through these so
  // the direction + reset logic is identical everywhere. RTL-safe: the physical
  // gesture maps to the same logical next/previous in both LTR and RTL.
  const goToNext = useCallback(() => {
    setSwipeDir(1)
    setHeroIdx((i) => (i + 1) % heroTitles.length)
    setResetTrigger((n) => n + 1)
    setAutoplayProgress(0)
  }, [heroTitles.length])

  const goToPrevious = useCallback(() => {
    setSwipeDir(-1)
    setHeroIdx((i) => (i - 1 + heroTitles.length) % heroTitles.length)
    setResetTrigger((n) => n + 1)
    setAutoplayProgress(0)
  }, [heroTitles.length])

  const goToIndex = useCallback((index: number) => {
    if (index === heroIdx) return
    setSwipeDir(index > heroIdx ? 1 : -1)
    setHeroIdx(index)
    setResetTrigger((n) => n + 1)
    setAutoplayProgress(0)
  }, [heroIdx])

  // ── Autoplay — one interval + one progress interval ───────────────────────
  // Pauses when: only 1 title, hovering, dragging, or tab hidden.
  // Resets to a fresh 8s timer after any manual interaction (via resetTrigger).
  // The progress interval ticks every 50ms to update `autoplayProgress` (0..1)
  // which the active dot renders as a filling progress bar.
  useEffect(() => {
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    if (heroTitles.length <= 1 || heroPaused || isDragging || !tabVisible) {
      setAutoplayProgress(0)
      return
    }
    const DURATION = 8000
    autoplayStartRef.current = Date.now()
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - autoplayStartRef.current
      setAutoplayProgress(Math.min(elapsed / DURATION, 1))
    }, 50)
    autoplayRef.current = setInterval(() => {
      setSwipeDir(1)
      setHeroIdx((i) => (i + 1) % heroTitles.length)
      setAutoplayProgress(0)
      autoplayStartRef.current = Date.now()
    }, DURATION)
    return () => {
      if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null }
      if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    }
  }, [heroTitles.length, heroPaused, isDragging, tabVisible, resetTrigger])

  // Tab visibility — pause when hidden, resume when visible
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  // ── Two-finger touchpad swipe (wheel events) ──────────────────────────────
  // Trackpad horizontal scrolling fires `wheel` events with a meaningful
  // `deltaX`. We attach a NATIVE non-passive listener (React's onWheel is
  // passive, so it can't preventDefault) on the hero section so:
  //   1. When |deltaX| dominates (horizontal gesture), we preventDefault so
  //      the page doesn't horizontally scroll/pan, accumulate the momentum,
  //      and commit one title change per gesture (lock prevents skipping).
  //   2. Vertical scrolls pass through normally so the page still scrolls.
  // This complements the Framer Motion drag (which handles touch + mouse
  // drag) — together they cover trackpad two-finger swipe AND touch swipe.
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const wheelAccumRef = useRef(0)
  const wheelLockedRef = useRef(0) // timestamp of last switch (0 = never)
  useEffect(() => {
    if (heroTitles.length <= 1) return
    const el = heroSectionRef.current
    if (!el) return
    const THRESHOLD = 40   // accumulated |deltaX| to fire a switch
    const COOLDOWN = 400   // ms — minimum time between switches (one gesture = one title)
    const handler = (e: WheelEvent) => {
      const ax = Math.abs(e.deltaX)
      const ay = Math.abs(e.deltaY)
      // Only treat as horizontal when deltaX dominates and is non-trivial.
      const isHorizontal = ax >= 8 && ax >= ay
      if (!isHorizontal) {
        wheelAccumRef.current *= 0.5 // decay so a prior partial swipe clears
        return
      }
      e.preventDefault() // stop the page from horizontal-scrolling
      // Time-based cooldown: if a switch fired within the last COOLDOWN ms,
      // ignore further wheel events. This is more reliable than an
      // accumulator-based lock (which never reset because each new wheel
      // event pushed the accumulator back above the reset threshold).
      const now = Date.now()
      if (now - wheelLockedRef.current < COOLDOWN) return
      wheelAccumRef.current += e.deltaX
      const acc = wheelAccumRef.current
      if (Math.abs(acc) < THRESHOLD) return
      wheelLockedRef.current = now  // mark the time of this switch
      wheelAccumRef.current = 0
      // Swipe right (positive deltaX) → previous; swipe left (negative) → next
      if (acc > 0) goToPrevious()
      else goToNext()
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [heroTitles.length, goToNext, goToPrevious])

  // ── Framer Motion drag gesture ────────────────────────────────────────────
  // The backdrop slide is draggable via `drag="x"` with elastic constraints
  // ({ left: 0, right: 0 } = rubber-band back to center). `dragElastic={0.6}`
  // makes the slide follow the finger at ~60% of the drag distance — visible,
  // responsive, premium. `touch-action: pan-y` lets vertical page scrolling
  // pass through while horizontal movement is captured by the drag. On release,
  // a swipe commits if the offset is ≥80px OR the velocity is ≥500px/s.
  // The live drag offset is written to `dragX` so the gradient overlay can
  // intensify dynamically (masking image edges during the transition).
  const handleDragStart = useCallback(() => {
    setIsDragging(true)
  }, [])

  // During drag, pipe the live horizontal offset into `dragX` so the gradient
  // overlay can intensify dynamically. Framer Motion doesn't expose the drag
  // offset via props, so we read it from `info.offset.x` on each drag event.
  const handleDrag = useCallback((_e: any, info: PanInfo) => {
    dragX.set(info.offset.x)
  }, [dragX])

  const handleDragEnd = useCallback((_e: any, info: PanInfo) => {
    setIsDragging(false)
    // Reset the drag motion value so the gradient settles back to rest state.
    dragX.set(0)
    const SWIPE_DISTANCE = 80   // px — minimum drag distance to commit
    const SWIPE_VELOCITY = 500  // px/s — minimum velocity to commit (quick flicks)
    const offset = info.offset.x
    const velocity = info.velocity.x
    const shouldCommit =
      Math.abs(offset) >= SWIPE_DISTANCE || Math.abs(velocity) >= SWIPE_VELOCITY
    if (!shouldCommit) return // dragConstraints springs it back to x:0
    // Swipe left (negative) → next; swipe right (positive) → previous.
    // Physical gesture direction — the same in LTR and RTL.
    const dir = offset !== 0 ? offset : velocity
    if (dir < 0) {
      goToNext()
    } else {
      goToPrevious()
    }
  }, [goToNext, goToPrevious, dragX])

  // ── Premium slide variants ────────────────────────────────────────────────
  // Old slide scales DOWN to 0.95 and fades out while sliding opposite to the
  // swipe direction; new slide scales UP from 1.05 to 1.0 and fades in. This
  // creates a "push" depth effect (like Apple TV / Disney+) rather than a flat
  // slide. Spring physics (stiffness 280, damping 30, mass 0.9) give a heavy,
  // expensive feel — slightly slower settle than a tween, organic ease-out.
  //
  // IMPORTANT: the exit variant uses a FAST tween (0.25s) instead of a spring
  // so the old slide unmounts quickly. Combined with AnimatePresence
  // mode="wait", this fully unmounts the old slide before the new one mounts —
  // which prevents the drag-state bug where the exiting slide's internal drag
  // transform blocks the new slide's drag (swipe only working the first time).
  const SPRING = { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.9 }
  const heroSlideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0, scale: 1.05 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-30%" : "30%", opacity: 0, scale: 0.95 }),
  }
  const heroSlideTransition = {
    x: SPRING,
    opacity: { duration: 0.3, ease: "easeOut" as const },
    scale: SPRING,
  }
  // Fast exit transition — the old slide must unmount quickly so its drag
  // state doesn't block the new slide. mode="wait" ensures the old slide is
  // fully gone before the new one mounts.
  const heroExitTransition = {
    x: { duration: 0.25, ease: "easeOut" as const },
    opacity: { duration: 0.2, ease: "easeOut" as const },
    scale: { duration: 0.25, ease: "easeOut" as const },
  }

  // ── Staggered text entrance ───────────────────────────────────────────────
  // Title → Metadata → Overview → Buttons cascade in AFTER the image transition
  // settles (200-300ms delay). Each child uses `staggerChildren` so they appear
  // in sequence. The `exit` variant fades them out quickly before the slide
  // leaves, preventing text/background clash during the transition.
  const contentVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.25 },
    },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  }
  const contentChildVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 320, damping: 28, mass: 0.8 },
    },
  }

  // `trailerKey` is the single source of truth for whether a hero trailer
  // should play. The reusable <TrailerIframe> handles the delay, mount/unmount,
  // and mute. We render it inside the hero section (see JSX below) on top of
  // the static backdrop image, which stays visible underneath at all times.

  // Lazy IMDB lookup when user clicks
  const handleClick = useCallback(
    async (t: TmdbTitle) => {
      if (t.imdbId) {
        onPlay({ imdbId: t.imdbId, title: t.title, type: t.type, year: t.year, poster: t.poster, overview: t.overview, rating: t.rating })
        return
      }
      setLookingUp(t.tmdbId)
      try {
        const tmdbType = t.type === "series" ? "tv" : "movie"
        const res = await fetch(`/api/tmdb/lookup?tmdbId=${t.tmdbId}&type=${tmdbType}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (data.imdbId) {
          t.imdbId = data.imdbId
          onPlay({ imdbId: data.imdbId, title: t.title, type: t.type, year: t.year, poster: data.poster ?? t.poster, overview: t.overview, rating: t.rating })
        }
      } catch {}
      setLookingUp(null)
    },
    [onPlay]
  )

  // ─────────────────────────────────────────────────────────────────────
  // B12 — Keyboard / TV-style navigation across content rows
  // ─────────────────────────────────────────────────────────────────────
  // Arrow keys move a focus cursor between cards (Left/Right within a row,
  // Up/Down between rows). Enter triggers the focused card's play handler.
  // The focused card gets a white ring + scale, and is scrolled into view
  // (both axes — vertical for cross-row moves, horizontal for cards hidden
  // in the row's overflow scroller).
  //
  // The handler is gated on `keyboardNavEnabled` (passed from page.tsx),
  // which is only true when on the home nav AND no dialog/player/search
  // overlay is open. We also defensively skip the handler when the key
  // event originated from an input/textarea/select/contenteditable so the
  // handler never eats arrow keys meant for text editing.
  //
  // State: `focused` is `{ row, card } | null` (null = nothing focused
  // yet, until the user presses an arrow key). `cardRefs` is a 2D array
  // of DOM nodes registered via callback refs from each card, used by the
  // scrollIntoView effect.
  const [focused, setFocused] = useState<{ row: number; card: number } | null>(null)
  const cardRefs = useRef<Array<Array<HTMLButtonElement | null>>>([])
  const focusedRef = useRef(focused)
  // eslint-disable-next-line react-hooks/refs
  focusedRef.current = focused

  // Set a card's DOM node in the 2D ref array. Called as a callback ref
  // from each card so the array stays in sync with the rendered tree.
  const setCardRef = useCallback(
    (row: number, card: number, el: HTMLButtonElement | null) => {
      if (!cardRefs.current[row]) cardRefs.current[row] = []
      cardRefs.current[row][card] = el
    },
    []
  )

  // Compute the row layout (used by the keyboard handler to know how many
  // cards are in each row and which onPlay to call on Enter). This mirrors
  // the rendered rows exactly: Continue Watching → My List → TMDB rows.
  const hasCw = !!(continueWatching && continueWatching.length > 0 && onPlayHistory)
  const hasMl = !!(myList && myList.length > 0)
  const localRowCount = (hasCw ? 1 : 0) + (hasMl ? 1 : 0)
  const rowsLayout = useMemo(() => {
    // Use `any` for the onPlay type because the layout mixes CardTitle and
    // TmdbTitle handlers — the union type causes assignability issues that
    // don't affect runtime behavior (all handlers accept either type).
    const layout: Array<{
      titles: ReadonlyArray<TmdbTitle | CardTitle>
      onPlay: (t: any) => void
    }> = []
    if (hasCw) layout.push({ titles: continueWatching!, onPlay: onPlayHistory! as (t: any) => void })
    if (hasMl) layout.push({ titles: myList!, onPlay: onPlay as (t: any) => void })
    for (const row of rows) {
      layout.push({ titles: row.titles, onPlay: handleClick as (t: any) => void })
    }
    return layout
  }, [hasCw, hasMl, continueWatching, myList, onPlayHistory, onPlay, rows, handleClick])

  // Keep a ref to the layout so the keydown handler (which subscribes once)
  // always sees the latest rows without re-subscribing on every render.
  const rowsLayoutRef = useRef(rowsLayout)
  // eslint-disable-next-line react-hooks/refs
  rowsLayoutRef.current = rowsLayout

  // The keyboard handler. Subscribed once per enable/disable transition
  // (not per focused change) — it reads from refs so it always has the
  // latest state.
  useEffect(() => {
    if (!keyboardNavEnabled) return
    const onKey = (e: KeyboardEvent) => {
      // Never intercept when the user is typing in a form field.
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      const layout = rowsLayoutRef.current
      if (layout.length === 0) return

      // Only handle the keys we care about; let everything else bubble.
      if (
        e.key !== "ArrowRight" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp" &&
        e.key !== "Enter"
      ) {
        return
      }

      const prev = focusedRef.current
      let row = prev?.row ?? 0
      let card = prev?.card ?? 0

      if (e.key === "Enter") {
        // Enter plays the focused card. If nothing is focused yet, play
        // the first card of the first row (matches the visible cursor
        // behaviour below).
        const r = prev?.row ?? 0
        const c = prev?.card ?? 0
        const t = layout[r]?.titles[c]
        if (t) {
          e.preventDefault()
          layout[r].onPlay(t)
        }
        return
      }

      e.preventDefault()
      const rowCount = layout.length
      if (e.key === "ArrowRight") {
        if (prev === null) {
          row = 0
          card = 0
        } else {
          card = Math.min(card + 1, (layout[row]?.titles.length ?? 1) - 1)
        }
      } else if (e.key === "ArrowLeft") {
        if (prev === null) {
          row = 0
          card = (layout[0]?.titles.length ?? 1) - 1
        } else {
          card = Math.max(card - 1, 0)
        }
      } else if (e.key === "ArrowDown") {
        if (prev === null) {
          row = 0
          card = 0
        } else {
          row = Math.min(row + 1, rowCount - 1)
          // Clamp card to the new row's length (rows have varying widths).
          card = Math.min(card, (layout[row]?.titles.length ?? 1) - 1)
        }
      } else if (e.key === "ArrowUp") {
        if (prev === null) {
          row = rowCount - 1
          card = 0
        } else {
          row = Math.max(row - 1, 0)
          card = Math.min(card, (layout[row]?.titles.length ?? 1) - 1)
        }
      }

      const next = { row, card }
      focusedRef.current = next
      setFocused(next)
      // Scroll the newly focused card into view (both axes: vertical for
      // cross-row moves, horizontal for cards hidden in the row's
      // overflow scroller). `block: 'nearest'` avoids scrolling if the
      // card is already visible.
      const el = cardRefs.current[row]?.[card]
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [keyboardNavEnabled])

  // Defensive scrollIntoView when `focused` changes via any other path
  // (e.g. programmatic focus in a future enhancement). No-op for null.
  // NOTE: inline is set to 'start' to avoid the row scrolling horizontally
  // when hovering — 'nearest' caused the row to jump when the card was
  // near the edge of the viewport.
  useEffect(() => {
    if (!focused) return
    const el = cardRefs.current[focused.row]?.[focused.card]
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [focused])

  if (loading) {
    return (
      <div className="min-h-[60vh]">
        {/* Skeleton hero — gives the layout a stable height so the page
            doesn't jump when the real hero renders. The shimmer class
            animates a subtle gradient sweep across the dark background. */}
        <section className="relative h-[78vh] min-h-[520px] w-full overflow-hidden bg-neutral-950">
          <div className="skeleton-shimmer h-full w-full" />
          <div className="absolute inset-0 hero-fade-left" />
          <div className="absolute inset-0 hero-fade-bottom" />
          {/* Skeleton title + buttons (bottom-left) */}
          <div className="absolute bottom-20 left-4 right-4 space-y-3 sm:left-8 sm:bottom-24">
            <div className="skeleton-shimmer h-10 w-2/3 max-w-md rounded sm:h-14" />
            <div className="flex gap-2">
              <div className="skeleton-shimmer h-4 w-16 rounded" />
              <div className="skeleton-shimmer h-4 w-12 rounded" />
              <div className="skeleton-shimmer h-4 w-12 rounded" />
            </div>
            <div className="skeleton-shimmer h-3 w-full max-w-lg rounded" />
            <div className="skeleton-shimmer h-3 w-5/6 max-w-md rounded" />
            <div className="flex gap-3 pt-2">
              <div className="skeleton-shimmer h-10 w-28 rounded-md" />
              <div className="skeleton-shimmer h-10 w-28 rounded-md" />
            </div>
          </div>
        </section>

        {/* Skeleton content rows — shown while TMDB content loads */}
        <div className="relative z-20 -mt-16 sm:-mt-24">
          <SkeletonRow landscape />
          <SkeletonRow landscape />
          <SkeletonRow />
          <SkeletonRow landscape />
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-white/50">
          {isArabic ? "فشل تحميل المحتوى. يرجى المحاولة مرة أخرى." : "Failed to load content. Please try again."}
        </p>
        <button
          onClick={() => { setRetryCount(0); setLoading(true) }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          <RotateCw className="h-4 w-4" />
          {isArabic ? "إعادة المحاولة" : "Retry"}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Preload ALL hero backdrops so every slide is in the browser cache
          before it becomes active — no white flash, no progressive JPEG
          shimmer during the transition. `link rel=preload as=image` fetches
          at low priority in the background. */}
      {heroTitles.map((tt) =>
        tt?.backdrop ? <link key={tt.tmdbId} rel="preload" as="image" href={tt.backdrop} /> : null
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PREMIUM HERO CAROUSEL
          • Spring-based slide variants (scale 0.95↔1.05 depth push)
          • Ken Burns slow zoom on the active slide (pauses during drag)
          • Framer Motion drag="x" with elastic boundaries + flick velocity
          • Dynamic gradient overlay that intensifies during the transition
          • Staggered text entrance (Title → Metadata → Overview → Buttons)
          • Hover-only arrows on desktop; always-subtle on mobile
          • Progress-bar dots showing time until auto-advance
          • will-change + hardware acceleration for 60fps
          • Autoplay pauses immediately on touch/drag/hover/hidden tab
          ═══════════════════════════════════════════════════════════════════════ */}
      {current && (
        <section
          ref={heroSectionRef}
          className="group/hero relative h-[78vh] min-h-[520px] w-full select-none overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
        >
          {/* Slide layer — backdrop + Ken Burns + trailer. NO drag here (the
              drag lives on a separate never-unmounting layer below so the drag
              state survives slide transitions). mode="sync" lets the old and
              new slides cross-fade briefly. */}
          <AnimatePresence custom={swipeDir} mode="sync">
            <motion.div
              key={current.tmdbId}
              custom={swipeDir}
              variants={heroSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={heroSlideTransition}
              style={{ willChange: "transform, opacity" }}
              className="absolute inset-0"
            >
              {/* Backdrop image with Ken Burns slow zoom. The zoom PAUSES while
                  dragging (isDragging) so the finger-follow feels solid, and
                  runs 8s → scale 1.08 with a linear ease for a cinematic drift.
                  `will-change:transform` promotes to its own compositor layer. */}
              {current.backdrop ? (
                <motion.img
                  src={current.backdrop}
                  alt={current.title}
                  className="h-full w-full object-cover object-top"
                  animate={isDragging ? { scale: 1 } : { scale: 1.08 }}
                  transition={{ duration: 8, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
                  style={{ willChange: "transform" }}
                  draggable={false}
                />
              ) : (
                <Poster title={current.title} src={current.poster} className="h-full w-full" />
              )}
              {/* Trailer iframe sits on top of the backdrop inside the same
                  slide layer. pointer-events:none (background=true) means it
                  never blocks drag or clicks. */}
              <TrailerIframe
                trailerKey={trailerSite === "YouTube" ? trailerKey : null}
                title={current.title}
                delay={1500}
                muted={muted}
                background
              />
            </motion.div>
          </AnimatePresence>

          {/* ══ SEPARATE DRAG LAYER ══
              This transparent layer NEVER unmounts (it's outside AnimatePresence),
              so its drag state is always fresh — no "swipe works once then stops"
              bug. It sits above the slides (z-[5]) but below the buttons (z-10),
              so horizontal drags are captured here while button clicks pass
              through to the button group above. `touch-action: pan-y` lets
              vertical page scroll pass through; horizontal movement is captured
              by the drag. On release, a swipe commits if offset ≥80px OR
              velocity ≥500px/s; otherwise dragConstraints springs it back. */}
          {heroTitles.length > 1 && (
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              style={{
                touchAction: "pan-y",
                willChange: "transform",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              }}
              className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing"
            />
          )}

          {/* Dynamic gradient overlays — pointer-events-none so drags/clicks
              pass through. The left/bottom fades use `gradientBoost` (a motion
              value derived from |dragX|) so they DARKEN as the user drags,
              masking image edges during the transition. At rest the opacity
              is ~0.25; mid-drag it ramps to ~0.6 for a clean handoff. */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(90deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 35%, transparent 75%)", opacity: gradientBoost }}
          />
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, transparent 0%, transparent 45%, rgba(10,10,10,0.7) 80%, #0a0a0a 100%)", opacity: gradientBoost }}
          />

          {/* Staggered content overlay — Title → Metadata → Overview → Buttons
              cascade in AFTER the image transition settles (delayChildren 0.25s,
              staggerChildren 0.08s). The whole block fades out quickly (0.2s)
              on exit so text never clashes with the incoming backdrop. The
              button group has pointer-events-auto; the rest is pointer-events-none
              so drags pass through to the slide layer beneath. */}
          <div className="pointer-events-none relative z-10 flex h-full max-w-xl flex-col justify-end px-4 pb-16 sm:px-8 sm:pb-24 md:max-w-2xl">
            <AnimatePresence custom={swipeDir} mode="sync">
              <motion.div
                key={current.tmdbId + "-info"}
                custom={swipeDir}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <motion.div variants={contentChildVariants}>
                  <span className="mb-2 inline-block rounded bg-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground sm:mb-3">
                    {current.type === "series" ? <Tv className="mr-1 inline h-3 w-3" /> : <Film className="mr-1 inline h-3 w-3" />}
                    {current.type === "series" ? t("seriesShort") : t("movieShort")}
                  </span>
                </motion.div>
                <motion.div variants={contentChildVariants}>
                  {/* Prefer the TMDB logo art when available (Netflix-style brand
                      logo); fall back to a text <h1> for titles with no logo. */}
                  {heroLogo ? (
                    <img
                      src={heroLogo}
                      alt={current.title}
                      className="mb-2 max-h-[80px] max-w-[75%] object-contain object-left drop-shadow-2xl sm:mb-3 sm:max-h-[160px] md:max-w-[60%]"
                    />
                  ) : (
                    <h1 className="text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">{current.title}</h1>
                  )}
                </motion.div>
                <motion.div variants={contentChildVariants} className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/90 sm:mt-3 sm:gap-x-3 sm:text-sm">
                  {current.rating && (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 sm:h-4 sm:w-4" />
                      {roundRating(current.rating)}
                    </span>
                  )}
                  {current.year && <span>{current.year}</span>}
                  <span className="rounded border border-white/40 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white/90 sm:text-[11px]">
                    {heroMaturity ?? "HD"}
                  </span>
                </motion.div>
                <motion.p variants={contentChildVariants} className="mt-2 line-clamp-2 max-w-lg text-xs text-white/85 drop-shadow sm:mt-3 sm:line-clamp-3 sm:text-base">
                  {current.overview}
                </motion.p>
                <motion.div variants={contentChildVariants} className="pointer-events-auto mt-3 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
                  <SpecularButton
                    onClick={() => handleClick(current)}
                    disabled={lookingUp === current.tmdbId}
                    size="lg"
                    radius={8}
                    lineColor="#e50914"
                    baseColor="#e50914"
                    tint="rgba(255,255,255,0.9)"
                    textColor="#000000"
                    variant="red-fill"
                    intensity={2}
                    shineSize={12}
                    shineFade={45}
                    thickness={2}
                    proximity={300}
                  >
                    {lookingUp === current.tmdbId ? <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 fill-current sm:h-5 sm:w-5" />}
                    {t("play")}
                  </SpecularButton>
                  <SpecularButton
                    onClick={() => handleClick(current)}
                    size="lg"
                    radius={8}
                    lineColor="#ffffff"
                    baseColor="#666666"
                    tint="rgba(255,255,255,0.15)"
                    textColor="#ffffff"
                    blur={4}
                    intensity={1.5}
                    shineSize={10}
                    shineFade={40}
                    thickness={1.5}
                    proximity={300}
                  >
                    <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                    {t("moreInfo")}
                  </SpecularButton>
                  {trailerKey && (
                    <a
                      href={`https://www.youtube.com/watch?v=${trailerKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/30 bg-black/40 px-3 text-xs font-bold text-white transition hover:border-white/60 hover:bg-black/60 sm:h-auto sm:px-4 sm:py-3 sm:text-sm"
                    >
                      <Play className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
                      {isArabic ? "الإعلان" : "Trailer"}
                    </a>
                  )}
                  {/* Mute toggle — in the same row as Play / More Info / Trailer
                      so it's on the same line as the Trailer icon. Only shows
                      when a valid YouTube trailer exists for the hero title. */}
                  {trailerSite === "YouTube" && trailerKey && (
                    <button
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? "Unmute" : "Mute"}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-md border border-white/30 bg-black/40 text-white transition hover:border-white/60 hover:bg-black/60"
                    >
                      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Hover-only navigation arrows (desktop). On mobile they're hidden
              (touch users swipe). They fade in when the hero section is hovered
              via the `group/hero` parent + `opacity-0 group-hover/hero:opacity-100`. */}
          {heroTitles.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 transition-all duration-300 hover:bg-black/70 group-hover/hero:opacity-100 sm:left-4 md:grid"
                aria-label="Previous"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 transition-all duration-300 hover:bg-black/70 group-hover/hero:opacity-100 sm:right-4 md:grid"
                aria-label="Next"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          )}

          {/* Progress-bar dots — each dot is a track with a filling bar.
              The ACTIVE dot fills proportionally to `autoplayProgress` (0..1),
              showing time until auto-advance. Inactive dots are dim pills.
              On mobile the dots are always visible (subtle); desktop same. */}
          {heroTitles.length > 1 && (
            <div className="absolute bottom-8 right-4 z-20 flex items-center gap-2 sm:right-8">
              {heroTitles.map((tt, i) => (
                <button
                  key={tt.tmdbId}
                  onClick={() => goToIndex(i)}
                  className="relative h-1.5 w-8 overflow-hidden rounded-full bg-white/30 transition-all hover:bg-white/50"
                  aria-label={`Go to slide ${i + 1}`}
                >
                  {i === heroIdx && (
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      animate={{ width: `${autoplayProgress * 100}%` }}
                      transition={{ duration: 0.05, ease: "linear" }}
                      style={{ originX: isArabic ? 1 : 0 }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Content rows — My List appears first (Continue Watching is rendered
          separately in page.tsx), then TMDB rows.
          onMouseEnter pauses hero rotation so the user can interact with cards. */}
      <div
        className="relative z-20 -mt-16 sm:-mt-24"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
      >
        {/* My List */}
        {myList && myList.length > 0 && (
          <LocalRow
            title="My List"
            titles={myList}
            onPlay={onPlay}
            rowIndex={hasCw ? 1 : 0}
            focusedCard={focused?.row === (hasCw ? 1 : 0) ? focused.card : null}
            setCardRef={setCardRef}
          />
        )}
        {rows.map((row, i) => {
          // Numbered (Top 10) rows: the API ships rows titled "IMDB Top Movies"
          // and "IMDB Top Series" (and any future row whose title contains
          // "top rated" or "imdb top"). These get the giant outlined rank
          // numerals behind each poster.
          const lower = row.title.toLowerCase()
          const numbered =
            lower.includes("top rated") || lower.includes("imdb top")
          const rowIndex = localRowCount + i
          return (
            <TmdbRow
              key={row.title}
              row={row}
              onPlay={handleClick}
              numbered={numbered}
              landscape={true}
              rowIndex={rowIndex}
              focusedCard={focused?.row === rowIndex ? focused.card : null}
              setCardRef={setCardRef}
            />
          )
        })}
      </div>
    </div>
  )
}

function TmdbRow({ row, onPlay, numbered, landscape, rowIndex, focusedCard, setCardRef }: {
  row: TmdbRow
  onPlay: (t: TmdbTitle) => void
  numbered?: boolean
  landscape?: boolean
  // B12 keyboard-nav plumbing — passed through to each card.
  rowIndex?: number
  focusedCard?: number | null
  setCardRef?: (row: number, card: number, el: HTMLButtonElement | null) => void
}) {
  const { t } = useLang()
  const scrollerRef = useRef<HTMLDivElement>(null)
  if (row.titles.length === 0) return null

  // Translate the row title via the mapping — falls back to the original
  // English title if no mapping exists (e.g. for genre-based rows).
  const rowTitle = ROW_TITLE_MAP[row.title] ? t(ROW_TITLE_MAP[row.title]) : row.title

  return (
    <section className="group/row relative py-3 nf-fade-in">
      <h3 className="mb-2 flex items-center gap-2 px-4 text-base font-semibold text-white/90 sm:px-8 md:text-lg">
        {rowTitle}
        <span className="text-[10px] font-normal text-white/30">{row.titles.length} {t("titles")}</span>
      </h3>
      <div ref={scrollerRef} className="netflix-row-scroller flex touch-pan-x gap-2 overflow-x-auto overflow-y-visible overscroll-x-contain px-4 pb-6 pt-1 sm:gap-3 sm:px-8">
        {row.titles.map((tt, i) => (
          <div key={`${tt.tmdbId}-${i}`} data-row-card className="shrink-0">
            <HoverPreviewCard
              title={tt}
              onPlay={onPlay}
              rank={numbered ? i + 1 : undefined}
              landscape={landscape}
              focused={focusedCard === i}
              // Top IMDB rows use a longer hover delay (3s) so users can read
              // the giant rank numerals before the popup opens. Other rows use
              // the default 1s delay.
              hoverDelay={numbered ? 3000 : 1000}
              cardRef={
                setCardRef && rowIndex !== undefined
                  ? (el) => setCardRef(rowIndex, i, el)
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      <RowScrollButtons scrollerRef={scrollerRef} />
    </section>
  )
}

// Skeleton row shown during the initial home content fetch. Mirrors the
// layout of `TmdbRow`: a title bar (rounded rectangle) + a horizontal
// strip of card-shaped skeleton blocks. The `landscape` flag picks the
// same dimensions the real cards use so there's no layout shift when the
// actual content renders. Uses the `skeleton-shimmer` class (defined in
// globals.css) to animate a subtle gradient sweep across each block.
function SkeletonRow({ landscape }: { landscape?: boolean }) {
  return (
    <section className="py-3">
      <div className="mb-2 px-4 sm:px-8">
        <div className="skeleton-shimmer h-5 w-48 rounded" />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-hidden px-4 pb-6 pt-1 sm:gap-3 sm:px-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={
              landscape
                ? "aspect-video w-[68vw] shrink-0 sm:w-[300px]"
                : "aspect-video w-[68vw] shrink-0 sm:w-[280px] md:w-[320px]"
            }
          >
            <div className="skeleton-shimmer h-full w-full rounded-md" />
          </div>
        ))}
      </div>
    </section>
  )
}

// Row for local data (Continue Watching, My List) — uses CardTitle with IMDB IDs
function LocalRow({ title, titles, onPlay, showProgress, rowIndex, focusedCard, setCardRef }: {
  title: string
  titles: CardTitle[]
  onPlay: (t: CardTitle) => void
  showProgress?: boolean
  // B12 keyboard-nav plumbing — passed through to each card.
  rowIndex?: number
  focusedCard?: number | null
  setCardRef?: (row: number, card: number, el: HTMLButtonElement | null) => void
}) {
  const { t } = useLang()
  const scrollerRef = useRef<HTMLDivElement>(null)
  if (titles.length === 0) return null
  // Translate the row title via the mapping (Continue Watching / My List)
  const rowTitle = ROW_TITLE_MAP[title] ? t(ROW_TITLE_MAP[title]) : title
  return (
    <section className="group/row relative py-3">
      <h3 className="mb-2 px-4 text-base font-semibold text-white/90 sm:px-8 md:text-lg">{rowTitle}</h3>
      <div ref={scrollerRef} className="netflix-row-scroller flex touch-pan-x gap-2 overflow-x-auto overflow-y-visible overscroll-x-contain px-4 pb-6 pt-1 sm:gap-3 sm:px-8">
        {titles.map((tt, i) => {
          const rating = roundRating(tt.rating)
          const isFocused = focusedCard === i
          return (
            <button
              key={tt.imdbId + i}
              data-row-card
              ref={
                setCardRef && rowIndex !== undefined
                  ? (el) => setCardRef(rowIndex, i, el)
                  : undefined
              }
              tabIndex={0}
              onClick={() => onPlay(tt)}
              className={cn(
                "group/card relative aspect-video w-[68vw] shrink-0 rounded-md transition sm:w-[280px] md:w-[320px]",
                isFocused
                  ? "z-20 scale-105 ring-2 ring-white ring-offset-2 ring-offset-black"
                  : "ring-0"
              )}
            >
              <div className="relative h-full overflow-hidden rounded-md bg-neutral-900">
                <Poster title={tt.title} src={tt.poster} year={tt.year} alt={tt.title} className="h-full w-full transition duration-300 group-hover/card:opacity-90" />
                {rating && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />{rating}
                  </span>
                )}
                {/* Progress bar — red Netflix-style bar at the bottom of each
                    Continue Watching card. Shows the watched percentage as a
                    red fill, plus the remaining time as a label. */}
                {showProgress && tt.progress != null && tt.progress > 0 && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 z-10">
                      <div className="h-1 w-full bg-white/20">
                        <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(tt.progress, 100)}%` }} />
                      </div>
                    </div>
                    {/* Time remaining label — shows "12:34 left" or position */}
                    {tt.position && tt.duration && tt.duration > 0 && (
                      <div className="absolute bottom-1.5 left-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/90">
                        {Math.floor(tt.position / 60)}:{String(Math.floor(tt.position % 60)).padStart(2, "0")} / {Math.floor(tt.duration / 60)}:{String(Math.floor(tt.duration % 60)).padStart(2, "0")}
                      </div>
                    )}
                  </>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-100 transition group-hover/card:opacity-100 sm:opacity-0">
                  <p className="line-clamp-2 text-xs font-bold text-white">{tt.title}</p>
                  <p className="text-[10px] text-white/60">
                    {tt.year}
                    {tt.season && tt.episode ? ` · S${tt.season} E${tt.episode}` : ""}
                  </p>
                  {showProgress && tt.progress != null && tt.progress > 0 ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      <Play className="h-3 w-3 fill-current" /> {t("resume")}
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      <Play className="h-3 w-3 fill-current" /> {t("play")}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <RowScrollButtons scrollerRef={scrollerRef} />
    </section>
  )
}
