"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { Play, Plus, Check, Star, ChevronDown, Info } from "lucide-react"
import { Poster } from "./poster"
import type { Title } from "@/lib/movies-data"
import { useLibrary, type SavedTitle } from "@/lib/library-store"
import { useToast } from "@/hooks/use-toast"
import { useTmdbTitle } from "@/hooks/use-tmdb"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

// Round a TMDB rating string (e.g. "8.034") to 1 decimal place ("8.0").
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

// A relaxed title shape that both catalog titles and saved titles satisfy.
export type CardTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  year?: string | null
  poster?: string | null
  backdrop?: string | null
  overview?: string | null
  rating?: string | null
  genre?: string[]
  badge?: string
  season?: number | null
  episode?: number | null
  progress?: number | null
  position?: number | null
  duration?: number | null
}

type Props = {
  title: CardTitle
  index?: number
  onPlay: (t: CardTitle) => void
  onInfo?: (t: CardTitle) => void
  rank?: number
}

export function ContentCard({ title, onPlay, onInfo, rank }: Props) {
  const { isArabic } = useLang()
  const [hovered, setHovered] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toggleWatchlist, isInWatchlist } = useLibrary()
  const { toast } = useToast()
  const inList = isInWatchlist(title.imdbId)

  // Lazily fetch TMDB metadata (backdrop + genres) only when the popup opens,
  // so we don't spam the API for cards the user never hovers. Cached by
  // useTmdbTitle so subsequent hovers are instant.
  const { data: tmdb } = useTmdbTitle(hovered ? title.imdbId : null, isArabic ? "ar" : "en")

  const enter = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHovered(true), 350)
  }
  const leave = () => {
    if (timer.current) clearTimeout(timer.current)
    setHovered(false)
  }

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const added = await toggleWatchlist({
      imdbId: title.imdbId,
      title: title.title,
      type: title.type,
      poster: title.poster,
      year: title.year,
      overview: title.overview,
      rating: title.rating,
    })
    toast({
      title: added
        ? isArabic ? "أُضيف إلى قائمتي" : "Added to My List"
        : isArabic ? "أُزيل من قائمتي" : "Removed from My List",
      description: title.title,
    })
  }

  return (
    <div
      className="group/card relative aspect-video w-[60vw] shrink-0 sm:w-[280px] md:w-[320px]"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {/* Rank number for Top 10 */}
      {rank ? (
        <div className="pointer-events-none absolute -left-3 top-0 z-0 flex h-full items-start">
          <span
            className="select-none font-black leading-none text-transparent"
            style={{
              fontSize: "clamp(72px, 12vw, 120px)",
              WebkitTextStroke: "3px rgba(255,255,255,0.35)",
            }}
          >
            {rank}
          </span>
        </div>
      ) : null}

      <div className="relative z-10 ml-0 h-full">
        <button
          onClick={() => onPlay(title)}
          className="block h-full w-full overflow-hidden rounded-md bg-neutral-900 text-left"
        >
          <Poster
            title={title.title}
            src={title.poster}
            year={title.year}
            alt={title.title}
            className="h-full w-full transition duration-300 group-hover/card:opacity-90"
          />
          {title.badge ? (
            <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              {title.badge}
            </span>
          ) : null}
          {/* Rating badge — Netflix shows ratings on the poster, not a type pill */}
          {(() => {
            const r = roundRating(title.rating)
            return r ? (
              <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                <Star className="h-2.5 w-2.5 fill-yellow-400" />{r}
              </span>
            ) : null
          })()}
          {/* Progress bar for Continue Watching */}
          {title.progress != null && title.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <div className="h-1 w-full bg-black/60">
                <div className="h-full bg-primary" style={{ width: `${Math.min(title.progress, 100)}%` }} />
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Hover preview popup */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 8, x: "-50%" }}
          animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
          transition={{ duration: 0.18 }}
          className="absolute left-1/2 top-0 z-40 hidden w-[260px] overflow-hidden rounded-md bg-[#181818] shadow-2xl ring-1 ring-white/10 md:block"
          style={{ transformOrigin: "center top" }}
        >
          <button
            onClick={() => onPlay(title)}
            className="relative block aspect-video w-full"
          >
            {/* Prefer the real 16:9 backdrop (from TMDB or supplied) over the */}
            {/* 2:3 poster — it looks much better in the 16:9 popup area. */}
            {(() => {
              const bd = tmdb?.backdrop ?? title.backdrop ?? null
              return bd ? (
                <img
                  src={bd}
                  alt={title.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Poster
                  title={title.title}
                  src={title.poster}
                  className="h-full w-full"
                />
              )
            })()}
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] to-transparent" />
          </button>
          <div className="p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPlay(title)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/80"
                aria-label="Play"
              >
                <Play className="h-4 w-4 fill-black" />
              </button>
              <button
                onClick={handleAdd}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition",
                  inList
                    ? "border-white/60 text-white"
                    : "border-white/40 text-white hover:border-white"
                )}
                aria-label={inList ? "Remove from My List" : "Add to My List"}
              >
                {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              {onInfo ? (
                <button
                  onClick={() => onInfo(title)}
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 text-white transition hover:border-white"
                  aria-label="More info"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-white/80">
              {(() => {
                const r = roundRating(title.rating)
                return r ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-white">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {r}
                  </span>
                ) : null
              })()}
              <span>{title.year}</span>
              <span className="rounded border border-white/30 px-1 text-[9px] uppercase">
                {title.type === "series" ? "Series" : "Movie"}
              </span>
            </div>

            <h4 className="mt-1.5 line-clamp-1 text-sm font-semibold text-white">
              {title.title}
            </h4>
            {(() => {
              const genres = tmdb?.genres ?? title.genre ?? []
              return genres.length > 0 ? (
                <p className="mt-1 line-clamp-1 text-[11px] text-white/60">
                  {genres.slice(0, 3).join(" • ")}
                </p>
              ) : null
            })()}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Small inline info icon button (used in some rows)
export function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-white"
    >
      <Info className="h-3.5 w-3.5" /> More info
    </button>
  )
}
