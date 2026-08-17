"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search, Star, ChevronDown, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { HoverPreviewCard } from "./hover-preview-card"
import { Poster } from "./poster"
import { Input } from "@/components/ui/input"
import { HeroCarousel, type HeroTitle } from "./hero-carousel"
import { RowScrollButtons } from "./row-scroll-buttons"
import type { CardTitle } from "./content-card"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"

// Round a TMDB rating string (e.g. "8.034") to 1 decimal place ("8.0").
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

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
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false)
  const [lookingUp, setLookingUp] = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // --- B7: Immersion rows ---
  // Trending Now — always visible at the top of the browse page.
  const [trendingRow, setTrendingRow] = useState<TmdbItem[]>([])
  // "Because you watched X" — based on the user's most recently watched title.
  const [recommendedRow, setRecommendedRow] = useState<TmdbItem[]>([])
  const [recommendedSourceTitle, setRecommendedSourceTitle] = useState<string>("")
  // "Top Rated" — highest rated titles of this type
  const [topRatedRow, setTopRatedRow] = useState<TmdbItem[]>([])
  // "Now Playing/Airing" — in theaters (movies) or airing this week (series)
  const [nowPlayingRow, setNowPlayingRow] = useState<TmdbItem[]>([])
  // "Popular" — most popular titles of this type
  const [popularRow, setPopularRow] = useState<TmdbItem[]>([])
  // "Arabic" — Arabic-language titles of this type
  const [arabicRow, setArabicRow] = useState<TmdbItem[]>([])
  // Genre-based rows for a richer browse experience
  const [actionRow, setActionRow] = useState<TmdbItem[]>([])
  const [comedyRow, setComedyRow] = useState<TmdbItem[]>([])
  const [horrorRow, setHorrorRow] = useState<TmdbItem[]>([])
  const [scifiRow, setScifiRow] = useState<TmdbItem[]>([])
  const [animationRow, setAnimationRow] = useState<TmdbItem[]>([])
  const [dramaRow, setDramaRow] = useState<TmdbItem[]>([])
  const [crimeRow, setCrimeRow] = useState<TmdbItem[]>([])
  // "Popular in [Genre]" — shown when a genre chip is selected.
  const [genreRow, setGenreRow] = useState<TmdbItem[]>([])

  // Fetch genres (with Arabic translation when Arabic is on)
  useEffect(() => {
    fetch(`/api/tmdb/genres?type=${type ?? "movie"}&lang=${isArabic ? "ar" : "en"}`, { cache: "force-cache" })
      .then((r) => r.json())
      .then((data) => setGenres(data.genres ?? []))
      .catch(() => {})
  }, [type, isArabic])

  // B7: Always-on Trending Now + Top Rated + Now Playing rows — fetched once
  // when the browse page mounts (or when type/lang changes).
  useEffect(() => {
    let cancelled = false
    const langParam = isArabic ? "ar" : "en"
    const typeParam = type ?? "movie"

    // Fetch Trending, Top Rated, and Now Playing/Airing in parallel
    const fetchRow = async (cat: string) => {
      // Fetch 2 pages (40 titles) for each category.
      const [p1, p2] = await Promise.all([
        fetch(`/api/tmdb/browse?${new URLSearchParams({ type: typeParam, category: cat, page: "1", lang: langParam })}`, { cache: "no-store" }).then(r => r.json().catch(() => ({}))),
        fetch(`/api/tmdb/browse?${new URLSearchParams({ type: typeParam, category: cat, page: "2", lang: langParam })}`, { cache: "no-store" }).then(r => r.json().catch(() => ({}))),
      ])
      const all = [...(p1.items ?? []), ...(p2.items ?? [])]
      // Deduplicate by tmdbId.
      const seen = new Set<number>()
      return all.filter((t: any) => {
        if (seen.has(t.tmdbId)) return false
        seen.add(t.tmdbId)
        return true
      }).slice(0, 40)
    }

    // Fetch 2 pages of titles in a specific genre.
    const fetchRowByGenre = async (genreId: string) => {
      const [p1, p2] = await Promise.all([
        fetch(`/api/tmdb/browse?${new URLSearchParams({ type: typeParam, genre: genreId, page: "1", lang: langParam })}`, { cache: "no-store" }).then(r => r.json().catch(() => ({}))),
        fetch(`/api/tmdb/browse?${new URLSearchParams({ type: typeParam, genre: genreId, page: "2", lang: langParam })}`, { cache: "no-store" }).then(r => r.json().catch(() => ({}))),
      ])
      const all = [...(p1.items ?? []), ...(p2.items ?? [])]
      const seen = new Set<number>()
      return all.filter((t: any) => {
        if (seen.has(t.tmdbId)) return false
        seen.add(t.tmdbId)
        return true
      }).slice(0, 40)
    }

    Promise.all([
      fetchRow("trending"),
      fetchRow("top_rated"),
      fetchRow(typeParam === "movie" ? "now_playing" : "on_the_air"),
      fetchRow("popular"),
      fetchRow("arabic"),
      // Genre-based rows — genre IDs: 28=Action, 35=Comedy, 27=Horror,
      // 878=Sci-Fi, 16=Animation, 18=Drama, 80=Crime
      fetchRowByGenre("28"),
      fetchRowByGenre("35"),
      fetchRowByGenre("27"),
      fetchRowByGenre("878"),
      fetchRowByGenre("16"),
      fetchRowByGenre("18"),
      fetchRowByGenre("80"),
    ]).then(([trending, topRated, nowPlaying, popular, arabic, action, comedy, horror, scifi, animation, drama, crime]) => {
      if (cancelled) return
      setTrendingRow(trending)
      setTopRatedRow(topRated)
      setNowPlayingRow(nowPlaying)
      setPopularRow(popular)
      setArabicRow(arabic)
      setActionRow(action)
      setComedyRow(comedy)
      setHorrorRow(horror)
      setScifiRow(scifi)
      setAnimationRow(animation)
      setDramaRow(drama)
      setCrimeRow(crime)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [type, isArabic])

  // B7: "Because you watched X" — fetch the user's most recent history item
  // of the SAME type as the current page (movie/series), then fetch recommendations.
  // This prevents showing movie recommendations on the series page.
  useEffect(() => {
    let cancelled = false
    fetch("/api/history", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (data) => {
        if (cancelled) return
        const historyItems = (data.items ?? []).filter((h: any) => h.type === (type ?? "movie"))
        if (historyItems.length === 0) {
          setRecommendedRow([])
          setRecommendedSourceTitle("")
          return
        }
        const recent = historyItems[0]
        setRecommendedSourceTitle(recent.title ?? "")
        const params = new URLSearchParams({
          type: recent.type ?? type ?? "movie",
          category: "recommendations",
          imdbId: recent.imdbId,
          page: "1",
          lang: isArabic ? "ar" : "en",
        })
        try {
          const res = await fetch(`/api/tmdb/browse?${params}`, { cache: "no-store" })
          const recData = await res.json().catch(() => ({}))
          if (!cancelled) setRecommendedRow((recData.items ?? []).slice(0, 20))
        } catch {
          if (!cancelled) setRecommendedRow([])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [type, isArabic])

  // B7: "Popular in [Genre]" — when a genre chip is selected, fetch the first
  // page of popular titles in that genre as a horizontal strip. The grid
  // below also shows genre-filtered content (with infinite scroll), so this
  // row is a curated "best of" snapshot.
  useEffect(() => {
    if (!genre) {
      setGenreRow([])
      return
    }
    let cancelled = false
    const params = new URLSearchParams({
      type: type ?? "movie",
      genre,
      page: "1",
      lang: isArabic ? "ar" : "en",
    })
    fetch(`/api/tmdb/browse?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setGenreRow((data.items ?? []).slice(0, 20)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [type, genre, isArabic])

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

  // Resolve the genre name for the "Popular in [Genre]" row header.
  const selectedGenreName = useMemo(() => {
    if (!genre) return ""
    const g = genres.find((gg) => String(gg.id) === genre)
    if (!g) return ""
    return isArabic ? (GENRE_AR[g.name] ?? g.name) : g.name
  }, [genre, genres, isArabic])

  const display = items

  return (
    <div className="pb-16">
      {/* Browse hero — showcases trending titles for the current type
          (movies or series) with ALL the same premium features as the home
          hero: drag swipe, Ken Burns, dynamic gradient, staggered text,
          trailer autoplay, progress dots, wheel swipe. */}
      {trendingRow.length > 0 && (
        <HeroCarousel
          titles={trendingRow as HeroTitle[]}
          onPlay={handleClick}
        />
      )}

      {/* Header */}
      <div className="mb-4 px-4 pt-6 sm:px-8">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          {headerTitle ?? (type === "movie" ? t("moviesLibrary") : type === "series" ? t("tvSeriesLibrary") : t("browseAll"))}
        </h1>
      </div>

      {/* B7: Trending Now — always visible at the top of the browse page. */}
      {trendingRow.length > 0 && (
        <BrowseRow
          title={isArabic ? "الرائج الآن" : "Trending Now"}
          items={trendingRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* B7: "Because you watched X" — recommendations based on the user's
          most recently watched title of the SAME type. */}
      {recommendedSourceTitle && recommendedRow.length > 0 && (
        <BrowseRow
          title={isArabic
            ? `لأنك شاهدت ${recommendedSourceTitle}`
            : `Because you watched ${recommendedSourceTitle}`}
          items={recommendedRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Top Rated — highest rated titles of this type */}
      {topRatedRow.length > 0 && (
        <BrowseRow
          title={isArabic ? "الأعلى تقييماً" : "Top Rated"}
          items={topRatedRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Now Playing (movies) / Airing This Week (series) */}
      {nowPlayingRow.length > 0 && (
        <BrowseRow
          title={type === "series"
            ? (isArabic ? "يبث هذا الأسبوع" : "Airing This Week")
            : (isArabic ? "يُعرض الآن" : "Now Playing")}
          items={nowPlayingRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Popular — most popular titles of this type */}
      {popularRow.length > 0 && (
        <BrowseRow
          title={isArabic ? "الأكثر شعبية" : "Popular"}
          items={popularRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Arabic — Arabic-language titles of this type */}
      {arabicRow.length > 0 && (
        <BrowseRow
          title={isArabic ? "أفلام عربية" : "Arabic Cinema"}
          items={arabicRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Genre-based rows — Action, Comedy, Horror, Sci-Fi, Animation, Drama, Crime */}
      {actionRow.length > 0 && (
        <BrowseRow title={isArabic ? "أكشن" : "Action"} items={actionRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {comedyRow.length > 0 && (
        <BrowseRow title={isArabic ? "كوميديا" : "Comedy"} items={comedyRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {horrorRow.length > 0 && (
        <BrowseRow title={isArabic ? "رعب" : "Horror"} items={horrorRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {scifiRow.length > 0 && (
        <BrowseRow title={isArabic ? "خيال علمي" : "Sci-Fi"} items={scifiRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {animationRow.length > 0 && (
        <BrowseRow title={isArabic ? "رسوم متحركة" : "Animation"} items={animationRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {dramaRow.length > 0 && (
        <BrowseRow title={isArabic ? "دراما" : "Drama"} items={dramaRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}
      {crimeRow.length > 0 && (
        <BrowseRow title={isArabic ? "جريمة" : "Crime"} items={crimeRow} onPlay={handleClick} lookingUp={lookingUp} />
      )}

      {/* Category filters — SpecularButton-style chips with sliding pill */}
      <div className="mb-3 mt-6 flex flex-wrap gap-2">
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

      {/* Genre dropdown — Netflix-style dropdown with 3-column grid layout */}
      {genres.length > 0 && (
        <div className="relative mb-4 inline-block">
          <button
            onClick={() => setGenreDropdownOpen((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition",
              genreDropdownOpen || genre
                ? "border-primary/60 bg-primary/20 text-white"
                : "border-white/20 bg-white/5 text-white/80 hover:border-white/40 hover:text-white"
            )}
          >
            {genre
              ? (genres.find((g) => String(g.id) === genre)?.name ?? "Genre")
              : (isArabic ? "التصنيفات" : "Genres")}
            <ChevronDown className={cn("h-4 w-4 transition-transform", genreDropdownOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {genreDropdownOpen && (
              <>
                {/* Backdrop to close dropdown on outside click */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setGenreDropdownOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full z-40 mt-2 w-[340px] rounded-lg border border-white/15 bg-[#181818] p-4 shadow-2xl sm:w-[440px]"
                >
                  {/* "All" option */}
                  <button
                    onClick={() => { setGenre(""); setGenreDropdownOpen(false) }}
                    className={cn(
                      "mb-3 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition",
                      !genre ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {isArabic ? "الكل" : "All Genres"}
                    {!genre && <Check className="h-4 w-4 text-primary" />}
                  </button>
                  {/* 3-column grid of genres */}
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {genres.map((g) => {
                      const isActive = genre === String(g.id)
                      const shortName = g.name === "Science Fiction" ? "Sci-Fi" : g.name
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setGenre(String(g.id)); setGenreDropdownOpen(false) }}
                          className={cn(
                            "flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition",
                            isActive ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {isArabic ? (GENRE_AR[g.name] ?? shortName) : shortName}
                          {isActive && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* B7: "Popular in [Genre]" — shown above the grid when a genre chip is
          selected. Curated horizontal strip of the most popular titles in the
          selected genre (first page only). The grid below also shows
          genre-filtered content with infinite scroll. */}
      {genre && selectedGenreName && genreRow.length > 0 && (
        <BrowseRow
          title={isArabic
            ? `الأكثر شعبية في ${selectedGenreName}`
            : `Popular in ${selectedGenreName}`}
          items={genreRow}
          onPlay={handleClick}
          lookingUp={lookingUp}
        />
      )}

      {/* Grid section separator */}
      <div className="mb-4 mt-8 border-t border-white/10 pt-4">
        <h2 className="text-lg font-bold text-white">{isArabic ? "تصفح الكل" : "Browse All"}</h2>
        <p className="text-xs text-white/40">{isArabic ? "استكشف المزيد من العناوين" : "Explore more titles"}</p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="aspect-video skeleton-shimmer rounded-lg" />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
            {display.map((t, i) => (
              <HoverPreviewCard
                key={`${t.imdbId ?? t.tmdbId}-${i}`}
                title={t}
                onPlay={handleClick}
                landscape={true}
                inGrid={true}
              />
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

// B7: Horizontal scrolling row of TMDB titles — used for the Trending Now,
// "Because you watched X", and "Popular in [Genre]" immersion rows. Reuses
// the same poster card markup as the main grid (portrait 2:3 cards with a
// hover overlay showing title/year/rating) so the rows blend visually with
// the grid below. Each card is `w-[40vw] sm:w-[160px]` (slightly narrower
// than the grid cards on desktop) so 4-5 cards fit in view at once on a
// typical desktop viewport, matching Netflix's row density.
function BrowseRow({
  title,
  items,
  onPlay,
  lookingUp,
}: {
  title: string
  items: TmdbItem[]
  onPlay: (t: TmdbItem) => void
  lookingUp: number | null
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  if (items.length === 0) return null

  return (
    <section className="group/row relative py-3">
      <h3 className="mb-3 flex items-center gap-2 px-4 text-base font-bold text-white sm:px-6 md:text-lg">
        {title}
        <span className="text-[10px] font-normal text-white/30">{items.length}</span>
      </h3>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="netflix-row-scroller flex touch-pan-x gap-3 overflow-x-auto overscroll-x-contain px-4 pb-6 pt-1 sm:px-6"
        >
          {items.map((t, i) => (
            <div key={`${t.imdbId ?? t.tmdbId}-${i}`} data-row-card className="shrink-0 snap-start">
              <HoverPreviewCard
                title={t}
                onPlay={onPlay}
                landscape={true}
              />
            </div>
          ))}
        </div>
        <RowScrollButtons scrollerRef={scrollerRef} />
      </div>
    </section>
  )
}
