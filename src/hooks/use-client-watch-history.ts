"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  getWatchHistory,
  upsertWatchItem,
  deleteWatchItem,
  clearWatchHistory,
  isIndexedDBAvailable,
  type WatchHistoryItem,
} from "@/lib/client-history"

export function useClientWatchHistory() {
  const [items, setItems] = useState<WatchHistoryItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!isIndexedDBAvailable()) {
      setError("IndexedDB is not available in this browser.")
      setLoaded(true)
      return
    }
    try {
      const history = await getWatchHistory()
      if (!mounted.current) return
      setItems(history)
      setError(null)
    } catch (e: any) {
      if (!mounted.current) return
      setError(e?.message ?? "Failed to load watch history from IndexedDB.")
    } finally {
      if (mounted.current) setLoaded(true)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    return () => { mounted.current = false }
  }, [refresh])

  const saveProgress = useCallback(async (item: Partial<WatchHistoryItem>) => {
    // Optimistic state update
    setItems(prev => {
      const rest = prev.filter(x => x.imdbId !== item.imdbId)
      if (item.progress != null && item.progress >= 95) return rest
      const now = new Date().toISOString()
      const existing = prev.find(x => x.imdbId === item.imdbId)
      const merged: WatchHistoryItem = {
        imdbId: item.imdbId!,
        title: item.title ?? existing?.title ?? item.imdbId!,
        type: item.type ?? existing?.type ?? "movie",
        poster: item.poster ?? existing?.poster ?? null,
        backdrop: item.backdrop ?? existing?.backdrop ?? null,
        year: item.year ?? existing?.year ?? null,
        overview: item.overview ?? existing?.overview ?? null,
        rating: item.rating ?? existing?.rating ?? null,
        season: item.season ?? existing?.season ?? null,
        episode: item.episode ?? existing?.episode ?? null,
        position: item.position ?? existing?.position ?? null,
        duration: item.duration ?? existing?.duration ?? null,
        progress: item.progress ?? existing?.progress ?? null,
        sourceId: item.sourceId ?? existing?.sourceId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      return [merged, ...rest].slice(0, 20)
    })
    try { await upsertWatchItem(item) } catch (e) { console.error("[useClientWatchHistory] save:", e) }
  }, [])

  const removeItem = useCallback(async (imdbId: string) => {
    setItems(prev => prev.filter(x => x.imdbId !== imdbId))
    try { await deleteWatchItem(imdbId) } catch (e) { console.error("[useClientWatchHistory] remove:", e) }
  }, [])

  const clearAll = useCallback(async () => {
    setItems([])
    try { await clearWatchHistory() } catch (e) { console.error("[useClientWatchHistory] clear:", e) }
  }, [])

  return { items, loaded, error, refresh, saveProgress, removeItem, clearAll }
}
