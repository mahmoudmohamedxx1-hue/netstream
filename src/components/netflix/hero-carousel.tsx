"use client"

// ═══════════════════════════════════════════════════════════════════════════
// HeroCarousel — a reusable premium hero carousel with ALL the same features
// as the home hero:
//   • Spring-based slide variants (scale 0.95↔1.05 depth push)
//   • Ken Burns slow zoom on the active slide (pauses during drag)
//   • Framer Motion drag="x" with elastic boundaries + flick velocity
//   • Two-finger touchpad wheel swipe (gesture lock, one gesture = one title)
//   • Dynamic gradient overlay that intensifies during the transition
//   • Staggered text entrance (Title → Metadata → Overview → Buttons)
//   • Backdrop preloading (no white flash)
//   • Hover-only arrows on desktop; progress-bar dots with autoplay fill
//   • will-change + hardware acceleration for 60fps
//   • Autoplay pauses on touch/drag/hover/hidden tab
//   • Trailer autoplay (YouTube, muted, with mute toggle)
//
// Used by: tmdb-browse-grid.tsx (Movies & Series pages). The home page
// (tmdb-home.tsx) has its own inline implementation; this is the reusable
// version for browse pages.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence, type PanInfo, useMotionValue, useTransform, useSpring } from "framer-motion"
import { Play, Info, Star, Film, Tv, Loader2, Volume2, VolumeX } from "lucide-react"
import { Poster } from "./poster"
import { TrailerIframe } from "./trailer-iframe"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

export type HeroTitle = {
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

type HeroPreview = {
  imdbId: string | null
  trailerKey: string | null
  trailerSite: string | null
  logo: string | null
  maturityRating: string | null
}

// Module-level cache for trailer/logo/maturity fetches (shared across all
// HeroCarousel instances so navigating between Movies and Series pages
// reuses cached data).
const previewCache = new Map<number, HeroPreview | null>()
const inflight = new Map<number, Promise<HeroPreview | null>>()

function fetchHeroPreview(title: HeroTitle, lang: "en" | "ar"): Promise<HeroPreview | null> {
  if (previewCache.has(title.tmdbId)) {
    return Promise.resolve(previewCache.get(title.tmdbId) ?? null)
  }
  const existing = inflight.get(title.tmdbId)
  if (existing) return existing
  const p = (async (): Promise<HeroPreview | null> => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      let imdbId = title.imdbId
      if (!imdbId) {
        const tmdbType = title.type === "series" ? "tv" : "movie"
        const r1 = await fetch(`/api/tmdb/lookup?tmdbId=${title.tmdbId}&type=${tmdbType}`, { cache: "no-store", signal: controller.signal })
        imdbId = (await r1.json().catch(() => ({}))).imdbId ?? null
      }
      if (!imdbId) { clearTimeout(timeout); return null }
      const langParam = lang === "ar" ? "?lang=ar" : ""
      const r2 = await fetch(`/api/tmdb/${encodeURIComponent(imdbId)}${langParam}`, { cache: "no-store", signal: controller.signal })
      clearTimeout(timeout)
      const detail = (await r2.json().catch(() => ({}))).title
      if (!detail) return null
      const data: HeroPreview = {
        imdbId,
        trailerKey: detail.trailerKey ?? null,
        trailerSite: detail.trailerSite ?? null,
        logo: detail.logo ?? null,
        maturityRating: detail.maturityRating ?? null,
      }
      previewCache.set(title.tmdbId, data)
      return data
    } catch { return null }
    finally { inflight.delete(title.tmdbId) }
  })()
  inflight.set(title.tmdbId, p)
  return p
}

function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  return isNaN(n) ? null : n.toFixed(1)
}

type Props = {
  titles: HeroTitle[]
  onPlay: (t: HeroTitle) => void
}

