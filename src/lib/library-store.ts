"use client"

import { create } from "zustand"

export type SavedTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  poster?: string | null
  backdrop?: string | null
  year?: string | null
  overview?: string | null
  rating?: string | null
  season?: number | null
  episode?: number | null
  progress?: number | null
  position?: number | null
  duration?: number | null
  sourceId?: string | null
  updatedAt?: string
}

type LibraryState = {
  watchlist: SavedTitle[]
  // history is now managed by IndexedDB via useClientWatchHistory hook.
  // These are kept for backward compatibility but are no longer the source of truth.
  history: SavedTitle[]
  loaded: boolean

  load: () => Promise<void>
  toggleWatchlist: (t: SavedTitle) => Promise<boolean>
  removeWatchlist: (imdbId: string) => Promise<void>
  isInWatchlist: (imdbId: string) => boolean
  // History functions are no-ops — IndexedDB handles everything via the hook.
  // Kept for backward compat with player-modal.tsx imports.
  recordPlay: (t: SavedTitle) => Promise<void>
  updateProgress: (imdbId: string, progress: number, position: number, duration: number, sourceId?: string) => Promise<void>
  removeHistory: (imdbId: string) => Promise<void>
  clearHistory: () => Promise<void>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  watchlist: [],
  history: [], // No longer populated — IndexedDB is the source of truth
  loaded: false,

  load: async () => {
    try {
      const wRes = await fetch("/api/watchlist", { cache: "no-store", signal: AbortSignal.timeout(15000) })
      const w = wRes.ok ? ((await wRes.json()) as { items: SavedTitle[] }) : { items: [] }
      set({ watchlist: w.items ?? [], loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  toggleWatchlist: async (t) => {
    const exists = get().watchlist.some((x) => x.imdbId === t.imdbId)
    if (exists) {
      await fetch(`/api/watchlist?imdbId=${encodeURIComponent(t.imdbId)}`, { method: "DELETE" })
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
    await fetch(`/api/watchlist?imdbId=${encodeURIComponent(imdbId)}`, { method: "DELETE" })
    set((s) => ({ watchlist: s.watchlist.filter((x) => x.imdbId !== imdbId) }))
  },

  isInWatchlist: (imdbId) => get().watchlist.some((x) => x.imdbId === imdbId),

  // ── History functions are now no-ops — IndexedDB handles everything ──────
  // The player-modal.tsx uses saveWatchProgress() from client-history.ts directly.
  // These are kept only to not break imports.
  recordPlay: async () => {},
  updateProgress: async () => {},
  removeHistory: async () => {},
  clearHistory: async () => {},
}))
