"use client"

// Enhanced search overlay (B8):
//   • Instant search-as-you-type (debounced 300ms)
//   • Results in a responsive grid (catalog + TMDB titles)
//   • People search — actors / directors via /api/tmdb/search?type=person,
//     with each person's `known_for` titles shown as clickable posters
//   • "Explore trending titles" suggestions when the search is empty
//     (fetched from /api/tmdb/browse?category=trending)
//   • Backdrop blur for a premium feel
//   • Keyboard navigation: ArrowUp / ArrowDown to move the selection,
//     Enter to open the highlighted result, Escape to close

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, Play, Film, Tv, Link2, Sparkles, Loader2, User } from "lucide-react"
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

// People-search result item. `knownFor` carries up to 5 of the person's most
// popular titles (TMDB returns these inline with the /search/person response,
// so we don't need a separate fetch). Each known_for title is playable via
// the same lazy-IMDB-lookup path as a regular TMDB search result.
type PersonSearchItem = {
  personId: number
  name: string
  profile: string | null
  knownForDepartment: string
  knownFor: Array<{
    tmdbId: number
    title: string
    type: "movie" | "series"
    year: string
    poster: string | null
    backdrop: string | null
    overview: string
  }>
}

type Props = {
  open: boolean
  onClose: () => void
  onPlay: (t: Title) => void
}

// Round a TMDB rating for display (the search API returns vote_average as a
// string like "7.832"; we want "7.8").
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