export function HeroCarousel({ titles, onPlay }: Props) {
  const { t, isArabic } = useLang()
  const heroTitles = titles.slice(0, 5)
  const [heroIdx, setHeroIdx] = useState(0)
  const current = heroTitles[heroIdx]

  // Trailer / logo / maturity state
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [trailerSite, setTrailerSite] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)
  const [heroLogo, setHeroLogo] = useState<string | null>(null)
  const [heroMaturity, setHeroMaturity] = useState<string | null>(null)

  // Pause / drag / autoplay state
  const [heroPaused, setHeroPaused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [autoplayProgress, setAutoplayProgress] = useState(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoplayStartRef = useRef(0)

  // Drag motion values for dynamic gradient
  const dragX = useMotionValue(0)
  const dragXSpring = useSpring(dragX, { stiffness: 400, damping: 40, mass: 0.6 })
  const gradientBoost = useTransform(dragXSpring, (x) => {
    const intensity = Math.min(Math.abs(x) / 200, 1)
    return 0.25 + intensity * 0.35
  })

  // Fetch trailer/logo/maturity when the hero title changes
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
    return () => { cancelled = true }
  }, [current, isArabic])

  // Navigation helpers
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

  // Autoplay + progress
  useEffect(() => {
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    if (heroTitles.length <= 1 || heroPaused || isDragging || !tabVisible) {
      Promise.resolve().then(() => setAutoplayProgress(0))
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

  // Tab visibility
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  // Two-finger touchpad wheel swipe
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const wheelAccumRef = useRef(0)
  const wheelLockedRef = useRef(0)
  useEffect(() => {
    if (heroTitles.length <= 1) return
    const el = heroSectionRef.current
    if (!el) return
    const THRESHOLD = 40
    const COOLDOWN = 400
    const handler = (e: WheelEvent) => {
      const ax = Math.abs(e.deltaX)
      const ay = Math.abs(e.deltaY)
      const isHorizontal = ax >= 8 && ax >= ay
      if (!isHorizontal) {
        wheelAccumRef.current *= 0.5
        return
      }
      e.preventDefault()
      const now = Date.now()
      if (now - wheelLockedRef.current < COOLDOWN) return
      wheelAccumRef.current += e.deltaX
      const acc = wheelAccumRef.current
      if (Math.abs(acc) < THRESHOLD) return
      wheelLockedRef.current = now
      wheelAccumRef.current = 0
      if (acc > 0) goToPrevious()
      else goToNext()
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [heroTitles.length, goToNext, goToPrevious])

  // Drag handlers
  const handleDragStart = useCallback(() => { setIsDragging(true) }, [])
  const handleDrag = useCallback((_e: any, info: PanInfo) => { dragX.set(info.offset.x) }, [dragX])
  const handleDragEnd = useCallback((_e: any, info: PanInfo) => {
    setIsDragging(false)
    dragX.set(0)
    const SWIPE_DISTANCE = 80
    const SWIPE_VELOCITY = 500
    const offset = info.offset.x
    const velocity = info.velocity.x
    const shouldCommit = Math.abs(offset) >= SWIPE_DISTANCE || Math.abs(velocity) >= SWIPE_VELOCITY
    if (!shouldCommit) return
    const dir = offset !== 0 ? offset : velocity
    if (dir < 0) goToNext()
    else goToPrevious()
  }, [goToNext, goToPrevious, dragX])

  // Premium slide variants
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

  // Staggered text entrance
  const contentVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.25 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  }
  const contentChildVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28, mass: 0.8 } },
  }

  if (!current) return null

  return (
    <>
      {/* Preload ALL hero backdrops */}
      {heroTitles.map((tt) =>
        tt?.backdrop ? <link key={tt.tmdbId} rel="preload" as="image" href={tt.backdrop} /> : null
      )}

      <section
        ref={heroSectionRef}
        className="group/hero relative h-[78vh] min-h-[520px] w-full select-none overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
      >
        {/* Slide layer — backdrop + Ken Burns + trailer */}
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
            <TrailerIframe
              trailerKey={trailerSite === "YouTube" ? trailerKey : null}
              title={current.title}
              delay={1500}
              muted={muted}
              background
            />
          </motion.div>
        </AnimatePresence>

        {/* Separate drag layer — never unmounts so drag state survives transitions */}
        {heroTitles.length > 1 && (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            style={{ touchAction: "pan-y", willChange: "transform", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
            className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing"
          />
        )}

        {/* Dynamic gradient overlays */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 35%, transparent 75%)", opacity: gradientBoost }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 0%, transparent 45%, rgba(10,10,10,0.7) 80%, #0a0a0a 100%)", opacity: gradientBoost }}
        />

        {/* Staggered content overlay */}
        <div className="pointer-events-none relative z-10 flex h-full max-w-xl flex-col justify-end px-4 pb-20 sm:px-8 sm:pb-24 md:max-w-2xl">
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
                <span className="mb-3 inline-block rounded bg-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  {current.type === "series" ? <Tv className="mr-1 inline h-3 w-3" /> : <Film className="mr-1 inline h-3 w-3" />}
                  {current.type === "series" ? t("seriesShort") : t("movieShort")}
                </span>
              </motion.div>
              <motion.div variants={contentChildVariants}>
                {heroLogo ? (
                  <img src={heroLogo} alt={current.title} className="mb-3 max-h-[120px] max-w-[80%] object-contain object-left drop-shadow-2xl sm:max-h-[160px] md:max-w-[60%]" />
                ) : (
                  <h1 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">{current.title}</h1>
                )}
              </motion.div>
              <motion.div variants={contentChildVariants} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
                {current.rating && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {roundRating(current.rating)}
                  </span>
                )}
                {current.year && <span>{current.year}</span>}
                <span className="rounded border border-white/40 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white/90">
                  {heroMaturity ?? "HD"}
                </span>
              </motion.div>
              <motion.p variants={contentChildVariants} className="mt-3 line-clamp-3 max-w-lg text-sm text-white/85 drop-shadow sm:text-base">
                {current.overview}
              </motion.p>
              <motion.div variants={contentChildVariants} className="pointer-events-auto mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onPlay(current)}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-8 py-3 text-sm font-bold text-black transition hover:bg-white/80"
                >
                  <Play className="h-5 w-5 fill-black" />
                  {t("play")}
                </button>
                <button
                  onClick={() => onPlay(current)}
                  className="inline-flex items-center gap-2 rounded-md bg-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/30"
                >
                  <Info className="h-5 w-5" />
                  {t("moreInfo")}
                </button>
                {trailerKey && (
                  <a
                    href={`https://www.youtube.com/watch?v=${trailerKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-black/40 px-4 py-3 text-sm font-bold text-white transition hover:border-white/60 hover:bg-black/60"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {isArabic ? "الإعلان" : "Trailer"}
                  </a>
                )}
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

        {/* Hover-only arrows (desktop) */}
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

        {/* Progress-bar dots */}
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
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
