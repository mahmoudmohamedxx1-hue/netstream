"use client"

import { useEffect, useState } from "react"

export type ImdbTitleData = {
  imdbId: string
  title: string
  type: "movie" | "series"
  year: string
  rating: string | null
  voteCount: number | null
  poster: string | null
  overview: string | null
  genres: string[]
  runtimeMinutes: number | null
}

type State = {
  loading: boolean
  configured: boolean | null
  title: ImdbTitleData | null
  error: string | null
}

const IDLE: State = {
  loading: false,
  configured: null,
  title: null,
  error: null,
}

// Fetch real metadata for a single IMDB id.
// Tries the LOCAL 11k-title dataset first (free, always available), then
// falls back to the paid IMDb API if configured (for richer data/posters).
const cache = new Map<string, ImdbTitleData | null>()

export function useImdbTitle(imdbId: string | null) {
  const [state, setState] = useState<State>(() => {
    if (!imdbId) return IDLE
    if (cache.has(imdbId)) {
      const t = cache.get(imdbId) ?? null
      return { loading: false, configured: true, title: t, error: null }
    }
    return IDLE
  })

  useEffect(() => {
    if (!imdbId) return
    if (cache.has(imdbId)) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ loading: true, configured: null, title: null, error: null })

    // 1) Try the local dataset (free).
    fetch(`/api/titles/${encodeURIComponent(imdbId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("local")
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!data?.title) throw new Error("not-found-local")
        const t = data.title as ImdbTitleData
        cache.set(imdbId, t)
        setState({
          loading: false,
          configured: true,
          title: t,
          error: null,
        })
      })
      .catch(async () => {
        if (cancelled) return
        // 2) Fall back to the paid IMDb API (if configured).
        try {
          const r2 = await fetch(`/api/imdb/${encodeURIComponent(imdbId)}`, {
            cache: "no-store",
          })
          const data2 = await r2.json().catch(() => ({}))
          if (cancelled) return
          if (data2?.title) {
            const t = data2.title as ImdbTitleData
            cache.set(imdbId, t)
            setState({
              loading: false,
              configured: true,
              title: t,
              error: null,
            })
          } else {
            cache.set(imdbId, null)
            setState({
              loading: false,
              configured: data2?.configured === true,
              title: null,
              error: "not found",
            })
          }
        } catch {
          if (cancelled) return
          setState({
            loading: false,
            configured: false,
            title: null,
            error: "network",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [imdbId])

  // Reset when the id clears.
  useEffect(() => {
    if (!imdbId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(IDLE)
    }
  }, [imdbId])

  return state
}
