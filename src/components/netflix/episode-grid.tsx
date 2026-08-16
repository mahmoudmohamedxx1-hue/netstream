"use client"

import { Play, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  season: number
  episode: number
  totalEpisodes: number
  onChange: (episode: number) => void
}

// Netflix-style episode grid: a scrollable list of episode cards with a
// thumbnail placeholder, number, title, and a play affordance.
export function EpisodeGrid({ season, episode, totalEpisodes, onChange }: Props) {
  const episodes = Array.from({ length: totalEpisodes }, (_, i) => i + 1)

  return (
    <section className="px-4 pb-6 sm:px-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-white">
          Episodes
          <span className="ml-2 text-sm font-normal text-white/50">
            Season {season}
          </span>
        </h3>
        <span className="text-xs text-white/40">
          {totalEpisodes} episode{totalEpisodes === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {episodes.map((ep) => {
          const active = ep === episode
          return (
            <button
              key={ep}
              onClick={() => onChange(ep)}
              className={cn(
                "group flex items-center gap-3 rounded-lg border p-2 text-left transition",
                active
                  ? "border-primary bg-primary/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]"
              )}
            >
              {/* Episode number tile */}
              <div
                className={cn(
                  "relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded",
                  active ? "bg-primary text-white" : "bg-white/10 text-white/70"
                )}
              >
                <span className="text-lg font-black tabular-nums">{ep}</span>
                {active ? (
                  <div className="absolute inset-0 grid place-items-center bg-primary/90">
                    <Check className="h-5 w-5 text-white" />
                  </div>
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-white text-white" />
                  </div>
                )}
              </div>

              {/* Episode info */}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "line-clamp-1 text-sm font-semibold",
                    active ? "text-white" : "text-white/90"
                  )}
                >
                  Episode {ep}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50">
                  {season > 0 ? `S${season} · E${ep}` : `E${ep}`}
                </p>
              </div>

              {active && (
                <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                  Playing
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
