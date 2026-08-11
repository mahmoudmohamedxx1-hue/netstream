// TMDB API client (server-side only).
// Free API: https://developer.themoviedb.org/docs
// Uses the /find endpoint to look up by IMDB ID, then fetches full details.

import "server-only"

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
export const TMDB_IMG = "https://image.tmdb.org/t/p/w500"
export const TMDB_BACKDROP = "https://image.tmdb.org/t/p/original"
export const TMDB_PROFILE = "https://image.tmdb.org/t/p/w185"

export type TmdbCastMember = {
  id: number; name: string; character: string
  profile: string | null; order: number
}

export type TmdbTitle = {
  tmdbId: number; imdbId: string; title: string
  type: "movie" | "series"; year: string; endYear: string | null
  overview: string; rating: string | null; voteCount: number | null
  poster: string | null; backdrop: string | null; logo: string | null
  runtime: number | null; genres: string[]
  cast: TmdbCastMember[]
  trailerKey: string | null; trailerSite: string | null
  similar: { imdbId: string | null; title: string; poster: string | null; year: string; type: "movie" | "series" }[]
  // TMDB TV seasons (for series)
  tmdbSeasons: { season: number; name: string; episodes: number; poster: string | null; overview: string }[] | null
}

async function tmdbFetch(path: string, lang?: string): Promise<any | null> {
  try {
    const langParam = lang ? `&language=${lang}` : ""
    const url = `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}${langParam}`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// Find a title by IMDB ID, then fetch full details (cast, trailer, similar).
// Pass lang="ar-SA" to get Arabic titles/overviews from TMDB.
export async function getTmdbTitle(imdbId: string, lang?: string): Promise<TmdbTitle | null> {
  const cleaned = imdbId.trim().toLowerCase()
  if (!cleaned) return null

  // 1) Find by IMDB ID (the /find endpoint doesn't support language, but the
  //    subsequent /details call does, so we fetch details in the desired lang)
  const findData = await tmdbFetch(`/find/${cleaned}?external_source=imdb_id`)
  if (!findData) return null

  const movie = findData.movie_results?.[0]
  const tv = findData.tv_results?.[0]
  if (!movie && !tv) return null

  const isMovie = !!movie
  const tmdbId = (movie ?? tv).id
  const type: "movie" | "series" = isMovie ? "movie" : "series"

  // 2) Fetch full details (with append_to_response for cast, videos, similar)
  //    Pass the language param so title/overview/season names come back localized.
  const details = await tmdbFetch(
    `/${isMovie ? "movie" : "tv"}/${tmdbId}?append_to_response=credits,videos,similar,external_ids`,
    lang
  )
  if (!details) return null

  // Extract cast
  const cast: TmdbCastMember[] = (details.credits?.cast ?? [])
    .slice(0, 15)
    .map((c: any) => ({
      id: c.id, name: c.name, character: c.character || "",
      profile: c.profile_path ? `${TMDB_PROFILE}${c.profile_path}` : null,
      order: c.order ?? 0,
    }))

  // Extract trailer (YouTube)
  let trailerKey: string | null = null
  let trailerSite: string | null = null
  const videos = details.videos?.results ?? []
  const trailer = videos.find((v: any) => v.type === "Trailer" && v.site === "YouTube")
    ?? videos.find((v: any) => v.type === "Teaser" && v.site === "YouTube")
    ?? videos[0]
  if (trailer) { trailerKey = trailer.key; trailerSite = trailer.site }

  // Extract similar titles
  const similarRaw = details.similar?.results ?? []
  const similar = similarRaw.slice(0, 12).map((s: any) => ({
    imdbId: null, // similar results don't include IMDB ID; we'll fetch it lazily
    title: s.title ?? s.name ?? "",
    poster: s.poster_path ? `${TMDB_IMG}${s.poster_path}` : null,
    year: (s.release_date ?? s.first_air_date ?? "").slice(0, 4),
    type,
  }))

  // Extract logo image
  let logo: string | null = null
  if (details.images?.logos?.length) {
    logo = `${TMDB_IMG.replace("w500", "w300")}${details.images.logos[0].file_path}`
  }

  return {
    tmdbId,
    imdbId: cleaned,
    title: details.title ?? details.name ?? "",
    type,
    year: (details.release_date ?? details.first_air_date ?? "").slice(0, 4),
    endYear: details.last_air_date ? details.last_air_date.slice(0, 4) : null,
    overview: details.overview ?? "",
    rating: details.vote_average ? String(details.vote_average) : null,
    voteCount: details.vote_count ?? null,
    poster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
    backdrop: details.backdrop_path ? `${TMDB_BACKDROP}${details.backdrop_path}` : null,
    logo,
    runtime: details.runtime ?? details.episode_run_time?.[0] ?? null,
    genres: (details.genres ?? []).map((g: any) => g.name).filter(Boolean),
    cast,
    trailerKey,
    trailerSite,
    similar,
    // TMDB TV seasons (skip season 0 = specials)
    tmdbSeasons: type === "series"
      ? (details.seasons ?? [])
          .filter((s: any) => s.season_number > 0)
          .map((s: any) => ({
            season: s.season_number,
            name: s.name ?? `Season ${s.season_number}`,
            episodes: s.episode_count ?? 0,
            poster: s.poster_path ? `${TMDB_IMG}${s.poster_path}` : null,
            overview: s.overview ?? "",
          }))
      : null,
  }
}
