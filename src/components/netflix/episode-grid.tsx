"use client"

import { useEffect, useState } from "react"
import { Play, Check, Clock, Calendar, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  season: number
  episode: number
  totalEpisodes: number
  tmdbId?: number
  /** Set of watched episode numbers (shows a checkmark) */
  watchedEpisodes?: Set<number>
  onChange: (episode: number) => void
}

type Episode = {
  episodeNumber: number
  name: string
  overview: string
  still: string | null
  runtime: number | null
  airDate: string | null
  voteAverage: number | null
}

// Netflix-style episode list with real thumbnails, names, descriptions.
// Fetches episode data from /api/tmdb/season when tmdbId is available.
// Falls back to simple numbered cards when no TMDB data.
export function EpisodeGrid({ season, episode, totalEpisodes, tmdbId, watchedEpisodes, onChange }: Props) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tmdbId) return
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) setLoading(true) })
    fetch(`/api/tmdb/season?tmdbId=${tmdbId}&season=${season}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setEpisodes(data.episodes ?? [])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tmdbId, season])

  // Build episode list: use TMDB data if available, otherwise generate numbers
  const epList: Episode[] = episodes.length > 0
    ? episodes
    : Array.from({ length: totalEpisodes }, (_, i) => ({
        episodeNumber: i + 1,
        name: `Episode ${i + 1}`,
        overview: "",
        still: null,
        runtime: null,
        airDate: null,
        voteAverage: null,
      }))

  return (
    <section className="px-4 pb-8 sm:px-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/10 pb-3">
        <h3 className="text-xl font-bold text-white sm:text-2xl">Episodes</h3>
        <span className="text-sm text-white/50">
          Season {season} · {epList.length} episode{epList.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Scrollable episode list */}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-white/40">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
            Loading episodes…
          </div>
        )}
        {!loading && epList.map((ep) => {
          const active = ep.episodeNumber === episode
          const watched = watchedEpisodes?.has(ep.episodeNumber) ?? false
          return (
            <button
              key={ep.episodeNumber}
              onClick={() => onChange(ep.episodeNumber)}
              className={cn(
                "group flex w-full items-start gap-4 overflow-hidden rounded-lg border p-3 text-left transition-all duration-200",
                active
                  ? "border-primary/60 bg-primary/10"
                  : watched
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
              )}
            >
              {/* Thumbnail — TMDB episode still or gradient placeholder.
                  No episode number overlay — the thumbnail shows as-is.
                  Play button only appears on hover (group-hover). */}
              <div
                className={cn(
                  "relative h-16 w-28 shrink-0 overflow-hidden rounded-md sm:h-20 sm:w-36",
                  active ? "bg-primary/30" : "bg-white/10"
                )}
              >
                {ep.still ? (
                  <img
                    src={ep.still}
                    alt={ep.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
                {/* Play overlay — only appears on hover. Active episode shows check. */}
                <div
                  className={cn(
                    "absolute inset-0 grid place-items-center transition-opacity",
                    active
                      ? "bg-primary/80 opacity-100"
                      : "bg-black/50 opacity-0 group-hover:opacity-100"
                  )}
                >
                  {active ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <Check className="h-6 w-6 text-white" />
                      <span className="text-[9px] font-bold uppercase text-white">Playing</span>
                    </div>
                  ) : (
                    <Play className="h-7 w-7 fill-white text-white" />
                  )}
                </div>
              </div>

              {/* Episode info — name, description, metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white/90 sm:text-base">
                    {ep.episodeNumber}. {ep.name}
                  </span>
                  {active && (
                    <span className="ml-auto shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                      ▶ Playing
                    </span>
                  )}
                  {!active && watched && (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                      <Eye className="h-3 w-3" /> Watched
                    </span>
                  )}
                </div>
                {ep.overview && (
                  <p className="mt-1 line-clamp-2 text-xs text-white/50 sm:text-sm">
                    {ep.overview}
                  </p>
                )}
                {/* Metadata row — runtime + air date + rating */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                  {ep.runtime && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {ep.runtime}m
                    </span>
                  )}
                  {ep.airDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {ep.airDate}
                    </span>
                  )}
                  {ep.voteAverage && ep.voteAverage > 0 && (
                    <span className="text-yellow-400/70">★ {ep.voteAverage.toFixed(1)}</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
