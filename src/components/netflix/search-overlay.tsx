"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, Play, Film, Tv, Link2, Sparkles, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Poster } from "./poster"
import { CATALOG, type Title } from "@/lib/movies-data"
import { normalizeImdbId } from "@/lib/vidsrc"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type ImdbSearchItem = {
  imdbId: string | null
  tmdbId?: number
  title: string
  type: "movie" | "series"
  year: string
  rating: string | null
  poster: string | null
  overview?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onPlay: (t: Title) => void
}

export function SearchOverlay({ open, onClose, onPlay }: Props) {
  const [query, setQuery] = useState("")
  const [imdb, setImdb] = useState("")
  const [type, setType] = useState<"movie" | "series">("movie")
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const { toast } = useToast()

  const close = useCallback(() => {
    setQuery("")
    setImdb("")
    onClose()
  }, [onClose])

  // Esc to close + lock scroll
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return CATALOG.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.imdbId.toLowerCase().includes(q) ||
        t.genre.some((g) => g.toLowerCase().includes(q))
    ).slice(0, 12)
  }, [query])

  // Live search across TMDB (full library, real posters).
  const [imdbResults, setImdbResults] = useState<ImdbSearchItem[]>([])
  const [imdbSearching, setImdbSearching] = useState(false)
  const [imdbConfigured, setImdbConfigured] = useState<boolean | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setImdbResults([])
      setImdbSearching(false)
      return
    }
    setImdbSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        // Search both movies and TV on TMDB in parallel
        const [movieRes, tvRes] = await Promise.all([
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=movie`, { cache: "no-store" }),
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=series`, { cache: "no-store" }),
        ])
        const movieData = await movieRes.json().catch(() => ({}))
        const tvData = await tvRes.json().catch(() => ({}))
        const movieItems = (movieData.items ?? []).map((i: any) => ({ ...i, imdbId: i.imdbId ?? null }))
        const tvItems = (tvData.items ?? []).map((i: any) => ({ ...i, imdbId: i.imdbId ?? null }))
        // Merge and interleave
        const merged = [...movieItems, ...tvItems].slice(0, 24)
        setImdbConfigured(true)
        setImdbResults(merged)
      } catch {
        setImdbResults([])
      } finally {
        setImdbSearching(false)
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const normalizedImdb = normalizeImdbId(imdb)

  const playByImdb = () => {
    if (!normalizedImdb) {
      toast({
        title: "Invalid IMDB ID",
        description: "Enter a valid IMDB id like tt0111161",
      })
      return
    }
    const existing = CATALOG.find((t) => t.imdbId === normalizedImdb)
    const t: Title =
      existing ?? {
        imdbId: normalizedImdb,
        title: `IMDB ${normalizedImdb}`,
        type,
        year: "",
        poster: "",
        overview: `Streaming ${type} with IMDB ID ${normalizedImdb} via vidsrc.`,
        rating: "",
        genre: [],
      }
    if (type === "series") {
      t.overview = `Streaming series ${normalizedImdb} — Season ${season}, Episode ${episode} via vidsrc.`
    }
    close()
    onPlay(t)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] overflow-y-auto bg-black/95 nf-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles, genres, or paste an IMDB id…"
                  className="h-14 rounded-full border-white/15 bg-white/10 pl-12 pr-4 text-base text-white placeholder:text-white/40"
                />
              </div>
              <button
                onClick={close}
                className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
                aria-label="Close search"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* IMDB ID quick-play */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Link2 className="h-4 w-4 text-primary" />
                Play by IMDB ID
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> vidsrc
                </span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-white/60">
                    IMDB ID
                  </label>
                  <Input
                    value={imdb}
                    onChange={(e) => setImdb(e.target.value)}
                    placeholder="tt0111161"
                    className="h-11 border-white/15 bg-white/10 font-mono text-white placeholder:text-white/30"
                  />
                  {imdb && normalizedImdb ? (
                    <p className="mt-1 text-[11px] text-emerald-400">
                      Valid → {normalizedImdb}
                    </p>
                  ) : imdb ? (
                    <p className="mt-1 text-[11px] text-red-400">
                      Use format tt0000000 (or just digits)
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-1 self-end rounded-lg bg-white/10 p-1">
                  <TypeBtn
                    active={type === "movie"}
                    onClick={() => setType("movie")}
                    icon={<Film className="h-3.5 w-3.5" />}
                    label="Movie"
                  />
                  <TypeBtn
                    active={type === "series"}
                    onClick={() => setType("series")}
                    icon={<Tv className="h-3.5 w-3.5" />}
                    label="Series"
                  />
                </div>
              </div>

              {type === "series" ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-xs">
                  <div>
                    <label className="mb-1 block text-xs text-white/60">
                      Season
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={season}
                      onChange={(e) =>
                        setSeason(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="h-11 border-white/15 bg-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/60">
                      Episode
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={episode}
                      onChange={(e) =>
                        setEpisode(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="h-11 border-white/15 bg-white/10 text-white"
                    />
                  </div>
                </div>
              ) : null}

              <button
                onClick={playByImdb}
                disabled={!normalizedImdb}
                className={cn(
                  "mt-4 inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-bold transition",
                  normalizedImdb
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-white/10 text-white/40"
                )}
              >
                <Play className="h-4 w-4 fill-current" />
                Play now
              </button>
            </div>

            {/* Catalog results */}
            <div className="mt-6">
              <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                {query ? `Catalog results (${results.length})` : "Browse popular"}
              </p>
              {results.length === 0 && query ? (
                <p className="py-6 text-center text-sm text-white/40">
                  No catalog matches{imdbConfigured === false ? " — IMDb API not configured" : ""}.
                  Try the IMDB ID box above to stream anything.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(query ? results : CATALOG.slice(0, 9)).map((t) => (
                    <button
                      key={t.imdbId}
                      onClick={() => {
                        close()
                        onPlay(t)
                      }}
                      className="group flex gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-2 text-left transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <Poster
                        title={t.title}
                        src={t.poster}
                        className="h-20 w-14 shrink-0 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-white">
                          {t.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/50">
                          {t.year} • {t.type === "series" ? "Series" : "Movie"}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
                          <Play className="h-3 w-3 fill-current" /> Play
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* TMDB search results (full library, real posters) */}
            {query.trim().length >= 2 && imdbConfigured !== false && (
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                  All titles
                  {imdbSearching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> TMDB
                    </span>
                  )}
                  {!imdbSearching && `(${imdbResults.length})`}
                </p>
                {!imdbSearching && imdbResults.length === 0 ? (
                  <p className="py-4 text-center text-xs text-white/40">
                    No results found.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {imdbResults.map((t, idx) => (
                      <button
                        key={t.tmdbId ?? t.imdbId ?? idx}
                        onClick={async () => {
                          // If no IMDB ID, look it up from TMDB
                          if (!t.imdbId && t.tmdbId) {
                            try {
                              const tmdbType = t.type === "series" ? "tv" : "movie"
                              const res = await fetch(`/api/tmdb/lookup?tmdbId=${t.tmdbId}&type=${tmdbType}`, { cache: "no-store" })
                              const data = await res.json().catch(() => ({}))
                              if (data.imdbId) {
                                t.imdbId = data.imdbId
                              } else {
                                return // can't play without IMDB ID
                              }
                            } catch { return }
                          }
                          if (!t.imdbId) return
                          close()
                          onPlay({
                            imdbId: t.imdbId,
                            title: t.title,
                            type: t.type,
                            year: t.year,
                            poster: t.poster ?? "",
                            overview: t.overview ?? "",
                            rating: t.rating ?? "",
                            genre: [],
                          })
                        }}
                        className="group flex gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-2 text-left transition hover:border-primary/40 hover:bg-primary/[0.08]"
                      >
                        <Poster
                          title={t.title}
                          src={t.poster}
                          className="h-20 w-14 shrink-0 rounded"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold text-white">
                            {t.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-white/50">
                            {t.year || "—"} • {t.type === "series" ? "Series" : "Movie"}
                          </p>
                          {t.rating ? (
                            <p className="mt-0.5 text-[11px] text-yellow-400">
                              ★ {t.rating}
                            </p>
                          ) : null}
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
                            <Play className="h-3 w-3 fill-current" /> Play
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function TypeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition",
        active ? "bg-white text-black" : "text-white/70 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