export function SearchOverlay({ open, onClose, onPlay }: Props) {
  const [query, setQuery] = useState("")
  const [imdb, setImdb] = useState("")
  const [type, setType] = useState<"movie" | "series">("movie")
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const { toast } = useToast()

  // --- Search results state ---
  // `imdbResults` are TMDB title results (movie + TV merged). `peopleResults`
  // are TMDB person results. `trendingResults` is the empty-state suggestion
  // row (fetched once when the overlay opens with no query).
  const [imdbResults, setImdbResults] = useState<ImdbSearchItem[]>([])
  const [peopleResults, setPeopleResults] = useState<PersonSearchItem[]>([])
  const [trendingResults, setTrendingResults] = useState<ImdbSearchItem[]>([])
  const [imdbSearching, setImdbSearching] = useState(false)
  const [peopleSearching, setPeopleSearching] = useState(false)
  const [imdbConfigured, setImdbConfigured] = useState<boolean | null>(null)

  // Keyboard navigation: `selectedIdx` is the index into the flat list of
  // playable results (TMDB results first, then catalog matches). -1 means
  // nothing is selected (e.g. empty query or no results).
  const [selectedIdx, setSelectedIdx] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const close = useCallback(() => {
    setQuery("")
    setImdb("")
    setImdbResults([])
    setPeopleResults([])
    setSelectedIdx(-1)
    onClose()
  }, [onClose])

  // Esc to close + lock scroll + ArrowUp/ArrowDown/Enter keyboard navigation.
  // We attach the keydown handler to `window` so it works even when the input
  // isn't focused (e.g. after the user clicks a result card and then presses
  // an arrow key — the input loses focus but the overlay is still open).
  const flatResults = useMemo(() => {
    // Flat list of playable items in display order: TMDB results first, then
    // catalog matches. Each item carries a stable key + the data needed to
    // play it. Used for keyboard navigation (ArrowUp/ArrowDown/Enter).
    type FlatItem =
      | { kind: "tmdb"; item: ImdbSearchItem }
      | { kind: "catalog"; item: Title }
    const flat: FlatItem[] = []
    imdbResults.forEach((item) => flat.push({ kind: "tmdb", item }))
    const catalogMatches = (() => {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return CATALOG.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.imdbId.toLowerCase().includes(q) ||
          t.genre.some((g) => g.toLowerCase().includes(q))
      ).slice(0, 12)
    })()
    catalogMatches.forEach((item) => flat.push({ kind: "catalog", item }))
    return flat
  }, [imdbResults, query])

  // Reset selectedIdx whenever the flat results change (new search → new
  // selection at the top). When there are no results, set to -1.
  useEffect(() => {
    setSelectedIdx(flatResults.length > 0 ? 0 : -1)
  }, [flatResults])

  // Play the item at a given index in the flat results list. Used by both
  // click handlers and the Enter key handler.
  const playAt = useCallback(
    async (idx: number) => {
      const entry = flatResults[idx]
      if (!entry) return
      if (entry.kind === "catalog") {
        close()
        onPlay(entry.item)
        return
      }
      // TMDB result — resolve IMDB ID lazily if needed (same flow as a click).
      const t = entry.item
      if (t.imdbId) {
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
        return
      }
      if (t.tmdbId) {
        try {
          const tmdbType = t.type === "series" ? "tv" : "movie"
          const res = await fetch(`/api/tmdb/lookup?tmdbId=${t.tmdbId}&type=${tmdbType}`, { cache: "no-store" })
          const data = await res.json().catch(() => ({}))
          if (data.imdbId) {
            t.imdbId = data.imdbId
            close()
            onPlay({
              imdbId: data.imdbId,
              title: t.title,
              type: t.type,
              year: t.year,
              poster: t.poster ?? "",
              overview: t.overview ?? "",
              rating: t.rating ?? "",
              genre: [],
            })
          }
        } catch {}
      }
    },
    [flatResults, close, onPlay]
  )

  // Keyboard handler — attached to window so it works regardless of focus.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
        return
      }
      if (flatResults.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx((i) => (i + 1) % flatResults.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx((i) => (i - 1 + flatResults.length) % flatResults.length)
      } else if (e.key === "Enter") {
        // Only intercept Enter when there's a selection AND the user isn't
        // actively editing the IMDB-quick-play fields (where Enter should
        // submit the IMDB form). We check `document.activeElement` to skip
        // when the focus is on a number input (season/episode) or the IMDB
        // text input.
        const ae = document.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null
        const tag = ae?.tagName?.toLowerCase()
        const inputType = (ae as HTMLInputElement | null)?.type
        const isImdbField =
          ae?.id === "imdb-id-input" ||
          ae?.getAttribute?.("aria-label") === "IMDB ID" ||
          inputType === "number"
        if (tag === "input" && !isImdbField && selectedIdx >= 0) {
          e.preventDefault()
          void playAt(selectedIdx)
        } else if (tag !== "input" && selectedIdx >= 0) {
          e.preventDefault()
          void playAt(selectedIdx)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, close, flatResults.length, selectedIdx, playAt])

  // Scroll the selected item into view when the selection moves (keyboard nav).
  useEffect(() => {
    if (selectedIdx < 0) return
    const el = itemRefs.current[selectedIdx]
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedIdx])

  // Catalog results (local, instant — no debounce). Only computed when the
  // query has text; the empty-state uses the trending TMDB list instead.
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

  // B8: Debounced (300ms) TMDB search — fires movie + TV + person searches
  // in parallel. Movie and TV are merged into `imdbResults`; person results
  // go into `peopleResults`. Skipped when the query is < 2 chars (TMDB's
  // minimum).
  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setImdbResults([])
      setPeopleResults([])
      setImdbSearching(false)
      setPeopleSearching(false)
      return
    }
    setImdbSearching(true)
    setPeopleSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const [movieRes, tvRes, personRes] = await Promise.all([
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=movie`, { cache: "no-store" }),
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=series`, { cache: "no-store" }),
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=person`, { cache: "no-store" }),
        ])
        const movieData = await movieRes.json().catch(() => ({}))
        const tvData = await tvRes.json().catch(() => ({}))
        const personData = await personRes.json().catch(() => ({}))
        const movieItems = (movieData.items ?? []).map((i: any) => ({ ...i, imdbId: i.imdbId ?? null }))
        const tvItems = (tvData.items ?? []).map((i: any) => ({ ...i, imdbId: i.imdbId ?? null }))
        // Merge and interleave movie + TV results
        const merged = [...movieItems, ...tvItems].slice(0, 24)
        setImdbConfigured(true)
        setImdbResults(merged)
        setPeopleResults(personData.items ?? [])
      } catch {
        setImdbResults([])
        setPeopleResults([])
      } finally {
        setImdbSearching(false)
        setPeopleSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // B8: Empty-state trending suggestions — fetched once when the overlay
  // opens. Shown as "Explore trending titles" when the query is empty.
  // Replaces the old CATALOG.slice(0, 9) display with real TMDB trending
  // data so the empty state matches the home page. We fetch both movie and
  // TV trending in parallel and interleave them so the user sees a mix of
  // both content types.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([
      fetch(`/api/tmdb/browse?category=trending&type=movie&page=1`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({})),
      fetch(`/api/tmdb/browse?category=trending&type=series&page=1`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({})),
    ])
      .then(([movieData, tvData]) => {
        if (cancelled) return
        const movieItems: ImdbSearchItem[] = (movieData.items ?? []).slice(0, 12).map((i: any) => ({
          ...i, imdbId: i.imdbId ?? null,
        }))
        const tvItems: ImdbSearchItem[] = (tvData.items ?? []).slice(0, 12).map((i: any) => ({
          ...i, imdbId: i.imdbId ?? null,
        }))
        // Interleave: movie[0], tv[0], movie[1], tv[1], … then truncate to 18
        const merged: ImdbSearchItem[] = []
        const max = Math.max(movieItems.length, tvItems.length)
        for (let i = 0; i < max; i++) {
          if (movieItems[i]) merged.push(movieItems[i])
          if (tvItems[i]) merged.push(tvItems[i])
          if (merged.length >= 18) break
        }
        setTrendingResults(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

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
          // B8: backdrop blur + slightly lighter overlay so the blur is
          // visible. Premium feel — the home page content is still partially
          // visible behind the frosted glass.
          className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 backdrop-blur-md nf-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10"
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
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles, people, or paste an IMDB id…"
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

            {/* Keyboard nav hint — shown only when there are results to navigate */}
            {flatResults.length > 0 && (
              <p className="mt-2 text-right text-[10px] text-white/30">
                ↑↓ to navigate · Enter to play · Esc to close
              </p>
            )}

            {/* IMDB ID quick-play */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
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
                    onKeyDown={(e) => {
                      // Enter on the IMDB input triggers Play (same as the
                      // Play now button) — convenient when the user has
                      // typed a valid IMDB id and pressed Enter.
                      if (e.key === "Enter" && normalizedImdb) {
                        e.preventDefault()
                        playByImdb()
                      }
                    }}
                    placeholder="tt0111161"
                    id="imdb-id-input"
                    aria-label="IMDB ID"
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

            {/* B8: People search — actors/directors. Shown when there are
                person results from the TMDB /search/person endpoint. Each
                person card shows profile image, name, department, and up to
                3 known_for titles as clickable mini-posters (clicking a
                known_for title plays it via the same lazy-IMDB-lookup flow). */}
            {peopleResults.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                  <User className="h-3 w-3" />
                  People
                  {peopleSearching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> TMDB
                    </span>
                  )}
                  {!peopleSearching && `(${peopleResults.length})`}
                </p>
                <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                  {peopleResults.map((p) => (
                    <div
                      key={p.personId}
                      className="w-[220px] shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-800">
                          {p.profile ? (
                            <img
                              src={p.profile}
                              alt={p.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <User className="h-5 w-5 text-white/30" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{p.name}</p>
                          {p.knownForDepartment && (
                            <p className="text-[10px] text-white/50">{p.knownForDepartment}</p>
                          )}
                        </div>
                      </div>
                      {p.knownFor.length > 0 && (
                        <div className="mt-2 flex gap-1.5">
                          {p.knownFor.slice(0, 3).map((k) => (
                            <button
                              key={k.tmdbId}
                              onClick={async () => {
                                try {
                                  const tmdbType = k.type === "series" ? "tv" : "movie"
                                  const res = await fetch(
                                    `/api/tmdb/lookup?tmdbId=${k.tmdbId}&type=${tmdbType}`,
                                    { cache: "no-store" }
                                  )
                                  const data = await res.json().catch(() => ({}))
                                  if (data.imdbId) {
                                    close()
                                    onPlay({
                                      imdbId: data.imdbId,
                                      title: k.title,
                                      type: k.type,
                                      year: k.year,
                                      poster: k.poster ?? "",
                                      overview: k.overview ?? "",
                                      rating: "",
                                      genre: [],
                                    })
                                  }
                                } catch {}
                              }}
                              title={k.title}
                              className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded bg-neutral-800 transition hover:opacity-80"
                            >
                              {k.poster ? (
                                <img
                                  src={k.poster}
                                  alt={k.title}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <Poster title={k.title} className="h-full w-full" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* B8: Empty-state "Explore trending titles" suggestions.
                Shown when the query is empty — replaces the old
                CATALOG.slice(0, 9) display with real TMDB trending data so
                the empty state matches the home page. */}
            {!query.trim() && (
              <div className="mt-6">
                <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Explore trending titles
                </p>
                {trendingResults.length === 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-white/5" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {trendingResults.map((t, idx) => (
                      <button
                        key={t.tmdbId ?? t.imdbId ?? `t-${idx}`}
                        onClick={async () => {
                          if (!t.imdbId && t.tmdbId) {
                            try {
                              const tmdbType = t.type === "series" ? "tv" : "movie"
                              const res = await fetch(
                                `/api/tmdb/lookup?tmdbId=${t.tmdbId}&type=${tmdbType}`,
                                { cache: "no-store" }
                              )
                              const data = await res.json().catch(() => ({}))
                              if (data.imdbId) t.imdbId = data.imdbId
                            } catch {}
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
                        className="group relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-900 text-left transition hover:z-10 hover:scale-105"
                      >
                        <Poster
                          title={t.title}
                          src={t.poster}
                          className="h-full w-full"
                        />
                        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                          <p className="line-clamp-2 text-xs font-bold text-white">{t.title}</p>
                          <p className="text-[10px] text-white/60">
                            {t.year} • {t.type === "series" ? "Series" : "Movie"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Catalog results (local, instant) */}
            {query.trim() && (
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                  Catalog results ({results.length})
                </p>
                {results.length === 0 ? (
                  <p className="py-4 text-center text-xs text-white/40">
                    No catalog matches{imdbConfigured === false ? " — IMDb API not configured" : ""}.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {results.map((t, idx) => {
                      // Compute the flat-list index for this catalog item
                      // (it's after all TMDB results) so keyboard nav highlights
                      // the right card.
                      const flatIdx = imdbResults.length + idx
                      const isSelected = flatIdx === selectedIdx
                      return (
                        <button
                          key={t.imdbId}
                          ref={(el) => { itemRefs.current[flatIdx] = el }}
                          onClick={() => playAt(flatIdx)}
                          className={cn(
                            "group flex gap-3 rounded-lg border bg-white/[0.03] p-2 text-left transition",
                            isSelected
                              ? "border-primary ring-2 ring-primary/60"
                              : "border-white/5 hover:border-white/20 hover:bg-white/[0.08]"
                          )}
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
                      )
                    })}
                  </div>
                )}
              </div>
            )}

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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {imdbResults.map((t, idx) => {
                      const isSelected = idx === selectedIdx
                      return (
                        <button
                          key={t.tmdbId ?? t.imdbId ?? `r-${idx}`}
                          ref={(el) => { itemRefs.current[idx] = el }}
                          onClick={() => playAt(idx)}
                          className={cn(
                            "group flex gap-3 rounded-lg border p-2 text-left transition",
                            isSelected
                              ? "border-primary bg-primary/[0.08] ring-2 ring-primary/60"
                              : "border-primary/20 bg-primary/[0.03] hover:border-primary/40 hover:bg-primary/[0.08]"
                          )}
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
                                ★ {roundRating(t.rating)}
                              </p>
                            ) : null}
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
                              <Play className="h-3 w-3 fill-current" /> Play
                            </span>
                          </div>
                        </button>
                      )
                    })}
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
