"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/netflix/navbar"
import { Hero } from "@/components/netflix/hero"
import { ContentRow } from "@/components/netflix/content-row"
import { ContentCard, type CardTitle } from "@/components/netflix/content-card"
import { PlayerModal, type PlayerTitle } from "@/components/netflix/player-modal"
import { SearchOverlay } from "@/components/netflix/search-overlay"
import { ImdbPlayDialog } from "@/components/netflix/imdb-play-dialog"
import { BrowseGrid } from "@/components/netflix/browse-grid"
import { TmdbBrowseGrid } from "@/components/netflix/tmdb-browse-grid"
import { TmdbHome } from "@/components/netflix/tmdb-home"
import { TitleDetail } from "@/components/netflix/title-detail"
import { Footer } from "@/components/netflix/footer"
import { Poster } from "@/components/netflix/poster"
import {
  CATALOG,
  getRows,
  getHeroTitles,
  type Title,
} from "@/lib/movies-data"
import { useLibrary, type SavedTitle } from "@/lib/library-store"
import { useLang } from "@/lib/lang-context"
import { Play, Bookmark, History, Search as SearchIcon, Film, Tv, Download } from "lucide-react"

type NavKey = "home" | "series" | "movies" | "mylist"

export default function Home() {
  const { t } = useLang()
  const [player, setPlayer] = useState<PlayerTitle | null>(null)
  const [detail, setDetail] = useState<{ imdbId: string; title: string; type: "movie" | "series"; year?: string | null; poster?: string | null; overview?: string | null; rating?: string | null } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [imdbOpen, setImdbOpen] = useState(false)
  const [nav, setNav] = useState<NavKey>("home")
  const { watchlist, history, load } = useLibrary()

  useEffect(() => {
    load()
  }, [load])

  // Open the title detail page (TMDB metadata, cast, trailer, similar)
  const openDetail = useCallback((t: CardTitle | Title | SavedTitle) => {
    setDetail({
      imdbId: t.imdbId,
      title: t.title,
      type: t.type,
      year: t.year ?? null,
      poster: t.poster ?? null,
      overview: t.overview ?? null,
      rating: t.rating ?? null,
    })
  }, [])

  // Play directly (skips detail) — used by "Continue Watching" and IMDB dialog
  const openPlayer = useCallback((t: CardTitle | Title | SavedTitle) => {
    setPlayer({
      imdbId: t.imdbId,
      title: t.title,
      type: t.type,
      poster: t.poster ?? null,
      year: t.year ?? null,
      overview: t.overview ?? null,
      rating: t.rating ?? null,
      season: (t as { season?: number | null }).season ?? null,
      episode: (t as { episode?: number | null }).episode ?? null,
    })
  }, [])

  const rows = useMemo(() => getRows(), [])
  const heroTitles = useMemo(() => getHeroTitles(), [])

  const heroForNav = useMemo(() => {
    if (nav === "series") return CATALOG.filter((t) => t.type === "series").slice(0, 4)
    if (nav === "movies") return CATALOG.filter((t) => t.type === "movie").slice(0, 4)
    return heroTitles
  }, [nav, heroTitles])

  const rowsForNav = useMemo(() => {
    if (nav === "series")
      return rows.filter((r) => r.title.toLowerCase().includes("series") || r.title.toLowerCase().includes("popular series"))
    if (nav === "movies")
      return rows.filter((r) => r.title.toLowerCase().includes("movie") || r.title.toLowerCase().includes("popular movies"))
    return rows
  }, [nav, rows])

  // Continue watching as CardTitle[]
  const continueWatching: CardTitle[] = useMemo(
    () =>
      history.map((h) => ({
        imdbId: h.imdbId,
        title: h.title,
        type: h.type,
        poster: h.poster ?? null,
        year: h.year ?? null,
        overview: h.overview ?? null,
        rating: h.rating ?? null,
        season: h.season ?? null,
        episode: h.episode ?? null,
        progress: h.progress ?? null,
        position: h.position ?? null,
        duration: h.duration ?? null,
      })),
    [history]
  )

  const myListCards: CardTitle[] = useMemo(
    () =>
      watchlist.map((w) => ({
        imdbId: w.imdbId,
        title: w.title,
        type: w.type,
        poster: w.poster ?? null,
        year: w.year ?? null,
        overview: w.overview ?? null,
        rating: w.rating ?? null,
      })),
    [watchlist]
  )

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      <Navbar
        onSearch={() => setSearchOpen(true)}
        onProfile={() => setImdbOpen(true)}
        active={nav}
        onNav={(k) => setNav(k as NavKey)}
      />

      <main className="flex-1">
        {/* My List view */}
        {nav === "mylist" ? (
          <MyListView items={myListCards} onPlay={openDetail} onSearch={() => setSearchOpen(true)} />
        ) : nav === "movies" ? (
          <TmdbBrowseGrid type="movie" onPlay={openDetail} />
        ) : nav === "series" ? (
          <TmdbBrowseGrid type="series" onPlay={openDetail} />
        ) : (
          <>
            {/* TMDB-powered home page (real posters, trending content) */}
            <TmdbHome
              onPlay={openDetail}
              continueWatching={continueWatching}
              myList={myListCards}
              onPlayHistory={openPlayer}
            />

            {/* Library banner */}
            <LibraryBanner onNav={(k) => setNav(k as NavKey)} />

            {/* IMDB quick-launch banner */}
            <ImdbBanner onOpen={() => setSearchOpen(true)} />
          </>
        )}
      </main>

      <Footer />

      {/* Title detail page (TMDB metadata, cast, trailer, similar) */}
      <TitleDetail
        title={detail ?? { imdbId: "", title: "", type: "movie" }}
        open={!!detail}
        onClose={() => setDetail(null)}
        onPlay={(t) => { setDetail(null); openPlayer(t) }}
      />

      <PlayerModal title={player} onClose={() => setPlayer(null)} />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPlay={(t) => { setSearchOpen(false); openDetail(t) }}
      />
      <ImdbPlayDialog
        open={imdbOpen}
        onClose={() => setImdbOpen(false)}
        onPlay={(t) => openPlayer(t)}
      />
    </div>
  )
}

