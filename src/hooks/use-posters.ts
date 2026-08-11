"use client"

import { useEffect, useState } from "react"

// Cache: imdbId → poster URL (persists across the session)
const posterCache = new Map<string, string | null>()

// Batch-fetch posters for a list of IMDB IDs.
// Fetches in chunks of 20 (API limit) and updates the cache.
export function usePosters(imdbIds: string[]) {
  // Initialize from cache synchronously to avoid setState-in-effect
  const [posters, setPosters] = useState<Record<string, string | null>>(() => {
    const fromCache: Record<string, string | null> = {}
    for (const id of imdbIds) fromCache[id] = posterCache.get(id) ?? null
    return fromCache
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!imdbIds.length) return
    // Filter out cached IDs
    const uncached = imdbIds.filter((id) => !posterCache.has(id))
    if (uncached.length === 0) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // Process in chunks of 20
    const chunks: string[][] = []
    for (let i = 0; i < uncached.length; i += 20) {
      chunks.push(uncached.slice(i, i + 20))
    }

    Promise.all(
      chunks.map(async (chunk) => {
        try {
          const res = await fetch(`/api/posters?ids=${chunk.join(",")}`, { cache: "no-store" })
          const data = await res.json().catch(() => ({}))
          return data.posters ?? {}
        } catch {
          return {}
        }
      })
    ).then((results) => {
      const merged: Record<string, string | null> = {}
      for (const r of results) Object.assign(merged, r)
      // Update cache
      for (const id of uncached) {
        posterCache.set(id, merged[id] ?? null)
      }
      // Include cached results
      for (const id of imdbIds) {
        if (!merged[id] && posterCache.has(id)) merged[id] = posterCache.get(id) ?? null
      }
      setPosters(merged)
      setLoading(false)
    })
  }, [imdbIds.join(",")])

  return { posters, loading }
}
