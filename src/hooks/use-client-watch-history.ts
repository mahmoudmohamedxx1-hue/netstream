"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  getWatchHistory,
  saveWatchProgress,
  removeWatchItem,
  clearWatchHistory,
  isIndexedDBAvailable,
  type WatchHistoryItem,
} from "@/lib/client-history"

// ═══════════════════════════════════════════════════════════════════════════
// useClientWatchHistory — React hook for IndexedDB-backed Continue Watching.
//
// Loads history from IndexedDB on mount. Exposes:
//   items: WatchHistoryItem[] (sorted by updatedAt desc, max 20)
//   isLoading: boolean (true while IndexedDB is opening/loading)
//   error: string | null (if IndexedDB fails)
//   refresh(): re-load from IndexedDB
//   saveProgress(item): save to IndexedDB + update React state immediately
//   removeItem(imdbId): remove from IndexedDB + update React state
//   clearAll(): clear all history from IndexedDB + React state
// ═══════════════════════════════════════════════════════════════════════════

export function useClientWatchHistory() {
  const [items, setItems] = useState<WatchHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!isIndexedDBAvailable()) {
      setError("IndexedDB is not available in this browser")
      setIsLoading(false)
      return
    }
    try {
      const history = await getWatchHistory()
      if (!mountedRef.current) return
      setItems(history)
      setError(null)
    } catch (e: any) {
      if (!mountedRef.current) return
      setError(e?.message ?? "Failed to load watch history")
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  // Load on mount
  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  // Save progress to IndexedDB + update React state immediately
  const saveProgress = useCallback(async (item: WatchHistoryItem) => {
    // Update React state immediately (optimistic update)
    setItems((prev) => {
      const rest = prev.filter((x) => x.imdbId !== item.imdbId)
      // If progress >= 95%, remove instead of adding
      if (item.progress != null && item.progress >= 95) {
        return rest
      }
      return [{ ...item, updatedAt: new Date().toISOString() }, ...rest].slice(0, 20)
    })

    // Save to IndexedDB (deduplicated internally)
    try {
      await saveWatchProgress(item)
    } catch (e) {
      console.error("[useClientWatchHistory] saveProgress error:", e)
    }
  }, [])

  // Remove a single item
  const removeItem = useCallback(async (imdbId: string) => {
    setItems((prev) => prev.filter((x) => x.imdbId !== imdbId))
    try {
      await removeWatchItem(imdbId)
    } catch (e) {
      console.error("[useClientWatchHistory] removeItem error:", e)
    }
  }, [])

  // Clear all history
  const clearAll = useCallback(async () => {
    setItems([])
    try {
      await clearWatchHistory()
    } catch (e) {
      console.error("[useClientWatchHistory] clearAll error:", e)
    }
  }, [])

  // Save when the page becomes hidden (user switches tabs / minimizes)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Force flush any pending writes
        getWatchHistory().catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [])

  return {
    items,
    isLoading,
    error,
    refresh,
    saveProgress,
    removeItem,
    clearAll,
  }
}
