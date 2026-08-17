"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Film,
  Tv,
  Play,
  X,
  Link2,
  Sparkles,
  Info,
  Loader2,
  Star,
  Search,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATALOG, type Title } from "@/lib/movies-data"
import { normalizeImdbId } from "@/lib/vidsrc"
import { useImdbTitle, type ImdbTitleData } from "@/hooks/use-imdb"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  onPlay: (t: Title) => void
}

export function ImdbPlayDialog({ open, onClose, onPlay }: Props) {
  const [imdb, setImdb] = useState("")
  const [type, setType] = useState<"movie" | "series">("movie")
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const { toast } = useToast()

  const normalized = normalizeImdbId(imdb)
  const catalogMatch = normalized
    ? CATALOG.find((t) => t.imdbId === normalized)
    : undefined

  // Fetch real IMDb metadata for the entered id (cached by hook).
  const { title: imdbData, loading, configured } = useImdbTitle(
    normalized && !catalogMatch ? normalized : null
  )

  const close = useCallback(() => {
    setImdb("")
    setType("movie")
    setSeason(1)
    setEpisode(1)
    onClose()
  }, [onClose])

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

  // Effective title to play: prefer IMDb API data → catalog → manual.
  const effectiveTitle: Title | null = useMemo(() => {
    if (catalogMatch) return { ...catalogMatch }
    if (imdbData) return imdbDataToTitle(imdbData)
    if (normalized) {
      const overview =
        type === "series"
          ? `Streaming series ${normalized} — Season ${season}, Episode ${episode} via vidsrc.`
          : `Streaming ${type} ${normalized} via vidsrc.`
      return {
        imdbId: normalized,
        title: `IMDB ${normalized}`,
        type,
        year: "",
        poster: "",
        overview,
        rating: "",
        genre: [],
      }
    }
    return null
  }, [catalogMatch, imdbData, normalized, type, season, episode])

  const submit = () => {
    if (!normalized) {
      toast({
        title: "Invalid IMDB ID",
        description: "Use a format like tt0111161 (or just the digits).",
      })
      return
    }
    if (!effectiveTitle) return
    close()
    onPlay(effectiveTitle)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 nf-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl nf-scroll"
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 to-transparent px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-primary">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  Play by IMDB ID
                </h2>
                <p className="text-xs text-white/50">
                  {configured === false
                    ? "Curated catalog + any IMDB id via vidsrc."
                    : "Fetches real metadata from the IMDb API."}
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5">
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-white/70">
                  IMDB ID
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    autoFocus
                    value={imdb}
                    onChange={(e) => setImdb(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && normalized) submit()
                    }}
                    placeholder="tt0111161"
                    className="h-11 border-white/15 bg-white/10 pl-9 font-mono text-white placeholder:text-white/30"
                  />
                  {loading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
                  )}
                </div>
                {imdb && normalized ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <Sparkles className="h-3 w-3" />
                    {catalogMatch
                      ? `In catalog: ${catalogMatch.title} (${catalogMatch.year})`
                      : imdbData
                        ? `IMDb: ${imdbData.title} (${imdbData.year})`
                        : configured === false
                          ? `Valid → ${normalized} (no IMDb API key set)`
                          : `Valid → ${normalized}`}
                  </p>
                ) : imdb ? (
                  <p className="mt-1.5 text-[11px] text-red-400">
                    Use format tt0000000 (or just the digits).
                  </p>
                ) : null}
              </div>

              {/* Live IMDb preview */}
              {imdbData && (
                <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-neutral-900">
                    {imdbData.poster ? (
                      <img
                        src={imdbData.poster}
                        alt={imdbData.title}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-white">
                      {imdbData.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/60">
                      <span>{imdbData.year || "—"}</span>
                      <span className="inline-flex items-center gap-0.5">
                        {imdbData.rating ? (
                          <>
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {imdbData.rating}
                          </>
                        ) : null}
                      </span>
                      <span className="rounded border border-white/20 px-1 uppercase">
                        {imdbData.type === "series" ? "Series" : "Movie"}
                      </span>
                    </div>
                    {imdbData.overview ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/50">
                        {imdbData.overview}
                      </p>
                    ) : null}
                    {imdbData.genres.length > 0 ? (
                      <p className="mt-1 line-clamp-1 text-[10px] text-white/40">
                        {imdbData.genres.join(" • ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {!catalogMatch && !imdbData && (
                <>
                  <div>
                    <Label className="mb-1.5 block text-xs font-medium text-white/70">
                      Type
                    </Label>
                    <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
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

                  {type === "series" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1.5 block text-xs font-medium text-white/70">
                          Season
                        </Label>
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
                        <Label className="mb-1.5 block text-xs font-medium text-white/70">
                          Episode
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={episode}
                          onChange={(e) =>
                            setEpisode(
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          }
                          className="h-11 border-white/15 bg-white/10 text-white"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                onClick={submit}
                disabled={!normalized || !effectiveTitle}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-bold transition",
                  normalized && effectiveTitle
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-white/10 text-white/40"
                )}
              >
                <Play className="h-4 w-4 fill-current" />
                Play now
              </button>

              <p className="flex items-start gap-1.5 rounded-md bg-white/[0.04] p-2.5 text-[11px] leading-relaxed text-white/50">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Find any IMDB ID on imdb.com — it&apos;s in the URL (e.g.
                imdb.com/title/tt0111161). When IMDb API credentials are
                configured, real title/rating/poster load automatically;
                otherwise the stream still plays via vidsrc using the id.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function imdbDataToTitle(d: ImdbTitleData): Title {
  return {
    imdbId: d.imdbId,
    title: d.title,
    type: d.type,
    year: d.year,
    poster: d.poster ?? "",
    overview: d.overview ?? "",
    rating: d.rating ?? "",
    genre: d.genres,
  }
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition",
        active ? "bg-white text-black" : "text-white/70 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
