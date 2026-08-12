"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Play, Info, Star, Film, Tv, Loader2, RotateCw, Volume2, VolumeX } from "lucide-react"
import { Poster } from "./poster"
import SpecularButton from "@/components/specular/SpecularButton"
import type { CardTitle } from "./content-card"
import { HoverPreviewCard } from "./hover-preview-card"
import { useLang } from "@/lib/lang-context"

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
      let imdbId = title.imdbId
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
        heroPreviewCache.set(title.tmdbId, null)
        return null
      }
      const langParam = lang === "ar" ? "?lang=ar" : ""
      const r2 = await fetch(`/api/tmdb/${encodeURIComponent(imdbId)}${langParam}`, {
        cache: "no-store",
      })
      const d2 = await r2.json().catch(() => ({}))
      const detail = d2.title
      if (!detail) {
        heroPreviewCache.set(title.tmdbId, null)
        return null
      }
      const data: HeroPreview = {
        imdbId,
        trailerKey: detail.trailerKey ?? null,
        logo: detail.logo ?? null,
        maturityRating: detail.maturityRating ?? null,
      }
      heroPreviewCache.set(title.tmdbId, data)
      return data
    } catch {
      heroPreviewCache.set(title.tmdbId, null)
      return null
    } finally {
      heroInflight.delete(title.tmdbId)
    }
  })()
  heroInflight.set(title.tmdbId, p)
  return p
}

// Build the YouTube embed URL for the hero trailer. Mute is toggled via the
// `muted` flag — when unmuted, the `mute=1` query param is removed so YouTube
// loads the player with audio enabled (changing the src reloads the iframe).
function buildTrailerSrc(key: string, muted: boolean): string {
  const muteParam = muted ? "mute=1&" : ""
  return (
    `https://www.youtube-nocookie.com/embed/${key}` +
    `?autoplay=1&${muteParam}controls=0&loop=1&playlist=${key}` +
    `&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`
  )
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
}

