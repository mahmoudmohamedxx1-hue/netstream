// Official IMDb API client (server-side only).
//
// Uses AWS Data Exchange's SendApiAssetCommand, which handles the AWS Sigv4
// signing automatically using AWS credentials from the environment.
//
// Required environment variables (see .env):
//   AWS_ACCESS_KEY_ID            – your AWS access key
//   AWS_SECRET_ACCESS_KEY        – your AWS secret key
//   AWS_REGION                   – e.g. "us-east-1"
//   IMDB_DATA_SET_ID             – from your IMDb subscription
//   IMDB_REVISION_ID             – from your IMDb subscription
//   IMDB_ASSET_ID                – from your IMDb subscription
//   IMDB_API_KEY                 – your IMDb API key (x-api-key)
//
// If any of these are missing, the helpers return null and callers fall back
// to the curated catalog / generic metadata, so the site keeps working.

import "server-only"
import {
  DataExchangeClient,
  SendApiAssetCommand,
} from "@aws-sdk/client-dataexchange"

export type ImdbTitle = {
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

function credsConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.IMDB_DATA_SET_ID &&
      process.env.IMDB_REVISION_ID &&
      process.env.IMDB_ASSET_ID &&
      process.env.IMDB_API_KEY
  )
}

function client(): DataExchangeClient {
  return new DataExchangeClient({
    region: process.env.AWS_REGION || "us-east-1",
  })
}

// Send a GraphQL query to the IMDb API via AWS Data Exchange.
async function sendQuery<T>(query: string): Promise<T | null> {
  if (!credsConfigured()) return null
  try {
    const cmd = new SendApiAssetCommand({
      AssetId: process.env.IMDB_ASSET_ID!,
      DataSetId: process.env.IMDB_DATA_SET_ID!,
      RevisionId: process.env.IMDB_REVISION_ID!,
      Method: "POST",
      Path: "/v1",
      Body: JSON.stringify({ query }),
      RequestHeaders: {
        "x-api-key": process.env.IMDB_API_KEY!,
        "Content-Type": "application/json",
      },
    })
    const res = await client().send(cmd)
    // res.Body can be a string, Buffer, or undefined depending on the SDK version.
    // Cast to `any` to avoid the `never` type inference from the union.
    const body = typeof res.Body === "string" ? res.Body : (res.Body as any)?.toString()
    if (!body) return null
    const parsed = JSON.parse(body)
    if (parsed.errors) {
      console.error("[imdb] GraphQL errors:", parsed.errors)
      return null
    }
    return parsed.data as T
  } catch (e) {
    console.error("[imdb] request failed:", e)
    return null
  }
}

// Determine the title type from IMDb's titleType field.
function normalizeType(
  titleType: string | null | undefined
): "movie" | "series" {
  if (!titleType) return "movie"
  const t = titleType.toLowerCase()
  if (
    t.includes("tv") ||
    t.includes("series") ||
    t.includes("mini") ||
    t.includes("episode")
  ) {
    return "series"
  }
  return "movie"
}

// Fetch full metadata for a single title by IMDB id.
export async function fetchImdbTitle(
  imdbId: string
): Promise<ImdbTitle | null> {
  const query = `{
    title(id: "${imdbId}") {
      id
      titleText { text }
      titleType { id text }
      releaseYear { year endYear }
      ratingsSummary { aggregateRating voteCount }
      primaryImage { url }
      plot { plotText { plainText } }
      genres { genres { text } }
      runtime { seconds }
    }
  }`
  type Res = {
    title: {
      id: string
      titleText: { text: string }
      titleType?: { id?: string; text?: string }
      releaseYear?: { year?: number; endYear?: number | null }
      ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null }
      primaryImage?: { url?: string } | null
      plot?: { plotText?: { plainText?: string } | null } | null
      genres?: { genres?: { text: string }[] } | null
      runtime?: { seconds?: number | null } | null
    } | null
  }
  const data = await sendQuery<Res>(query)
  const t = data?.title
  if (!t) return null

  const yearStart = t.releaseYear?.year
  const yearEnd = t.releaseYear?.endYear
  const year = yearStart
    ? yearEnd && yearEnd !== yearStart
      ? `${yearStart}–${yearEnd}`
      : String(yearStart)
    : ""

  const poster = t.primaryImage?.url ?? null
  // IMDb image URLs are often resizable — request a reasonable width.
  const sizedPoster = poster
    ? poster.replace(/\.(jpg|png)\//, "._V1_UX500_.")
    : null

  return {
    imdbId: t.id,
    title: t.titleText?.text ?? imdbId,
    type: normalizeType(t.titleType?.text),
    year,
    rating:
      t.ratingsSummary?.aggregateRating != null
        ? String(t.ratingsSummary.aggregateRating)
        : null,
    voteCount: t.ratingsSummary?.voteCount ?? null,
    poster: sizedPoster,
    overview: t.plot?.plotText?.plainText ?? null,
    genres: (t.genres?.genres ?? []).map((g) => g.text).filter(Boolean),
    runtimeMinutes: t.runtime?.seconds
      ? Math.round(t.runtime.seconds / 60)
      : null,
  }
}

