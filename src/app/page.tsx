"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence, MotionConfig } from "framer-motion"
import { Navbar } from "@/components/netflix/navbar"
import { MobileTabBar } from "@/components/netflix/mobile-tab-bar"
import { type CardTitle } from "@/components/netflix/content-card"
import { PlayerModal, type PlayerTitle } from "@/components/netflix/player-modal"
import { SearchOverlay } from "@/components/netflix/search-overlay"
import { ImdbPlayDialog } from "@/components/netflix/imdb-play-dialog"
import { BrowseGrid } from "@/components/netflix/browse-grid"
import { TmdbBrowseGrid } from "@/components/netflix/tmdb-browse-grid"
import { TmdbHome } from "@/components/netflix/tmdb-home"
import { TitleDetail } from "@/components/netflix/title-detail"
import { DownloadHelper } from "@/components/netflix/download-helper"
import { DownloadsPanel } from "@/components/netflix/downloads-panel"
import type { DownloadRecord } from "@/lib/download-history"
import { Footer } from "@/components/netflix/footer"
import { PullToRefresh } from "@/components/netflix/pull-to-refresh"
import { OfflineIndicator } from "@/components/netflix/offline-indicator"
import { ScrollToTop } from "@/components/netflix/scroll-to-top"
import { AIChat } from "@/components/netflix/ai-chat"
import { Poster } from "@/components/netflix/poster"
import {
  CATALOG,
  getRows,
  type Title,
} from "@/lib/movies-data"
import { useLibrary, type SavedTitle } from "@/lib/library-store"
import { useLang } from "@/lib/lang-context"
import { Play, Bookmark, History, Search as SearchIcon, Film, Tv, Download, Star } from "lucide-react"

type NavKey = "home" | "series" | "movies" | "mylist"

export default function Home() {
  return (
    // reducedMotion="user": when the visitor's OS is set to "reduce motion",
    // framer-motion automatically drops transform/layout springs (card pops,
    // slide-ins, Ken Burns) and keeps only simple opacity fades. Paired with
    // the `prefers-reduced-motion` block in globals.css for CSS animations.
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
        <HomeContent />
      </Suspense>
    </MotionConfig>
  )
}

