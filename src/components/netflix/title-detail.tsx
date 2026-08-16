"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Play, Plus, Check, Star, Clock, Calendar, Film, Tv,
  ChevronDown, Loader2, Users, Volume2, VolumeX,
} from "lucide-react"
import { Poster } from "./poster"
import { TrailerIframe } from "./trailer-iframe"
import { useTmdbTitle } from "@/hooks/use-tmdb"
import { useLibrary, type SavedTitle } from "@/lib/library-store"
import { useToast } from "@/hooks/use-toast"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

// Round a TMDB rating string (e.g. "8.034") to 1 decimal place ("8.0").
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = parseFloat(r)
  if (Number.isNaN(n)) return null
  return n.toFixed(1)
}

type Props = {
  title: { imdbId: string; title: string; type: "movie" | "series"; year?: string | null; poster?: string | null; overview?: string | null; rating?: string | null }
  open: boolean
  onClose: () => void
  onPlay: (t: { imdbId: string; title: string; type: "movie" | "series"; year?: string | null; poster?: string | null; overview?: string | null; rating?: string | null; season?: number; episode?: number }) => void
}

export function TitleDetail({ title, open, onClose, onPlay }: Props) {
  // Force remount when the imdbId changes so the hook re-initializes
  return (
    <TitleDetailInner
      key={title.imdbId + (open ? "-open" : "-closed")}
      title={title}
      open={open}
      onClose={onClose}
      onPlay={onPlay}
    />
  )
}