export function TmdbHome({ onPlay, continueWatching, myList, onPlayHistory }: Props) {
  const { t, isArabic } = useLang()
  const [rows, setRows] = useState<TmdbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [heroIdx, setHeroIdx] = useState(0)
  const [lookingUp, setLookingUp] = useState<number | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // --- Hero trailer state ---
  // `trailerKey` is the YouTube video id (or null while loading / unavailable).
  // `showTrailer` flips to true 3s after `current` settles, fading the
  // backdrop image out and the YouTube iframe in.
  // `muted` tracks the user's mute preference and persists across hero cycles.
  // `heroLogo` / `heroMaturity` come from the same TMDB detail fetch.
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [showTrailer, setShowTrailer] = useState(false)
  const [muted, setMuted] = useState(true)
  const [heroLogo, setHeroLogo] = useState<string | null>(null)
  const [heroMaturity, setHeroMaturity] = useState<string | null>(null)
  const trailerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
          // Empty response — retry if we haven't hit the limit
          if (retryCount < 3) {
            setTimeout(() => setRetryCount((c) => c + 1), 1000)
          } else {
            setLoading(false)
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        // Network error — retry if we haven't hit the limit
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
  // 1. Reset trailer state — backdrop image is shown again.
  // 2. Lazy-fetch the trailer key + logo + maturity rating for the new title.
  // 3. If a trailer exists, start a 3-second timer to swap in the YouTube
  //    iframe. The cleanup fn cancels the in-flight fetch + clears the timer
  //    if `current` changes again before the timer fires.
  //
  // The synchronous resets are deferred via `Promise.resolve().then()` to
  // satisfy the `react-hooks/set-state-in-effect` lint rule (same pattern as
  // the home content fetch above). They still run before the next paint.
  useEffect(() => {
    if (!current) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setShowTrailer(false)
      setTrailerKey(null)
      setHeroLogo(null)
      setHeroMaturity(null)
    })
    if (trailerTimer.current) {
      clearTimeout(trailerTimer.current)
      trailerTimer.current = null
    }
    fetchHeroPreview(current, isArabic ? "ar" : "en").then((data) => {
      if (cancelled || !data) return
      setTrailerKey(data.trailerKey)
      setHeroLogo(data.logo)
      setHeroMaturity(data.maturityRating)
      if (data.trailerKey) {
        trailerTimer.current = setTimeout(() => {
          if (!cancelled) setShowTrailer(true)
        }, 3000)
      }
    })
    return () => {
      cancelled = true
      if (trailerTimer.current) {
        clearTimeout(trailerTimer.current)
        trailerTimer.current = null
      }
    }
  }, [current, isArabic])

  // YouTube embed URL — toggles `mute=1` based on the `muted` state.
  const trailerSrc = trailerKey ? buildTrailerSrc(trailerKey, muted) : null

  useEffect(() => {
    if (heroTitles.length <= 1) return
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % heroTitles.length), 8000)
    return () => clearInterval(id)
  }, [heroTitles.length])

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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
      {/* Hero banner */}
      {current && (
        <section className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
          <motion.div
            key={current.tmdbId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0"
          >
            {current.backdrop ? (
              <img src={current.backdrop} alt={current.title} className="h-full w-full object-cover object-top" />
            ) : (
              <Poster title={current.title} src={current.poster} className="h-full w-full" />
            )}
          </motion.div>

          {/* YouTube trailer — fades in 3s after a new title appears.
              z-0 (below the gradient overlays + text content). The iframe is
              sized to always cover the hero at 16:9 — on wide heroes the
              video is cropped top/bottom; on tall/narrow heroes it is cropped
              left/right. `pointer-events-none` so clicks pass through to the
              Play/More-info buttons. */}
          {showTrailer && trailerSrc && (
            <motion.div
              key={`${current.tmdbId}-trailer-${muted ? "muted" : "sound"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 z-0 overflow-hidden bg-black"
            >
              <iframe
                src={trailerSrc}
                title={`${current.title} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: "max(100vw, calc(78vh * 16 / 9))",
                  height: "max(78vh, calc(100vw * 9 / 16))",
                }}
                frameBorder={0}
                scrolling="no"
              />
            </motion.div>
          )}

          <div className="absolute inset-0 hero-fade-left" />
          <div className="absolute inset-0 hero-fade-bottom" />

          <div className="relative z-10 flex h-full max-w-xl flex-col justify-end px-4 pb-20 sm:px-8 sm:pb-24 md:max-w-2xl">
            <motion.div
              key={current.tmdbId + "-info"}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <span className="mb-3 inline-block rounded bg-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                {current.type === "series" ? <Tv className="mr-1 inline h-3 w-3" /> : <Film className="mr-1 inline h-3 w-3" />}
                {current.type === "series" ? t("seriesShort") : t("movieShort")}
              </span>
              {/* Prefer the TMDB logo art when available (Netflix-style brand
                  logo); fall back to a text <h1> for titles with no logo. */}
              {heroLogo ? (
                <img
                  src={heroLogo}
                  alt={current.title}
                  className="mb-3 max-h-[120px] max-w-[80%] object-contain object-left drop-shadow-2xl sm:max-h-[160px] md:max-w-[60%]"
                />
              ) : (
                <h1 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">{current.title}</h1>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
                {current.rating && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {roundRating(current.rating)}
                  </span>
                )}
                {current.year && <span>{current.year}</span>}
                {/* Maturity rating badge (PG-13 / TV-MA / …). Fallback to
                    "HD" when TMDB has no US certification for this title. */}
                <span className="rounded border border-white/40 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur-sm">
                  {heroMaturity ?? "HD"}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 max-w-lg text-sm text-white/85 drop-shadow sm:text-base">{current.overview}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
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
                  {lookingUp === current.tmdbId ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
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
                  <Info className="h-5 w-5" />
                  {t("moreInfo")}
                </SpecularButton>
              </div>
            </motion.div>
          </div>

          {heroTitles.length > 1 && (
            <>
              {/* Prev/Next arrows */}
              <button
                onClick={() => setHeroIdx((i) => (i - 1 + heroTitles.length) % heroTitles.length)}
                className="absolute left-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/80"
                aria-label="Previous"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={() => setHeroIdx((i) => (i + 1) % heroTitles.length)}
                className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/80"
                aria-label="Next"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              {/* Dots + mute toggle (bottom-right). Mute only appears once
                  the trailer is actually playing — before that, only the
                  hero rotation dots are shown. */}
              <div className="absolute bottom-8 right-4 z-10 flex items-center gap-3 sm:right-8">
                {showTrailer && trailerKey && (
                  <button
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? "Unmute trailer" : "Mute trailer"}
                    title={muted ? "Unmute trailer" : "Mute trailer"}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-black/50 text-white backdrop-blur-sm transition hover:border-white/80 hover:bg-black/70"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                )}
                <div className="flex gap-2">
                  {heroTitles.map((t, i) => (
                    <button
                      key={t.tmdbId}
                      onClick={() => setHeroIdx(i)}
                      className={i === heroIdx ? "h-1.5 w-7 rounded-full bg-primary transition-all" : "h-1.5 w-3 rounded-full bg-white/40 transition-all hover:bg-white/70"}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {/* When there is only one hero title, still show the mute button if
              the trailer is playing (no dots to anchor it to). */}
          {heroTitles.length <= 1 && showTrailer && trailerKey && (
            <div className="absolute bottom-8 right-4 z-10 flex items-center gap-3 sm:right-8">
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute trailer" : "Mute trailer"}
                title={muted ? "Unmute trailer" : "Mute trailer"}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-black/50 text-white backdrop-blur-sm transition hover:border-white/80 hover:bg-black/70"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Content rows — Continue Watching and My List appear first, right below hero */}
      <div className="relative z-20 -mt-16 sm:-mt-24">
        {continueWatching && continueWatching.length > 0 && onPlayHistory && (
          <LocalRow title="Continue Watching" titles={continueWatching} onPlay={onPlayHistory} showProgress />
        )}
        {myList && myList.length > 0 && (
          <LocalRow title="My List" titles={myList} onPlay={onPlay} />
        )}
        {rows.map((row, ri) => (
          <TmdbRow
            key={row.title}
            row={row}
            onPlay={handleClick}
            numbered={row.title.toLowerCase().includes("top rated")}
          />
        ))}
      </div>
    </div>
  )
}

function TmdbRow({ row, onPlay, numbered }: {
  row: TmdbRow
  onPlay: (t: TmdbTitle) => void
  numbered?: boolean
}) {
  const { t } = useLang()
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
      <div className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 pb-6 pt-1 sm:gap-3 sm:px-8">
        {row.titles.map((tt, i) => (
          <HoverPreviewCard
            key={`${tt.tmdbId}-${i}`}
            title={tt}
            onPlay={onPlay}
            rank={numbered ? i + 1 : undefined}
          />
        ))}
      </div>
    </section>
  )
}

// Row for local data (Continue Watching, My List) — uses CardTitle with IMDB IDs
function LocalRow({ title, titles, onPlay, showProgress }: {
  title: string
  titles: CardTitle[]
  onPlay: (t: CardTitle) => void
  showProgress?: boolean
}) {
  const { t } = useLang()
  if (titles.length === 0) return null
  // Translate the row title via the mapping (Continue Watching / My List)
  const rowTitle = ROW_TITLE_MAP[title] ? t(ROW_TITLE_MAP[title]) : title
  return (
    <section className="group/row relative py-3">
      <h3 className="mb-2 px-4 text-base font-semibold text-white/90 sm:px-8 md:text-lg">{rowTitle}</h3>
      <div className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 pb-6 pt-1 sm:gap-3 sm:px-8">
        {titles.map((tt, i) => {
          const rating = roundRating(tt.rating)
          return (
            <button
              key={tt.imdbId + i}
              onClick={() => onPlay(tt)}
              className="group/card relative aspect-[2/3] w-[40vw] shrink-0 sm:w-[180px] md:w-[200px]"
            >
              <div className="relative h-full overflow-hidden rounded-md bg-neutral-900">
                <Poster title={tt.title} src={tt.poster} year={tt.year} alt={tt.title} className="h-full w-full transition duration-300 group-hover/card:opacity-90" />
                {rating && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />{rating}
                  </span>
                )}
                {/* Progress bar */}
                {showProgress && tt.progress != null && tt.progress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 z-10">
                    <div className="h-1 w-full bg-black/60">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(tt.progress, 100)}%` }} />
                    </div>
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover/card:opacity-100">
                  <p className="line-clamp-2 text-xs font-bold text-white">{tt.title}</p>
                  <p className="text-[10px] text-white/60">{tt.year}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <Play className="h-3 w-3 fill-current" /> {showProgress ? t("resume") : t("play")}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
