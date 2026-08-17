"use client"

import { Play, Check, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  season: number
  episode: number
  totalEpisodes: number
  onChange: (episode: number) => void
}

// Netflix-style episode list: large horizontal cards with thumbnail
// placeholders, episode number, title, description, and duration.
// Each card is full-width, scrollable vertically, with a play button
// overlay on hover. The active episode is highlighted with a red accent.
export function EpisodeGrid({ season, episode, totalEpisodes, onChange }: Props) {
  const episodes = Array.from({ length: totalEpisodes }, (_, i) => i + 1)

  return (
    <section className="px-4 pb-8 sm:px-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/10 pb-3">
        <h3 className="text-xl font-bold text-white sm:text-2xl">
          Episodes
        </h3>
        <span className="text-sm text-white/50">
          Season {season} · {totalEpisodes} episode{totalEpisodes === 1 ? "" : "s"}
        </span>
      </div>

      {/* Scrollable episode list — Netflix uses a vertical scroll list, not a grid */}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {episodes.map((ep) => {
          const active = ep === episode
          return (
            <button
              key={ep}
              onClick={() => onChange(ep)}
              className={cn(
                "group flex w-full items-center gap-4 overflow-hidden rounded-lg border p-3 text-left transition-all duration-200",
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
              )}
            >
              {/* Thumbnail placeholder with episode number + play overlay */}
              <div
                className={cn(
                  "relative grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-md sm:h-20 sm:w-36",
                  active ? "bg-primary/30" : "bg-white/10"
                )}
              >
                {/* Episode number — large, centered */}
                <span
                  className={cn(
                    "text-2xl font-black tabular-nums transition-opacity sm:text-3xl",
                    active ? "text-primary" : "text-white/70"
                  )}
                >
                  {ep}
                </span>

                {/* Play overlay on hover (or check if active) */}
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

              {/* Episode info — title, description, metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-bold sm:text-base",
                      active ? "text-white" : "text-white/90"
                    )}
                  >
                    {ep}.
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold sm:text-base",
                      active ? "text-white" : "text-white/90"
                    )}
                  >
                    Episode {ep}
                  </span>
                  {active && (
                    <span className="ml-auto shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                      ▶ Playing
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-white/50 sm:text-sm">
                  {season > 0 ? `Season ${season} · Episode ${ep}` : `Episode ${ep}`}
                </p>
                {/* Duration placeholder — Netflix shows episode length */}
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
                  <Clock className="h-3 w-3" />
                  <span>~45 min</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