// Search the IMDb "advanced title search" / title search.
// Returns up to `first` results for a free-text query.
export async function searchImdbTitles(
  queryText: string,
  first = 20
): Promise<ImdbTitle[]> {
  // Escape quotes in the query for GraphQL string interpolation.
  const safe = queryText.replace(/"/g, '\\"')
  const query = `{
    advancedTitleSearch(
      first: ${first}
      sort: { sortBy: POPULARITY, sortOrder: DESC }
      titleTypeFilter: { exclude: [] }
      resultsType: INCLUDE_TV_EPISODES
      searchTerm: "${safe}"
    ) {
      edges {
        node {
          title {
            id
            titleText { text }
            titleType { text }
            releaseYear { year endYear }
            ratingsSummary { aggregateRating voteCount }
            primaryImage { url }
          }
        }
      }
    }
  }`
  type Res = {
    advancedTitleSearch: {
      edges: Array<{
        node: {
          title: {
            id: string
            titleText: { text: string }
            titleType?: { text?: string }
            releaseYear?: { year?: number; endYear?: number | null }
            ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null }
            primaryImage?: { url?: string } | null
          } | null
        }
      }>
    } | null
  }
  const data = await sendQuery<Res>(query)
  const edges = data?.advancedTitleSearch?.edges ?? []
  const out: ImdbTitle[] = []
  for (const e of edges) {
    const t = e.node?.title
    if (!t) continue
    const yearStart = t.releaseYear?.year
    const yearEnd = t.releaseYear?.endYear
    const year = yearStart
      ? yearEnd && yearEnd !== yearStart
        ? `${yearStart}–${yearEnd}`
        : String(yearStart)
      : ""
    const poster = t.primaryImage?.url ?? null
    const sizedPoster = poster
      ? poster.replace(/\.(jpg|png)\//, "._V1_UX500_.")
      : null
    out.push({
      imdbId: t.id,
      title: t.titleText?.text ?? t.id,
      type: normalizeType(t.titleType?.text),
      year,
      rating:
        t.ratingsSummary?.aggregateRating != null
          ? String(t.ratingsSummary.aggregateRating)
          : null,
      voteCount: t.ratingsSummary?.voteCount ?? null,
      poster: sizedPoster,
      overview: null,
      genres: [],
      runtimeMinutes: null,
    })
  }
  return out
}

// Discover top-rated titles of a given type. Useful for building the
// "best 10000" experience on demand.
export async function discoverTopTitles(opts: {
  type?: "movie" | "series"
  first?: number
  minRating?: number
  genre?: string
}): Promise<ImdbTitle[]> {
  const first = Math.min(opts.first ?? 50, 100)
  const typeFilter =
    opts.type === "series"
      ? `titleTypeFilter: { include: ["tvSeries", "tvMiniSeries"], exclude: [] }`
      : opts.type === "movie"
        ? `titleTypeFilter: { include: ["movie"], exclude: [] }`
        : `titleTypeFilter: { exclude: [] }`
  const ratingFilter = opts.minRating
    ? `userRatingsFilter: { aggregateRatingRange: { min: ${opts.minRating} } }`
    : ""
  const genreFilter = opts.genre
    ? `genreFilter: { include: ["${opts.genre}"], exclude: [] }`
    : ""
  const filters = [typeFilter, ratingFilter, genreFilter]
    .filter(Boolean)
    .join(", ")
  const query = `{
    advancedTitleSearch(
      first: ${first}
      sort: { sortBy: USER_RATING_COUNT, sortOrder: DESC }
      ${filters}
    ) {
      edges {
        node {
          title {
            id
            titleText { text }
            titleType { text }
            releaseYear { year endYear }
            ratingsSummary { aggregateRating voteCount }
            primaryImage { url }
          }
        }
      }
    }
  }`
  type Res = {
    advancedTitleSearch: {
      edges: Array<{
        node: {
          title: {
            id: string
            titleText: { text: string }
            titleType?: { text?: string }
            releaseYear?: { year?: number; endYear?: number | null }
            ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null }
            primaryImage?: { url?: string } | null
          } | null
        }
      }>
    } | null
  }
  const data = await sendQuery<Res>(query)
  const edges = data?.advancedTitleSearch?.edges ?? []
  const out: ImdbTitle[] = []
  for (const e of edges) {
    const t = e.node?.title
    if (!t) continue
    const yearStart = t.releaseYear?.year
    const yearEnd = t.releaseYear?.endYear
    const year = yearStart
      ? yearEnd && yearEnd !== yearStart
        ? `${yearStart}–${yearEnd}`
        : String(yearStart)
      : ""
    const poster = t.primaryImage?.url ?? null
    const sizedPoster = poster
      ? poster.replace(/\.(jpg|png)\//, "._V1_UX500_.")
      : null
    out.push({
      imdbId: t.id,
      title: t.titleText?.text ?? t.id,
      type: normalizeType(t.titleType?.text),
      year,
      rating:
        t.ratingsSummary?.aggregateRating != null
          ? String(t.ratingsSummary.aggregateRating)
          : null,
      voteCount: t.ratingsSummary?.voteCount ?? null,
      poster: sizedPoster,
      overview: null,
      genres: [],
      runtimeMinutes: null,
    })
  }
  return out
}

export const imdbConfigured = credsConfigured
