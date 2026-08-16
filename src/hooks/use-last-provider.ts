"use client"

// Remembers the last provider the user picked for a given title, so that
// reopening the same title (or continuing to watch) restores it instantly.
// Falls back gracefully if localStorage is unavailable (SSR / private mode).

import { useCallback, useState } from "react"

const KEY = "netstream:last-provider"
// Per-imdbId map: { "tt0111161": "vidsrc.net", ... }
type LastProviderMap = Record<string, string>

function read(): LastProviderMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LastProviderMap) : {}
  } catch {
    return {}
  }
}

function write(map: LastProviderMap) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private-mode errors
  }
}

export function useLastProvider() {
  // Lazy-initialize from localStorage so SSR + first client render agree.
  // On the server, window is undefined → empty map.
  const [map, setMap] = useState<LastProviderMap>(() => read())

  const get = useCallback(
    (imdbId: string): string | null => {
      return map[imdbId.toLowerCase()] ?? null
    },
    [map]
  )

  const set = useCallback((imdbId: string, sourceId: string) => {
    const id = imdbId.toLowerCase()
    setMap((prev) => {
      const next = { ...prev, [id]: sourceId }
      write(next)
      return next
    })
  }, [])

  return { get, set }
}
