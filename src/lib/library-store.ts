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
      // Use a 15s timeout — the dev server may need to compile the API route
      // on first request (takes 3-5s). Without this, the fetch fails silently.
      const [wRes, hRes] = await Promise.all([
        fetch("/api/watchlist", { cache: "no-store", signal: AbortSignal.timeout(15000) }),
        fetch("/api/history", { cache: "no-store", signal: AbortSignal.timeout(15000) }),
      ])
      const w = wRes.ok ? ((await wRes.json()) as { items: SavedTitle[] }) : { items: [] }
      const h = hRes.ok ? ((await hRes.json()) as { items: SavedTitle[] }) : { items: [] }
      set({ watchlist: w.items ?? [], history: h.items ?? [], loaded: true })
    } catch {
      // Don't set loaded:true on error — the retry in page.tsx will try again.
    }
  },

  toggleWatchlist: async (t) => {
    const exists = get().watchlist.some((x) => x.imdbId === t.imdbId)
    if (exists) {
      await fetch(`/api/watchlist?imdbId=${encodeURIComponent(t.imdbId)}`, {
        method: "DELETE",
      })
      set((s) => ({ watchlist: s.watchlist.filter((x) => x.imdbId !== t.imdbId) }))
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      })
      set((s) => ({ watchlist: [t, ...s.watchlist] }))
    }
    return !exists
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
    // Send the existing title from the store to avoid overwriting it.
    const existing = get().history.find((x) => x.imdbId === imdbId)
    const titleToSend = existing?.title ?? imdbId
    const typeToSend = existing?.type ?? "movie"
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imdbId,
        title: titleToSend,
        type: typeToSend,
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
