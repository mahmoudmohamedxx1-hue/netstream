"use client"

import { Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLibrary } from "@/lib/library-store"

type Props = {
  imdbId: string
  title?: string | null
  type?: "movie" | "series" | null
  poster?: string | null
  year?: string | null
  className?: string
}

// LikeButton — client-based like toggle. Stores likes in localStorage via the
// useLibrary store. Shows the total like count for this title on this device
// and toggles the heart fill. Instant (no API calls), works offline.
export function LikeButton({ imdbId, title, type, poster, year, className }: Props) {
  const { likes, toggleLike, isLiked } = useLibrary()
  const liked = isLiked(imdbId)
  // The "count" is how many users on this device liked it. Since this is
  // client-based (no backend), the count is either 0 or 1 — we show the heart
  // fill state rather than a number to keep it clean.
  const _count = likes.filter((l) => l.imdbId === imdbId).length

  const handleToggle = () => {
    if (!imdbId) return
    toggleLike({ imdbId, title: title ?? "", type: type ?? "movie", poster, year: year ?? null })
  }

  return (
    <button
      onClick={handleToggle}
      aria-label={liked ? "Unlike" : "Like"}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-bold backdrop-blur-sm transition",
        liked
          ? "border-primary/60 bg-primary/20 text-primary"
          : "border-white/30 bg-black/40 text-white hover:border-white/60 hover:bg-black/60",
        className
      )}
    >
      <Heart className={cn("h-4 w-4 transition-transform", liked && "fill-current scale-110")} />
      <span>{liked ? "Liked" : "Like"}</span>
    </button>
  )
}