function HomeContent() {
  const { t } = useLang()
  const searchParams = useSearchParams()

  // ── URL-synced state ────────────────────────────────────────────────────
  // Each view has its own shareable link:
  //   /                  → Home
  //   /?nav=series       → Series browse page
  //   /?nav=movies       → Movies browse page
  //   /?nav=mylist       → My List page
  //   /?detail=tt1234567 → Title detail page for that IMDB ID
  //   /?play=tt1234567   → Player modal open for that title
  //   /?search=1         → Search overlay open
  //
  // We read the initial state from the URL on mount, and push updates to the
  // URL whenever state changes. Browser back/forward works naturally.

  // Read initial values from URL
  const initialNav = (searchParams.get("nav") as NavKey) || "home"
  const initialDetailId = searchParams.get("detail")
  const initialPlayId = searchParams.get("play")
  const initialSearch = searchParams.get("search") === "1"
  // Optional season/episode deep-link params for ?play=tt… series URLs:
  //   /?play=tt2290891&s=8&e=1  → open الكبير أوي S8E1 directly.
  const initialSeason = Number(searchParams.get("s")) || null
  const initialEpisode = Number(searchParams.get("e")) || null

  const [player, setPlayer] = useState<PlayerTitle | null>(null)
  const [detail, setDetail] = useState<{ imdbId: string; title: string; type: "movie" | "series"; year?: string | null; poster?: string | null; overview?: string | null; rating?: string | null } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [imdbOpen, setImdbOpen] = useState(false)
  // Downloads panel + re-download target (opened from the panel)
  const [dlPanelOpen, setDlPanelOpen] = useState(false)
  const [dlRedownload, setDlRedownload] = useState<DownloadRecord | null>(null)
  const [nav, setNav] = useState<NavKey>(initialNav)
  const { watchlist, load } = useLibrary()

  // ── Sync state → URL ────────────────────────────────────────────────────
  // Build the query string from current state and update the URL (without
  // scrolling). We use replace for detail/player/search (overlays) and push
  // for nav changes (distinct pages the user might want to go back to).
  //
  // NOTE: we drive the History API directly instead of router.push/replace.
  // This page is state-driven — the URL only matters for deep-links and
  // back/forward, both handled by reading window.location (mount effect +
  // popstate below). In this Next 16 dev setup, router.replace/push-to-bare-"/"
  // were silently swallowed (no history entry, no URL change) — direct
  // history calls are instant and popstate-compatible.
  const updateUrl = useCallback((opts: {
    nav?: NavKey
    detailId?: string | null
    playId?: string | null
    search?: boolean
    push?: boolean
  }) => {
    const params = new URLSearchParams()
    const n = opts.nav ?? nav
    if (n !== "home") params.set("nav", n)
    if (opts.detailId) params.set("detail", opts.detailId)
    if (opts.playId) params.set("play", opts.playId)
    if (opts.search) params.set("search", "1")
    const qs = params.toString()
    const url = qs ? `/?${qs}` : "/"
    try {
      if (opts.push) history.pushState(null, "", url)
      else history.replaceState(null, "", url)
    } catch {
      /* history unavailable (rare) — URL sync is best-effort */
    }
  }, [nav])

  // ── On mount: if the URL has ?detail=tt... or ?play=tt..., resolve it ───
  // We don't have the full title object from the URL alone, so we fetch it
  // from the TMDB API to get the title, poster, type, etc.
  // The API returns { title: { title, type, poster, ... } } — the actual
  // title data is nested under data.title.
  useEffect(() => {
    if (initialDetailId) {
      // Check if it's a tmdb- prefixed ID (title without IMDB ID)
      if (initialDetailId.startsWith("tmdb-")) {
        const tmdbId = initialDetailId.replace("tmdb-", "")
        // Fetch title details from TMDB directly
        fetch(`/api/tmdb/lookup?tmdbId=${tmdbId}&type=tv`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data) {
              setDetail({
                imdbId: initialDetailId,
                title: data.name ?? data.title ?? "",
                type: "series",
                year: (data.first_air_date ?? "").slice(0, 4) || null,
                poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
                overview: data.overview ?? null,
                rating: data.vote_average ? String(data.vote_average) : null,
              })
            }
          })
          .catch(() => {})
        return
      }
      // Resolve title detail from IMDB ID
      fetch(`/api/tmdb/${initialDetailId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const t = data?.title ?? data
          if (t) {
            setDetail({
              imdbId: initialDetailId,
              title: t.title ?? "",
              type: t.type ?? "movie",
              year: t.year ?? null,
              poster: t.poster ?? null,
              overview: t.overview ?? null,
              rating: t.rating ?? null,
            })
          }
        })
        .catch(() => {})
    } else if (initialPlayId) {
      // Check if it's a tmdb- prefixed ID (title without IMDB ID)
      if (initialPlayId.startsWith("tmdb-")) {
        const tmdbId = initialPlayId.replace("tmdb-", "")
        // Try TV first, then movie
        fetch(`/api/tmdb/lookup?tmdbId=${tmdbId}&type=tv`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data) {
              setPlayer({
                imdbId: initialPlayId,
                title: data.name ?? "",
                type: "series",
                poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
                year: (data.first_air_date ?? "").slice(0, 4) || null,
                overview: data.overview ?? null,
                rating: data.vote_average ? String(data.vote_average) : null,
                season: initialSeason ?? 1,
                episode: initialEpisode ?? 1,
              })
            } else {
              // Try movie
              return fetch(`/api/tmdb/lookup?tmdbId=${tmdbId}&type=movie`)
                .then((r) => r.ok ? r.json() : null)
                .then((movieData) => {
                  if (movieData) {
                    setPlayer({
                      imdbId: initialPlayId,
                      title: movieData.title ?? "",
                      type: "movie",
                      poster: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
                      year: (movieData.release_date ?? "").slice(0, 4) || null,
                      overview: movieData.overview ?? null,
                      rating: movieData.vote_average ? String(movieData.vote_average) : null,
                      season: null,
                      episode: null,
                    })
                  }
                })
            }
          })
          .catch(() => {})
        return
      }
      // Resolve player title from IMDB ID
      fetch(`/api/tmdb/${initialPlayId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const t = data?.title ?? data
          if (t) {
            setPlayer({
              imdbId: initialPlayId,
              title: t.title ?? "",
              type: t.type ?? "movie",
              poster: t.poster ?? null,
              year: t.year ?? null,
              overview: t.overview ?? null,
              rating: t.rating ?? null,
              season: t.type === "series" ? (initialSeason ?? 1) : null,
              episode: t.type === "series" ? (initialEpisode ?? 1) : null,
            })
          }
        })
        .catch(() => {})
    }
    if (initialSearch) {
      // Defer to a microtask so the effect body doesn't set state synchronously
      // (avoids cascading renders flagged by react-hooks/set-state-in-effect).
      Promise.resolve().then(() => setSearchOpen(true))
    }
  }, [])

  // ── Handle browser back/forward buttons ─────────────────────────────────
  // When the user clicks back/forward, the URL changes but our React state
  // doesn't automatically update. We listen for popstate and sync state
  // from the new URL.
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const newNav = (params.get("nav") as NavKey) || "home"
      const newDetailId = params.get("detail")
      const newPlayId = params.get("play")
      const newSearch = params.get("search") === "1"

      setNav(newNav)
      setSearchOpen(newSearch)

      // If the URL has a detail/play ID we don't currently have, resolve it
      if (newDetailId && (!detail || detail.imdbId !== newDetailId)) {
        fetch(`/api/tmdb/${newDetailId}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            const t = data?.title ?? data
            if (t) {
              setDetail({
                imdbId: newDetailId,
                title: t.title ?? "",
                type: t.type ?? "movie",
                year: t.year ?? null,
                poster: t.poster ?? null,
                overview: t.overview ?? null,
                rating: t.rating ?? null,
              })
            }
          })
          .catch(() => {})
      } else if (!newDetailId) {
        setDetail(null)
      }

      if (newPlayId && (!player || player.imdbId !== newPlayId)) {
        fetch(`/api/tmdb/${newPlayId}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            const t = data?.title ?? data
            if (t) {
              setPlayer({
                imdbId: newPlayId,
                title: t.title ?? "",
                type: t.type ?? "movie",
                poster: t.poster ?? null,
                year: t.year ?? null,
                overview: t.overview ?? null,
                rating: t.rating ?? null,
                season: null,
                episode: null,
              })
            }
          })
          .catch(() => {})
      } else if (!newPlayId) {
        setPlayer(null)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [detail, player])

  // Load watchlist from API on mount (history is now IndexedDB-based)
  useEffect(() => {
    load()
  }, [load])

  // Scroll to top on page mount AND on nav change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [nav])

  // ── State setters that also sync to URL ──────────────────────────────────
  const handleSetNav = useCallback((k: NavKey) => {
    setNav(k)
    // Close any open overlays when switching pages
    setDetail(null)
    setPlayer(null)
    setSearchOpen(false)
    updateUrl({ nav: k, detailId: null, playId: null, search: false, push: true })
  }, [updateUrl])

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
    setPlayer(null)
    setSearchOpen(false)
    updateUrl({ detailId: t.imdbId, playId: null, search: false, push: true })
  }, [updateUrl])

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
    setDetail(null)
    setSearchOpen(false)
    updateUrl({ detailId: null, playId: t.imdbId, search: false, push: true })
  }, [updateUrl])

  // Close handlers — clear the URL params
  const closeDetail = useCallback(() => {
    setDetail(null)
    updateUrl({ detailId: null, push: true })
  }, [updateUrl])

  const closePlayer = useCallback(() => {
    setPlayer(null)
    updateUrl({ playId: null, push: true })
  }, [updateUrl])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    updateUrl({ search: false })
  }, [updateUrl])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    updateUrl({ search: true })
  }, [updateUrl])

  // AI Chat — when the AI suggests a title, open the detail page.
  // If we have an imdbId, open directly. If we only have a tmdbId, do a
  // lookup first to resolve the imdbId.
  const handleAIPlay = useCallback(async (s: {
    title: string
    year?: string
    type: "movie" | "series"
    tmdbId?: number
    imdbId?: string
    poster?: string | null
    overview?: string
    rating?: string | null
  }) => {
    if (s.imdbId) {
      openDetail({
        imdbId: s.imdbId,
        title: s.title,
        type: s.type,
        year: s.year ?? null,
        poster: s.poster ?? null,
        overview: s.overview ?? null,
        rating: s.rating ?? null,
      } as CardTitle)
      return
    }
    if (s.tmdbId) {
      try {
        const tmdbType = s.type === "series" ? "tv" : "movie"
        const res = await fetch(`/api/tmdb/lookup?tmdbId=${s.tmdbId}&type=${tmdbType}`)
        if (res.ok) {
          const data = await res.json()
          if (data.imdbId) {
            openDetail({
              imdbId: data.imdbId,
              title: s.title,
              type: s.type,
              year: s.year ?? null,
              poster: s.poster ?? null,
              overview: s.overview ?? null,
              rating: s.rating ?? null,
            } as CardTitle)
            return
          }
        }
      } catch {}
    }
    // Fallback: open the search overlay so the user can find it manually
    openSearch()
  }, [openDetail, openSearch])

  const rows = useMemo(() => getRows(), [])

  const rowsForNav = useMemo(() => {
    if (nav === "series")
      return rows.filter((r) => r.title.toLowerCase().includes("series") || r.title.toLowerCase().includes("popular series"))
    if (nav === "movies")
      return rows.filter((r) => r.title.toLowerCase().includes("movie") || r.title.toLowerCase().includes("popular movies"))
    return rows
  }, [nav, rows])

  // Continue Watching is now handled entirely by IndexedDB inside TmdbHome
  // via the useClientWatchHistory hook. No need to pass it as a prop.

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

  // B12 — Keyboard / TV-style nav is only enabled on the home page when no
  // dialog/player/search overlay is open. This prevents the arrow-key
  // handler from interfering with the player's R/N/T/F shortcuts, the
  // search overlay's arrow-key nav, or text input fields.
  const keyboardNavEnabled =
    nav === "home" && !player && !detail && !searchOpen && !imdbOpen

  return (
    /* Bottom clearance for the bottom navigation on EVERY screen size now:
       mobile = full-width tab bar (56px + safe-area inset), desktop (lg+) =
       centered floating dock (bottom-6 + 64px pill) → lg:pb-28 keeps the
       footer/content clear of the dock. */
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-28">
      <PullToRefresh />
      <Navbar
        onSearch={openSearch}
        onNav={(k) => handleSetNav(k as NavKey)}
        onDownloads={() => setDlPanelOpen(true)}
      />

      <main className="flex-1" style={{ display: player || detail ? "none" : undefined }}>
        {/* View transition — subtle fade+slide when switching between Home /
            Series / Movies / My List. `initial={false}` so the first paint is
            instant (no animation on page load), `mode="wait"` so the outgoing
            view exits before the new one mounts (no layout jump). Disabled
            automatically for reduced-motion users via MotionConfig. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={nav}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* My List view */}
            {nav === "mylist" ? (
              <MyListView items={myListCards} onPlay={openDetail} onSearch={openSearch} />
            ) : nav === "movies" ? (
              <TmdbBrowseGrid type="movie" onPlay={openDetail} />
            ) : nav === "series" ? (
              <TmdbBrowseGrid type="series" onPlay={openDetail} />
            ) : (
              <>
                {/* TMDB-powered home page (real posters, trending content).
                    Continue Watching is rendered INSIDE TmdbHome (below the hero,
                    above content rows) so it's positioned correctly and survives
                    the loading → content transition. */}
                <TmdbHome
                  onPlay={openDetail}
                  onPlayNow={openPlayer}
                  myList={myListCards}
                  onPlayHistory={openPlayer}
                  keyboardNavEnabled={keyboardNavEnabled}
                />

                {/* Library banner */}
                <LibraryBanner onNav={(k) => handleSetNav(k as NavKey)} />

                {/* IMDB quick-launch banner */}
                <ImdbBanner onOpen={openSearch} />
              </>
            )}
            </motion.div>
          </AnimatePresence>

          {/* Back-to-top FAB — mounted inside <main> so it automatically
              hides whenever the player or title-detail overlay takes over
              (main is display:none in that state). */}
          <ScrollToTop />
        </main>

        {(!player && !detail) && <Footer onNav={(k) => handleSetNav(k as NavKey)} />}

      {/* Bottom navigation on every screen size — mobile: full-width
          thumb-zone tab bar; desktop: centered floating pill dock (the
          mobile edition's navigation on the browser edition). Renders below
          every overlay (z-40 < modal z-90+), so dialogs cover it. */}
      <MobileTabBar
        active={nav}
        onNav={(k) => handleSetNav(k as NavKey)}
      />

      {/* Title detail page (TMDB metadata, cast, trailer, similar) */}
      <TitleDetail
        title={detail ?? { imdbId: "", title: "", type: "movie" }}
        open={!!detail}
        onClose={closeDetail}
        onPlay={(t) => { closeDetail(); openPlayer(t) }}
      />

      <PlayerModal title={player} onClose={closePlayer} />
      <OfflineIndicator />

      {/* Downloads history panel + page-level re-download helper.
          The DownloadHelper here is opened from the panel's "Re-download"
          action, preloaded with that record's title/season/episode. */}
      <DownloadsPanel
        open={dlPanelOpen}
        onClose={() => setDlPanelOpen(false)}
        onRedownload={(rec) => setDlRedownload(rec)}
      />
      {dlRedownload && (
        <DownloadHelper
          open
          onClose={() => setDlRedownload(null)}
          imdbId={dlRedownload.imdbId}
          type={dlRedownload.type}
          season={dlRedownload.season ?? undefined}
          episode={dlRedownload.episode ?? undefined}
          title={dlRedownload.title}
          poster={dlRedownload.poster}
        />
      )}
      <SearchOverlay
        open={searchOpen}
        onClose={closeSearch}
        onPlay={(t) => { closeSearch(); openDetail(t) }}
        onPlayDirect={(t) => { closeSearch(); openPlayer(t) }}
      />
      <ImdbPlayDialog
        open={imdbOpen}
        onClose={() => setImdbOpen(false)}
        onPlay={(t) => openPlayer(t)}
      />

      {/* AI Recommendation Assistant — floating chat popup */}
      <AIChat onPlayTitle={handleAIPlay} />
    </div>
  )
}

