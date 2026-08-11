"use client"

import { useEffect, useState } from "react"

export type TmdbCastMember = {
  id: number; name: string; character: string
  profile: string | null; order: number
}

export type TmdbTitleData = {
  tmdbId: number; imdbId: string; title: string
  type: "movie" | "series"; year: string; endYear: string | null
  overview: string; rating: string | null; voteCount: number | null
  poster: string | null; backdrop: string | null; logo: string | null
  runtime: number | null; genres: string[]
  cast: TmdbCastMember[]
  trailerKey: string | null; trailerSite: string | null
  similar: { imdbId: string | null; title: string; poster: string | null; year: string; type: "movie" | "series" }[]
  tmdbSeasons: { season: number; name: string; episodes: number; poster: string | null; overview: string }[] | null
}

type State = {
  loading: boolean
  data: TmdbTitleData | null
}

const cache = new Map<string, TmdbTitleData | null>()

// Build a cache key that includes the language so switching language re-fetches.
function cacheKey(imdbId: string, lang: string) {
  return `${imdbId}:${lang}`
}

export function useTmdbTitle(imdbId: string | null, lang: string = "en") {
  const [state, setState] = useState<State>(() => {
    if (!imdbId) return { loading: false, data: null }
    const key = cacheKey(imdbId, lang)
    if (cache.has(key)) return { loading: false, data: cache.get(key) ?? null }
    return { loading: false, data: null }
  })

  useEffect(() => {
    if (!imdbId) return
    const key = cacheKey(imdbId, lang)
    if (cache.has(key)) {
      // Already cached for this language — just set it (no re-fetch)
      const cached = cache.get(key) ?? null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ loading: false, data: cached })
      return
    }
    let cancelled = false
    setState({ loading: true, data: null })
    const langParam = lang === "ar" ? "?lang=ar" : ""
    fetch(`/api/tmdb/${encodeURIComponent(imdbId)}${langParam}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        const title = (data.title as TmdbTitleData) ?? null
        cache.set(key, title)
        setState({ loading: false, data: title })
      })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null }) })
    return () => { cancelled = true }
  }, [imdbId, lang])

  // Reset when id clears
  useEffect(() => {
    if (!imdbId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ loading: false, data: null })
    }
  }, [imdbId])

  return state
}
