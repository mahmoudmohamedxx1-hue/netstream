"use client"

import { create } from "zustand"

export type SavedTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  poster?: string | null
  year?: string | null
  overview?: string | null
  rating?: string | null
  season?: number | null
  episode?: number | null
  progress?: number | null
  position?: number | null
  duration?: number | null
  sourceId?: string | null  // last used streaming provider
  updatedAt?: string
}

type LibraryState = {
  watchlist: SavedTitle[]
  history: SavedTitle[]
  loaded: boolean

  load: () => Promise<void>
  toggleWatchlist: (t: SavedTitle) => Promise<boolean>
  removeWatchlist: (imdbId: string) => Promise<void>
  isInWatchlist: (imdbId: string) => boolean
  recordPlay: (t: SavedTitle) => Promise<void>
  updateProgress: (imdbId: string, progress: number, position: number, duration: number, sourceId?: string) => Promise<void>
  removeHistory: (imdbId: string) => Promise<void>
  clearHistory: () => Promise<void>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  watchlist: [],
  history: [],
  loaded: false,

  load: async () => {
    try {
      const [wRes, hRes] = await Promise.all([
        fetch("/api/watchlist", { cache: "no-store" }),
        fetch("/api/history", { cache: "no-store" }),
      ])
      const w = wRes.ok ? ((await wRes.json()) as { items: SavedTitle[] }) : { items: [] }
      const h = hRes.ok ? ((await hRes.json()) as { items: SavedTitle[] }) : { items: [] }
      set({ watchlist: w.items ?? [], history: h.items ?? [], loaded: true })
    } catch {
      // Retry once after 1s if the first attempt fails (server might still be compiling)
      setTimeout(async () => {
        try {
          const [wRes, hRes] = await Promise.all([
            fetch("/api/watchlist", { cache: "no-store" }),
            fetch("/api/history", { cache: "no-store" }),
          ])
          const w = wRes.ok ? ((await wRes.json()) as { items: SavedTitle[] }) : { items: [] }
          const h = hRes.ok ? ((await hRes.json()) as { items: SavedTitle[] }) : { items: [] }
          set({ watchlist: w.items ?? [], history: h.items ?? [], loaded: true })
        } catch {
          set({ loaded: true })
        }
      }, 1000)
    }
  },

  toggleWatchlist: async (t) => {
    const exists = get().watchlist.some((x) => x.imdbId === t.imdbId)
    if (exists) {
      await fetch(`/api/watchlist?imdbId=${encodeURIComponent(t.imdbId)}`, {
        method: "DELETE",
      })
      set((s) => ({
        watchlist: s.watchlist.filter((x) => x.imdbId !== t.imdbId),
      }))
      return false
    }
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    })
    set((s) => ({ watchlist: [t, ...s.watchlist] }))
    return true
  },

  removeWatchlist: async (imdbId) => {
    await fetch(`/api/watchlist?imdbId=${encodeURIComponent(imdbId)}`, {
      method: "DELETE",
    })
    set((s) => ({ watchlist: s.watchlist.filter((x) => x.imdbId !== imdbId) }))
  },

  isInWatchlist: (imdbId) => get().watchlist.some((x) => x.imdbId === imdbId),

  recordPlay: async (t) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    })
    set((s) => {
      const rest = s.history.filter((x) => x.imdbId !== t.imdbId)
      return { history: [{ ...t, updatedAt: new Date().toISOString() }, ...rest] }
    })
  },

  updateProgress: async (imdbId, progress, position, duration, sourceId) => {
    // Don't overwrite the title — only update progress/position/duration/sourceId.
    // The title is set by recordPlay (which has the real title).
    // We send a PATCH-like update via POST with only the fields we want to change.
    // The API upserts, but since the record already exists (from recordPlay),
    // it will update only the fields we send. We DON'T send 'title' so it's preserved.
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send the existing title from the store to avoid overwriting it
      body: JSON.stringify({
        imdbId,
        title: get().history.find((x) => x.imdbId === imdbId)?.title ?? imdbId,
        type: get().history.find((x) => x.imdbId === imdbId)?.type ?? "movie",
        progress, position, duration, sourceId,
      }),
    })
    set((s) => ({
      history: s.history.map((x) =>
        x.imdbId === imdbId ? { ...x, progress, position, duration, sourceId: sourceId ?? x.sourceId } : x
      ),
    }))
  },

  removeHistory: async (imdbId) => {
    await fetch(`/api/history?imdbId=${encodeURIComponent(imdbId)}`, {
      method: "DELETE",
    })
    set((s) => ({ history: s.history.filter((x) => x.imdbId !== imdbId) }))
  },

  clearHistory: async () => {
    await fetch(`/api/history?all=1`, { method: "DELETE" })
    set({ history: [] })
  },
}))