function TitleDetailInner({ title, open, onClose, onPlay }: Props) {
  const { t, isArabic } = useLang()
  const { data: tmdb, loading } = useTmdbTitle(open ? title.imdbId : null, isArabic ? "ar" : "en")
  const { toggleWatchlist, isInWatchlist, history } = useLibrary()
  const { toast } = useToast()
  const [showCast, setShowCast] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [selectedEpisode, setSelectedEpisode] = useState(1)
  const [detailMuted, setDetailMuted] = useState(true)

  // The hero trailer auto-plays via the reusable <TrailerIframe> component.
  // We only pass the key when the modal is open AND the TMDB data has resolved
  // with a valid YouTube trailer. The component handles the 1.2s delay before
  // mounting the iframe (lets the backdrop paint first). When the modal
  // closes or the title changes, the key remount (via the wrapper `key` prop
  // on TitleDetailInner) unmounts the iframe immediately — no trailer leak.

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = "" }
  }, [open, close])

  // Reset season/episode when a new title opens (using key remount instead)
  // The key={title.imdbId + (open ? "-open" : "-closed")} on the wrapper
  // forces a full remount, so state resets automatically.

  const inList = isInWatchlist(title.imdbId)
  const watchProgress = history.find((h) => h.imdbId === title.imdbId)?.progress

  const isSeries = title.type === "series"
  // Use TMDB seasons (from the API) for the season selector
  const seasons = tmdb?.tmdbSeasons ?? null
  const seasonCount = seasons?.length ?? 0
  const currentSeasonEpisodes = seasons?.find((s) => s.season === selectedSeason)?.episodes ?? 0

  const displayTitle = tmdb?.title ?? title.title
  const displayYear = tmdb?.year ?? title.year ?? ""
  const displayOverview = tmdb?.overview ?? title.overview ?? ""
  const displayRating = tmdb?.rating ?? title.rating ?? null
  const displayPoster = tmdb?.poster ?? title.poster ?? null
  const displayBackdrop = tmdb?.backdrop ?? null
  const displayGenres = tmdb?.genres ?? []
  const displayRuntime = tmdb?.runtime ?? null

  const handlePlay = () => {
    onPlay({
      imdbId: title.imdbId,
      title: displayTitle,
      type: title.type,
      year: displayYear,
      poster: displayPoster,
      overview: displayOverview,
      rating: displayRating,
      season: isSeries ? selectedSeason : undefined,
      episode: isSeries ? selectedEpisode : undefined,
    })
  }

  const handleAddToList = async () => {
    const added = await toggleWatchlist({
      imdbId: title.imdbId, title: displayTitle, type: title.type,
      poster: displayPoster, year: displayYear, overview: displayOverview, rating: displayRating,
    } as SavedTitle)
    toast({ title: added ? "Added to My List" : "Removed from My List", description: displayTitle })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] overflow-y-auto bg-black/95 nf-scroll"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="mx-auto w-full max-w-5xl"
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Backdrop hero — trailer auto-plays on top via <TrailerIframe>.
                The backdrop image stays underneath at all times so there's
                never a black flash, even before the trailer mounts or if no
                trailer exists. */}
            <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
              {displayBackdrop ? (
                <img src={displayBackdrop} alt={displayTitle} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <Poster title={displayTitle} src={displayPoster} className="absolute inset-0 h-full w-full" />
              )}
              {/* YouTube trailer — one reusable <TrailerIframe>. Only pass the
                  key when the modal is open and TMDB returned a YouTube trailer.
                  The component handles the 1.2s delay before mounting. */}
              <TrailerIframe
                trailerKey={open && tmdb?.trailerSite === "YouTube" ? tmdb.trailerKey : null}
                title={displayTitle}
                delay={1200}
                muted={detailMuted}
                background
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 via-transparent to-transparent" />

              {/* Close */}
              <button onClick={close} aria-label="Close" className="absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80">
                <X className="h-5 w-5" />
              </button>

              {/* Mute toggle — visible whenever a valid YouTube trailer exists */}
              {open && tmdb?.trailerSite === "YouTube" && tmdb.trailerKey && (
                <button
                  onClick={() => setDetailMuted((m) => !m)}
                  aria-label={detailMuted ? "Unmute" : "Mute"}
                  className="absolute right-16 top-4 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                >
                  {detailMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}

              {/* Title + actions overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
                  <span className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 font-bold uppercase text-primary-foreground">
                    {title.type === "series" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    {title.type === "series" ? t("seriesShort") : t("movieShort")}
                  </span>
                  {displayYear && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{displayYear}</span>}
                  {displayRuntime && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{displayRuntime}m</span>}
                </div>
                <h1 className="text-3xl font-black text-white sm:text-5xl drop-shadow-lg">{displayTitle}</h1>
                {displayRating && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-white">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />{roundRating(displayRating)}
                    </span>
                    {tmdb?.voteCount && <span className="text-white/50">({tmdb.voteCount.toLocaleString()} votes)</span>}
                  </div>
                )}

                {/* Season selector for series */}
                {isSeries && seasonCount > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs font-semibold text-white/60">{t("season")}:</label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => { setSelectedSeason(Number(e.target.value)); setSelectedEpisode(1) }}
                      className="rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
                    >
                      {Array.from({ length: seasonCount }, (_, i) => i + 1).map((s) => {
                        const eps = seasons?.find((sd) => sd.season === s)?.episodes ?? 0
                        return <option key={s} value={s}>{t("season")} {s} ({eps} {t("episodes")})</option>
                      })}
                    </select>
                    {currentSeasonEpisodes > 0 && (
                      <select
                        value={selectedEpisode}
                        onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                        className="rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
                      >
                        {Array.from({ length: currentSeasonEpisodes }, (_, i) => i + 1).map((e) => (
                          <option key={e} value={e}>{t("episodes")} {e}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={handlePlay} className="inline-flex items-center gap-2 rounded-md bg-white px-8 py-3 text-sm font-bold text-black transition hover:bg-white/80">
                    <Play className="h-5 w-5 fill-black" />
                    {isSeries ? `${t("play")} S${selectedSeason} E${selectedEpisode}` : t("play")}
                  </button>
                  <button onClick={handleAddToList} className={cn(
                    "inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-bold backdrop-blur-sm transition",
                    inList ? "bg-white/20 text-white hover:bg-white/30" : "bg-white/10 text-white hover:bg-white/20"
                  )}>
                    {inList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    {inList ? t("inMyList") : t("myList")}
                  </button>
                </div>
                {watchProgress != null && watchProgress > 0 && (
                  <div className="mt-3 max-w-xs">
                    <div className="h-1 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full bg-primary" style={{ width: `${watchProgress}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-white/50">{watchProgress}% {isArabic ? "تمت مشاهدته" : "watched"}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="bg-[#0a0a0a] p-6 sm:p-8">
              {loading && (
                <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}…</div>
              )}

              {/* Overview + genres */}
              {displayOverview && (
                <p className="max-w-3xl text-sm leading-relaxed text-white/80 sm:text-base">{displayOverview}</p>
              )}
              {displayGenres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {displayGenres.map((g) => (
                    <span key={g} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">{g}</span>
                  ))}
                </div>
              )}

              {/* Old standalone trailer section removed — trailer now plays in the hero */}

              {/* Cast */}
              {tmdb?.cast && tmdb.cast.length > 0 && (
                <div className="mt-6">
                  <button onClick={() => setShowCast((v) => !v)} className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                    <Users className="h-5 w-5" /> {t("cast")}
                    <ChevronDown className={cn("h-4 w-4 transition", showCast && "rotate-180")} />
                  </button>
                  <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4", !showCast && "line-clamp-2 overflow-hidden")}>
                    {tmdb.cast.slice(0, showCast ? 15 : 4).map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-800">
                          {c.profile ? <img src={c.profile} alt={c.name} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-white/30"><Users className="h-5 w-5" /></div>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{c.name}</p>
                          <p className="truncate text-[10px] text-white/50">{c.character}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar titles */}
              {tmdb?.similar && tmdb.similar.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-lg font-bold text-white">{t("moreLikeThis")}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                    {tmdb.similar.slice(0, 6).map((s, i) => (
                      <button key={i} onClick={() => onPlay({ imdbId: s.imdbId ?? title.imdbId, title: s.title, type: s.type, year: s.year, poster: s.poster })} className="group text-left">
                        <Poster title={s.title} src={s.poster} className="aspect-[2/3] w-full rounded-md transition group-hover:ring-2 group-hover:ring-primary" />
                        <p className="mt-1 line-clamp-1 text-xs font-medium text-white">{s.title}</p>
                        <p className="text-[10px] text-white/40">{s.year}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
