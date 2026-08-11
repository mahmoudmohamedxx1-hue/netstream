"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Play, Info, Star, Film, Tv, Loader2, RotateCw } from "lucide-react"
import { Poster } from "./poster"
import SpecularButton from "@/components/specular/SpecularButton"
import type { CardTitle } from "./content-card"
import { useLang } from "@/lib/lang-context"

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
              <h1 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">{current.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
                {current.rating && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {current.rating}
                  </span>
                )}
                {current.year && <span>{current.year}</span>}
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
              {/* Dots */}
              <div className="absolute bottom-8 right-4 z-10 flex gap-2 sm:right-8">
                {heroTitles.map((t, i) => (
                  <button
                    key={t.tmdbId}
                    onClick={() => setHeroIdx(i)}
                    className={i === heroIdx ? "h-1.5 w-7 rounded-full bg-primary transition-all" : "h-1.5 w-3 rounded-full bg-white/40 transition-all hover:bg-white/70"}
                  />
                ))}
              </div>
            </>
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
            lookingUp={lookingUp}
            numbered={row.title.toLowerCase().includes("top rated")}
          />
        ))}
      </div>
    </div>
  )
}

function TmdbRow({ row, onPlay, lookingUp, numbered }: {
  row: TmdbRow
  onPlay: (t: TmdbTitle) => void
  lookingUp: number | null
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
            <button
              key={`${tt.tmdbId}-${i}`}
              onClick={() => onPlay(tt)}
              disabled={lookingUp === tt.tmdbId}
              className="group/card specular-card-outline relative aspect-[2/3] w-[40vw] shrink-0 transition-transform duration-200 hover:scale-105 hover:z-10 sm:w-[180px] md:w-[200px] disabled:opacity-50"
            >
            <div className="relative h-full overflow-hidden rounded-md bg-neutral-900">
              <Poster title={tt.title} src={tt.poster} year={tt.year} alt={tt.title} className="h-full w-full transition duration-300 group-hover/card:opacity-90" />
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {tt.type === "series" ? t("seriesShort") : t("movieShort")}
              </span>
              {tt.rating && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-yellow-400" />{tt.rating}
                </span>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover/card:opacity-100">
                <p className="line-clamp-2 text-xs font-bold text-white">{tt.title}</p>
                <p className="text-[10px] text-white/60">{tt.year} • {tt.type === "series" ? t("seriesShort") : t("movieShort")}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Play className="h-3 w-3 fill-current" /> {t("play")}
                </span>
              </div>
            </div>
            {numbered && (
              <span className="pointer-events-none absolute -left-3 top-0 z-0 font-black leading-none text-transparent" style={{ fontSize: "clamp(72px, 12vw, 120px)", WebkitTextStroke: "3px rgba(255,255,255,0.35)" }}>
                {i + 1}
              </span>
            )}
            </button>
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
        {titles.map((tt, i) => (
          <button
            key={tt.imdbId + i}
            onClick={() => onPlay(tt)}
            className="group/card relative aspect-[2/3] w-[40vw] shrink-0 sm:w-[180px] md:w-[200px]"
          >
            <div className="relative h-full overflow-hidden rounded-md bg-neutral-900">
              <Poster title={tt.title} src={tt.poster} year={tt.year} alt={tt.title} className="h-full w-full transition duration-300 group-hover/card:opacity-90" />
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {tt.type === "series" ? t("seriesShort") : t("movieShort")}
              </span>
              {tt.rating && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-yellow-400" />{tt.rating}
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
                <p className="text-[10px] text-white/60">{tt.year} • {tt.type === "series" ? t("seriesShort") : t("movieShort")}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Play className="h-3 w-3 fill-current" /> {showProgress ? t("resume") : t("play")}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