// Round a TMDB rating string to 1 decimal for badge display.
function roundRating(r: string | null | undefined): string | null {
  if (!r) return null
  const n = Number(r)
  return Number.isNaN(n) ? null : n.toFixed(1)
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
  // Signature rise-in easing (same curve as the hero text cascade).
  const EASE: [number, number, number, number] = [0.2, 0.7, 0.3, 1]

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {items.map((t, i) => {
            const rating = roundRating(t.rating)
            return (
              <motion.button
                key={t.imdbId}
                onClick={() => onPlay(t)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.035, 0.45), ease: EASE }}
                className="group relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-900 text-left transition-transform duration-200 active:scale-[0.97] sm:hover:scale-[1.03]"
              >
                <Poster
                  title={t.title}
                  src={t.poster}
                  year={t.year}
                  className="h-full w-full"
                />
                {rating && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                    <Star className="h-2.5 w-2.5 fill-yellow-400" />{rating}
                  </span>
                )}
                {/* Info overlay — ALWAYS visible on touch (no hover there),
                    hover/focus reveal on pointer devices. */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/25 to-transparent p-2.5 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                  <p className="line-clamp-2 text-xs font-bold text-white">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/60">
                    {t.year}
                    <span className="rounded border border-white/25 bg-black/40 px-1 text-[8px] font-bold uppercase tracking-wide text-white/70">
                      {t.type === "series" ? tr("seriesShort") : tr("movieShort")}
                    </span>
                  </p>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                    <Play className="h-3 w-3 fill-white" /> {tr("play")}
                  </span>
                </div>
              </motion.button>
            )
          })}
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

// ── Backup site links ────────────────────────────────────────────────────────
