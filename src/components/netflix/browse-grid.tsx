"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { Poster } from "./poster"
import { Input } from "@/components/ui/input"
import { usePosters } from "@/hooks/use-posters"
import type { CardTitle } from "./content-card"
import { cn } from "@/lib/utils"

type ApiTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  year: string
  genres: string[]
}

type Props = {
  type?: "movie" | "series"
  onPlay: (t: CardTitle) => void
}

const PAGE_SIZE = 60

export function BrowseGrid({ type, onPlay }: Props) {
  const [items, setItems] = useState<ApiTitle[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<ApiTitle[]>([])
  const [searching, setSearching] = useState(false)
  const offsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Load initial batch
  const loadBatch = useCallback(
    async (offset: number, reset = false) => {
      if (reset) {
        setLoading(true)
        setHasMore(true)
      } else {
        setLoadingMore(true)
      }
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        })
        if (type) params.set("type", type)
        const r = await fetch(`/api/titles/browse?${params}`, {
          cache: "no-store",
        })
        const data = await r.json().catch(() => ({}))
        const batch: ApiTitle[] = data.items ?? []
        if (reset) {
          setItems(batch)
          offsetRef.current = batch.length
        } else {
          setItems((prev) => [...prev, ...batch])
          offsetRef.current = offset + batch.length
        }
        if (batch.length < PAGE_SIZE) setHasMore(false)
      } catch {
        if (reset) setItems([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [type]
  )

  useEffect(() => {
    loadBatch(0, true)
  }, [loadBatch])

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const q = search.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/titles/search?q=${encodeURIComponent(q)}&limit=60`,
          { cache: "no-store" }
        )
        const data = await r.json().catch(() => ({}))
        setSearchResults(data.items ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadBatch(offsetRef.current)
        }
      },
      { rootMargin: "400px" }
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, loading, loadBatch])

  const display = search.trim().length >= 2 ? searchResults : items
  const totalCount = type === "movie" ? "10,000" : type === "series" ? "1,000" : "11,000"

  // Batch-fetch TMDB posters for the displayed titles
  const displayIds = useMemo(() => display.map((t) => t.imdbId), [display])
  const { posters } = usePosters(displayIds)

  return (
    <div className="px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {type === "movie"
              ? "Movies Library"
              : type === "series"
                ? "TV Series Library"
                : "Browse All Titles"}
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {totalCount} top-rated titles from the IMDb database
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the full library…"
            className="h-11 border-white/15 bg-white/10 pl-9 text-white placeholder:text-white/30"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] animate-pulse rounded-md bg-white/5"
            />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-semibold text-white">
            {search.trim().length >= 2
              ? "No matches found"
              : "No titles available"}
          </p>
          <p className="mt-1 text-sm text-white/50">
            {search.trim().length >= 2
              ? `No titles match "${search}"`
              : "Try again later."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
            {display.map((t) => (
              <button
                key={t.imdbId}
                onClick={() =>
                  onPlay({
                    imdbId: t.imdbId,
                    title: t.title,
                    type: t.type,
                    year: t.year,
                    genres: t.genres,
                  })
                }
                className="group relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-900 text-left transition hover:z-10 hover:scale-105 hover:ring-2 hover:ring-primary"
              >
                <Poster
                  title={t.title}
                  src={posters[t.imdbId] ?? null}
                  year={t.year}
                  className="h-full w-full"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <p className="line-clamp-2 text-xs font-bold text-white">
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/60">
                    {t.year} • {t.type === "series" ? "Series" : "Movie"}
                  </p>
                  {t.genres.length > 0 && (
                    <p className="mt-0.5 line-clamp-1 text-[9px] text-primary">
                      {t.genres.slice(0, 2).join(" • ")}
                    </p>
                  )}
                </div>
                {/* Type badge */}
                <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-bold uppercase text-white/80 backdrop-blur-sm">
                  {t.type === "series" ? "TV" : "MV"}
                </span>
              </button>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {search.trim().length < 2 && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              {loadingMore ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : hasMore ? (
                <span className="text-xs text-white/30">Scroll for more…</span>
              ) : (
                <span className="text-xs text-white/30">
                  You&apos;ve reached the end — {items.length} titles loaded
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
