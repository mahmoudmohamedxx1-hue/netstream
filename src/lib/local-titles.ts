// Local title database — provides search/browse/lookup over the curated catalog.
// Used by /api/titles/search, /api/titles/browse, and /api/titles/[imdbId].

import { CATALOG, type Title } from "@/lib/movies-data"

export type LocalTitle = {
  imdbId: string
  title: string
  type: "movie" | "series"
  year: string
  genres: string[]
  poster: string | null
  overview: string | null
  rating: string | null
}

function toLocalTitle(t: Title): LocalTitle {
  return {
    imdbId: t.imdbId,
    title: t.title,
    type: t.type,
    year: t.year,
    genres: t.genre ?? [],
    poster: t.poster ? t.poster : null,
    overview: t.overview ?? null,
    rating: t.rating ?? null,
  }
}

export async function searchLocalTitles(q: string, limit: number = 24): Promise<LocalTitle[]> {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const results = CATALOG.filter((t) => {
    const titleMatch = t.title.toLowerCase().includes(query)
    const genreMatch = (t.genre ?? []).some((g) => g.toLowerCase().includes(query))
    return titleMatch || genreMatch
  })
    .slice(0, limit)
    .map(toLocalTitle)
  return results
}

export async function browseLocalTitles(opts: {
  type?: "movie" | "series"
  genre?: string
  limit: number
  offset: number
}): Promise<LocalTitle[]> {
  let filtered = CATALOG
  if (opts.type) {
    filtered = filtered.filter((t) => t.type === opts.type)
  }
  if (opts.genre) {
    const g = opts.genre.toLowerCase()
    filtered = filtered.filter((t) =>
      (t.genre ?? []).some((genre) => genre.toLowerCase() === g)
    )
  }
  const sliced = filtered.slice(opts.offset, opts.offset + opts.limit)
  return sliced.map(toLocalTitle)
}

export async function getLocalTitle(imdbId: string): Promise<LocalTitle | null> {
  const cleaned = imdbId.trim().toLowerCase()
  const found = CATALOG.find((t) => t.imdbId.toLowerCase() === cleaned)
  return found ? toLocalTitle(found) : null
}