function MyListView({
  items,
  onPlay,
  onSearch,
}: {
  items: CardTitle[]
  onPlay: (t: CardTitle) => void
  onSearch: () => void
}) {
  const { t: tr } = useLang()

  // Enhancement E: export watchlist + history as JSON for backup/restore.
  const handleExport = async () => {
    try {
      const [wRes, hRes] = await Promise.all([
        fetch("/api/watchlist", { cache: "no-store" }),
        fetch("/api/history", { cache: "no-store" }),
      ])
      const w = await wRes.json()
      const h = await hRes.json()
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        watchlist: w.items ?? [],
        history: h.items ?? [],
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `netstream-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  return (
    <div className="px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Bookmark className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{tr("mylist")}</h1>
        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {items.length}
        </span>
        {/* Export backup button (enhancement E) */}
        {items.length > 0 && (
          <button
            onClick={handleExport}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            title="Export watchlist + history as JSON backup"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export backup</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <Bookmark className="mx-auto mb-3 h-10 w-10 text-white/30" />
          <p className="text-lg font-semibold text-white">{tr("yourListEmpty")}</p>
          <p className="mt-1 text-sm text-white/60">
            {tr("yourListEmptyDesc")}
          </p>
          <button
            onClick={onSearch}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            <SearchIcon className="h-4 w-4" />
            {tr("searchPlay")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((t) => (
            <button
              key={t.imdbId}
              onClick={() => onPlay(t)}
              className="group relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-900 text-left"
            >
              <Poster
                title={t.title}
                src={t.poster}
                year={t.year}
                className="h-full w-full transition group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-white">
                  <Play className="h-3.5 w-3.5 fill-white" /> {tr("play")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ImdbBanner({ onOpen }: { onOpen: () => void }) {
  const { t: tr } = useLang()
  return (
    <section className="mx-4 my-10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-primary/20 via-[#1a1a1a] to-[#0a0a0a] p-6 sm:mx-8 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <History className="h-5 w-5 text-primary" />
            {tr("haveImdbId")}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-white/70">
            {tr("haveImdbIdDesc")}{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white">
              tt0111161
            </code>
            {tr("andPlayIt")}
          </p>
        </div>
        <button
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white/80"
        >
          <SearchIcon className="h-4 w-4" />
          {tr("openPlayer")}
        </button>
      </div>
    </section>
  )
}

function LibraryBanner({ onNav }: { onNav: (k: string) => void }) {
  const { t: tr } = useLang()
  return (
    <section className="mx-4 my-10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.06] via-[#1a1a1a] to-[#0a0a0a] p-6 sm:mx-8 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <Film className="h-5 w-5 text-primary" />
            {tr("exploreLibrary")}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-white/70">
            {tr("exploreLibraryDesc")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onNav("movies")}
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white/80"
          >
            <Film className="h-4 w-4" />
            {tr("movies")}
          </button>
          <button
            onClick={() => onNav("series")}
            className="inline-flex items-center gap-2 rounded-md bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <Tv className="h-4 w-4" />
            {tr("series")}
          </button>
        </div>
      </div>
    </section>
  )
}
