"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search, Star } from "lucide-react"
import { motion } from "framer-motion"
import { Poster } from "./poster"
import { Input } from "@/components/ui/input"
import type { CardTitle } from "./content-card"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"

type TmdbItem = {
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

type Genre = { id: number; name: string }

type Props = {
  type?: "movie" | "series"
  onPlay: (t: CardTitle) => void
}

// Category labels are translated at render time via t() — keys here map to
// the language dictionary.
const CATEGORIES = [
  { id: "popular", labelKey: "popular" },
  { id: "top_rated", labelKey: "topRated" },
  { id: "trending", labelKey: "trending" },
  { id: "arabic", labelKey: "arabic" },
  { id: "now_playing", labelKey: "nowPlaying" },
  { id: "on_the_air", labelKey: "onTheAir" },
]

// TMDB returns genre names in English. This map translates them to Arabic.
const GENRE_AR: Record<string, string> = {
  "Action": "أكشن",
  "Adventure": "مغامرة",
  "Animation": "رسوم متحركة",
  "Comedy": "كوميديا",
  "Crime": "جريمة",
  "Documentary": "وثائقي",
  "Drama": "دراما",
  "Family": "عائلي",
  "Fantasy": "خيال",
  "History": "تاريخي",
  "Horror": "رعب",
  "Music": "موسيقي",
  "Mystery": "غموض",
  "Romance": "رومانسي",
  "Science Fiction": "خيال علمي",
  "TV Movie": "فيلم تلفزيوني",
  "Thriller": "إثارة",
  "War": "حرب",
  "Western": "غربي",
  "Kids": "أطفال",
  "News": "أخبار",
  "Reality": "واقع",
  "Sci-Fi & Fantasy": "خيال علمي وسحر",
  "Soap": "دراما يومية",
  "Talk": "برامج حوارية",
  "War & Politics": "حرب وسياسة",
  "Action & Adventure": "أكشن ومغامرة",
}

type Props2 = Props & {
  /** When provided, the grid starts on this category instead of "popular". */
  initialCategory?: string
  /** When provided, overrides the header title. */
  headerTitle?: string
  /** When provided, overrides the header subtitle. */
  headerSubtitle?: string
}

export function TmdbBrowseGrid({ type, onPlay, initialCategory, headerTitle, headerSubtitle }: Props2) {
  const { t, isArabic } = useLang()
  const [items, setItems] = useState<TmdbItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [category, setCategory] = useState(initialCategory ?? "popular")
  const [genre, setGenre] = useState<string>("")
  const [genres, setGenres] = useState<Genre[]>([])
  const [lookingUp, setLookingUp] = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Fetch genres (with Arabic translation when Arabic is on)
  useEffect(() => {
    fetch(`/api/tmdb/genres?type=${type ?? "movie"}&lang=${isArabic ? "ar" : "en"}`, { cache: "force-cache" })
      .then((r) => r.json())
      .then((data) => setGenres(data.genres ?? []))
      .catch(() => {})
  }, [type, isArabic])

  // Load page
  const loadPage = useCallback(
    async (pageNum: number, reset = false) => {
      if (reset) { setLoading(true); setPage(1) }
      else setLoadingMore(true)

      try {
        const params = new URLSearchParams({
          type: type ?? "movie",
          category,
          page: String(pageNum),
          lang: isArabic ? "ar" : "en",
        })
        if (genre) params.set("genre", genre)
        const res = await fetch(`/api/tmdb/browse?${params}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        const batch: TmdbItem[] = data.items ?? []
        if (reset) {
          setItems(batch)
          setPage(2)
        } else {
          setItems((prev) => [...prev, ...batch])
          setPage(pageNum + 1)
        }
        setTotalPages(data.totalPages ?? 1)
      } catch {
        if (reset) setItems([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [type, category, genre, isArabic]
  )

  // Reload when category/genre/type changes
  useEffect(() => {
    loadPage(1, true)
  }, [loadPage])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page <= totalPages && !loadingMore && !loading) {
          loadPage(page)
        }
      },
      { rootMargin: "400px" }
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [page, totalPages, loadingMore, loading, loadPage])

  // Lazy lookup: when user clicks a title, fetch its IMDB ID then open detail
  const handleClick = useCallback(
    async (t: TmdbItem) => {
      if (t.imdbId) {
        onPlay({
          imdbId: t.imdbId, title: t.title, type: t.type,
          year: t.year, poster: t.poster, overview: t.overview, rating: t.rating,
        })
        return
      }
      setLookingUp(t.tmdbId)
      try {
        const tmdbType = t.type === "series" ? "tv" : "movie"
        const res = await fetch(`/api/tmdb/lookup?tmdbId=${t.tmdbId}&type=${tmdbType}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (data.imdbId) {
          onPlay({
            imdbId: data.imdbId, title: t.title, type: t.type,
            year: t.year, poster: data.poster ?? t.poster,
            overview: t.overview, rating: t.rating,
          })
        }
      } catch {}
      setLookingUp(null)
    },
    [onPlay]
  )

  const display = items

  return (
    <div className="px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          {headerTitle ?? (type === "movie" ? t("moviesLibrary") : type === "series" ? t("tvSeriesLibrary") : t("browseAll"))}
        </h1>
      </div>

      {/* Category filters — SpecularButton-style chips with sliding pill */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => {
          if (type === "series" && c.id === "now_playing") return false
          if (type === "movie" && c.id === "on_the_air") return false
          return true
        }).map((c) => {
          const isActive = !genre && category === c.id
          const label = (c.id === "arabic" ? "🌍 " : "") + t(c.labelKey)
          return (
            <button
              key={c.id}
              onClick={() => { setCategory(c.id); setGenre("") }}
              className={cn(
                "relative overflow-hidden rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 sm:text-sm",
                isActive
                  ? "text-white"
                  : "text-white/60 hover:text-white/90"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="category-active-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-red-700"
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  style={{
                    boxShadow: "0 0 20px rgba(229,9,20,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                  }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Genre subcategories — same SpecularButton-style chips (wrapping) */}
      {genres.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setGenre("")}
            className={cn(
              "relative overflow-hidden rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-300",
              !genre ? "text-white" : "text-white/60 hover:text-white/90"
            )}
          >
            {!genre && (
              <motion.div
                layoutId="genre-active-pill"
                className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-red-700"
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                style={{
                  boxShadow: "0 0 15px rgba(229,9,20,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                }}
              />
            )}
            <span className="relative z-10">{t("all")}</span>
          </button>
          {genres.map((g) => {
            const shortName = g.name === "Science Fiction" ? "Sci-Fi" : g.name
            const isActive = genre === String(g.id)
            return (
              <button
                key={g.id}
                onClick={() => { setGenre(String(g.id)) }}
                className={cn(
                  "relative overflow-hidden rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-300",
                  isActive ? "text-white" : "text-white/60 hover:text-white/90"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="genre-active-pill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-red-700"
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    style={{
                      boxShadow: "0 0 15px rgba(229,9,20,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  />
                )}
                <span className="relative z-10">{shortName}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-white/5" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-semibold text-white">{t("noTitlesFound")}</p>
          <button
            onClick={() => loadPage(1, true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            {isArabic ? "إعادة المحاولة" : "Retry"}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {display.map((t, i) => (
              <button
                key={`${t.imdbId ?? t.tmdbId}-${i}`}
                onClick={() => handleClick(t)}
                disabled={lookingUp === t.tmdbId}
                className="group/card specular-card-outline relative aspect-[2/3] transition-transform duration-200 hover:scale-105 hover:z-10 disabled:opacity-50"
              >
                <div className="relative h-full overflow-hidden rounded-md bg-neutral-900">
                  <Poster
                    title={t.title}
                    src={t.poster}
                    year={t.year}
                    className="h-full w-full transition duration-300 group-hover/card:opacity-90"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover/card:opacity-100">
                    <p className="line-clamp-2 text-xs font-bold text-white">{t.title}</p>
                    <p className="mt-0.5 text-[10px] text-white/60">
                      {t.year} • {t.type === "series" ? "Series" : "Movie"}
                    </p>
                    {t.rating && (
                      <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-yellow-400">
                        <Star className="h-2.5 w-2.5 fill-yellow-400" /> {t.rating}
                      </p>
                    )}
                  </div>
                  <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-bold uppercase text-white/80 backdrop-blur-sm">
                    {t.type === "series" ? "TV" : "MV"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="flex justify-center py-8">
            {loadingMore ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : page <= totalPages ? (
              <span className="text-xs text-white/30">{t("scrollForMore")}…</span>
            ) : (
              <span className="text-xs text-white/30">{t("reachedEnd")}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
