// Shared video extraction logic — used by API routes so they can call each
// other's logic directly (without HTTP fetch to localhost:3000, which fails
// in production where the server runs on a different port/domain).
//
// This module is imported by:
//   /api/2embed-servers/route.ts
//   /api/extract-download/route.ts

import { unpack } from "unpacker"
import zlib from "node:zlib"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type ServerMirror = {
  name: string
  host: string
  url: string
}

// Extract the full eval(function(p,a,c,k,e,d)...) block by matching parentheses.
export function extractPackedJs(html: string): string | null {
  const start = html.indexOf("eval(function(p,a,c,k,e,d)")
  if (start === -1) return null
  let depth = 0
  for (let i = start + 4; i < html.length; i++) {
    if (html[i] === "(") depth++
    if (html[i] === ")") {
      depth--
      if (depth === 0) return html.substring(start, i + 1)
    }
  }
  return null
}

// ─── 2Embed Server Mirrors ───────────────────────────────────────────────────
// Fetches 2Embed's embed page, parses the server dropdown, and resolves each
// server mirror to its actual video host URL.
export async function get2EmbedServers(
  imdbId: string,
  type: "movie" | "series",
  season: string | null,
  episode: string | null
): Promise<{ servers: ServerMirror[]; directServers: ServerMirror[] }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }

  try {
    const embedUrl =
      type === "series"
        ? `https://www.2embed.cc/embedtv/${imdbId}&s=${season || "1"}&e=${episode || "1"}`
        : `https://www.2embed.cc/embed/${imdbId}`

    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: undefined,
    })
    if (!res.ok) return { servers: [], directServers: [] }
    const html = await res.text()

    // Parse server dropdown: <a onclick="go('url')"> &nbsp;ServerName</a>
    const servers: ServerMirror[] = []
    const serverPattern = /onclick=["']go\(["']([^"']+)["']\)["'][^>]*>(?:<i[^>]*><\/i>)?\s*&nbsp;([A-Za-z0-9]+)/gi
    let match
    while ((match = serverPattern.exec(html)) !== null) {
      servers.push({
        name: match[2],
        host: "2embed",
        url: match[1],
      })
    }

    // Resolve each server's JS redirect to find the actual video host
    const resolvedServers = await Promise.all(
      servers.map(async (srv) => {
        try {
          const srvRes = await fetch(srv.url, {
            headers: { ...headers, Referer: embedUrl },
            redirect: "follow",
            signal: undefined,
          })
          if (!srvRes.ok) return { ...srv, host: "unknown" }
          const srvHtml = await srvRes.text()

          // Find the JS file (e.g., ./xps.js)
          const jsMatch = srvHtml.match(/src=["']\.\/([a-z\-]+\.js)["']/i)
          if (!jsMatch) return { ...srv, host: "unknown" }

          const jsUrl = new URL(`./${jsMatch[1]}`, srvRes.url).href
          const jsRes = await fetch(jsUrl, {
            headers: { ...headers, Referer: srvRes.url },
            redirect: "follow",
            signal: undefined,
          })
          if (!jsRes.ok) return { ...srv, host: "unknown" }
          const jsText = await jsRes.text()

          // Extract video host URL pattern from JS
          const hostMatch = jsText.match(/attr\(['"]src['"],\s*["'](https:\/\/[^"']+)/i)
          if (!hostMatch) return { ...srv, host: "unknown" }

          const videoHostBase = hostMatch[1]
          const iframeSrcMatch = srvHtml.match(/id=["']framesrc["'][^>]*src=["']([^"']+)["']/i)
          const iframeSrc = iframeSrcMatch ? iframeSrcMatch[1] : ""
          const videoUrl = videoHostBase + iframeSrc

          let hostName = "unknown"
          try {
            hostName = new URL(videoHostBase).hostname.replace(/^www\./, "")
          } catch {}

          return { ...srv, host: hostName, url: videoUrl }
        } catch {
          return { ...srv, host: "unknown" }
        }
      })
    )

    // Build direct server URLs for the live video hosts
    // (vidsrc.hair and cineby.hair are DNS-dead — removed 2026-10;
    // vidcore.net moved to vidcore.io)
    const directServers: ServerMirror[] = [
      {
        name: "VidCore",
        host: "vidcore.io",
        url:
          type === "series"
            ? `https://vidcore.io/tv/${imdbId}/${season || "1"}/${episode || "1"}`
            : `https://vidcore.io/movie/${imdbId}`,
      },
    ]

    return {
      servers: resolvedServers.filter((s) => s.host !== "unknown"),
      directServers,
    }
  } catch {
    return { servers: [], directServers: [] }
  }
}

// ─── Arabic Stream Search ────────────────────────────────────────────────────
// Searches an Arabic site (EgyDead, EgyBest, etc.) by title and returns
// embeddable video-host URLs (MixDrop, VOE, etc.).
// Replicates the EXACT logic from the ImZaw cloudstream-extensions-arabic repo
// and the /api/arabic-stream route.

type SiteConfig = {
  id: string
  name: string
  searchUrl: (title: string) => string
  linkPattern: RegExp
  postView: boolean
}

const ARABIC_SITE_CONFIGS: Record<string, SiteConfig> = {
  egydead: {
    id: "egydead",
    name: "EgyDead",
    searchUrl: (title) => `https://tv.egydead.live/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/[^"]+)"/gi,
    postView: true,
  },
  egybest: {
    id: "egybest",
    name: "EgyBest",
    searchUrl: (title) => `https://tv.egydead.live/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/[^"]+)"/gi,
    postView: true,
  },
  shahid4u: {
    id: "shahid4u",
    name: "Shahid4u",
    searchUrl: (title) => `https://shed4u.cam/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/shed4u\.cam\/[^"]+)"/gi,
    postView: false,
  },
  faselhd: {
    id: "faselhd",
    name: "FaselHD",
    searchUrl: (title) => `https://faselhd.club/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/faselhd\.club\/[^"]+)"/gi,
    postView: false,
  },
}

// Extract a human-readable host name from a URL
function getHost(url: string): string {
  try {
    const u = new URL(url)
    const hostMap: Record<string, string> = {
      "mixdrop.top": "MixDrop",
      "mixdrop.ag": "MixDrop",
      "mixdrop.bz": "MixDrop",
      "voe.sx": "VOE",
      "stmruby.com": "StreamRuby",
      "streamruby.com": "StreamRuby",
      "hgcloud.to": "HGCloud",
      "playmogo.com": "PlayMogo",
      "vidaraa.cc": "Vidaraa",
      "morencius.com": "Morencius",
      "bysekoze.com": "Bysekoze",
      "dood.so": "DoodStream",
      "doodstream.com": "DoodStream",
      "streamtape.com": "StreamTape",
      "filemoon.sx": "FileMoon",
      "streamwish.to": "StreamWish",
      "vidplay.site": "VidPlay",
      // MyCima / ArabSeed video hosts (live-tested 2026-10)
      "fastvip.space": "FastVIP",
      "hglink.to": "HGLink",
      "huntrexus.com": "StreamHG",
      "premilkyway.com": "StreamHG",
      "adventuretourguide.space": "StreamHG",
    }
    const hostname = u.hostname.replace(/^www\./, "")
    return hostMap[hostname] ?? hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1)
  } catch {
    return "Unknown"
  }
}

export async function searchArabicSite(
  siteId: string,
  title: string,
  type: "movie" | "series"
): Promise<{ sources: { url: string; host: string }[]; movieUrl: string | null }> {
  // "mycima" has its own dedicated flow (see searchMycima below) — routed
  // through here so the download pipeline can use one entry point.
  if (siteId === "mycima") {
    const r = await searchMycima(title, type)
    return {
      sources: r.sources.map((s) => ({ url: s.url, host: s.host })),
      movieUrl: r.pageUrl,
    }
  }
  const site = ARABIC_SITE_CONFIGS[siteId]
  if (!site) return { sources: [], movieUrl: null }

  const headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  }

  try {
    // Step 1: Search for the movie page URL
    const searchUrl = site.searchUrl(title)
    const searchRes = await fetch(searchUrl, {
      headers,
      redirect: "follow",
      signal: undefined,
    })
    if (!searchRes.ok) return { sources: [], movieUrl: null }
    const searchHtml = await searchRes.text()

    // Extract movie page links — filter out non-content URLs
    const matches: string[] = []
    let match: RegExpExecArray | null
    const pattern = new RegExp(site.linkPattern.source, "gi")
    while ((match = pattern.exec(searchHtml)) !== null) {
      const href = match[1]
      if (/wp-content|wp-json|wp-includes|xmlrpc|feed|css\/|js\/|font|\.png|\.jpg|\.ico|\/page\/|\/category\/|\/tag\/|\/author\//.test(href)) continue
      if (/\/assembly\/|\/series-category\/|\/type\//.test(href)) continue
      if (type === "movie" && /\/episode\//.test(href)) continue
      matches.push(href)
    }
    const unique = [...new Set(matches)]

    // Pick the best match
    const titleLower = title.toLowerCase().trim()
    const words = titleLower.split(/\s+/).filter(w => w.length > 2)
    const twoWords = words.slice(0, 2).join("-")
    const firstWord = words[0]
    const movieUrl =
      unique.find((u) => u.toLowerCase().includes(titleLower.replace(/\s+/g, "-"))) ??
      unique.find((u) => u.toLowerCase().includes(twoWords)) ??
      (firstWord ? unique.find((u) => u.toLowerCase().includes(firstWord)) : undefined) ??
      unique[0]

    if (!movieUrl) return { sources: [], movieUrl: null }

    // Step 2: Fetch the movie page (POST View=1 for EgyDead-style sites)
    let movieHtml: string
    if (site.postView) {
      const watchRes = await fetch(movieUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: "View=1",
        redirect: "follow",
        signal: undefined,
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    } else {
      const watchRes = await fetch(movieUrl, {
        headers,
        redirect: "follow",
        signal: undefined,
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    }

    // Step 3: Extract embeddable iframe URLs from `data-link` attributes
    const sources: { url: string; host: string }[] = []
    const seen = new Set<string>()

    // Extract data-link attributes (the iframe embed URLs)
    const dataLinkPattern = /data-link="([^"]+)"/gi
    let dlMatch: RegExpExecArray | null
    while ((dlMatch = dataLinkPattern.exec(movieHtml)) !== null) {
      const embedUrl = dlMatch[1]
      if (!seen.has(embedUrl) && embedUrl.startsWith("http")) {
        seen.add(embedUrl)
        sources.push({ url: embedUrl, host: getHost(embedUrl) })
      }
    }

    // Also extract from .donwload-servers-list > li > a href (download links)
    const downloadPattern = /<li[^>]*class="[^"]*donwload[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"/gi
    let dlMatch2: RegExpExecArray | null
    while ((dlMatch2 = downloadPattern.exec(movieHtml)) !== null) {
      const dlUrl = dlMatch2[1]
      let embedUrl = dlUrl
      const m = dlUrl.match(/\/([a-z0-9]+)(\.html)?$/i)
      if (m && dlUrl.includes("streamruby.com")) {
        embedUrl = `https://streamruby.com/e/${m[1]}`
      }
      if (!seen.has(embedUrl) && embedUrl.startsWith("http")) {
        seen.add(embedUrl)
        sources.push({ url: embedUrl, host: getHost(embedUrl) })
      }
    }

    return { sources, movieUrl }
  } catch {
    return { sources: [], movieUrl: null }
  }
}

// ─── MyCima / ArabSeed (alking.mycima.cv) ────────────────────────────────────
// Live-tested end-to-end 2026-10. Flow:
//   1. GET /?s={title}            → WordPress search results
//   2. Pick a watch page          → مشاهدة-فيلم-… (movie) / …-حلقة-N (episode)
//      • Series: when the exact episode isn't in the search results (the search
//        indexes recent posts only), fetch the series hub page linked from any
//        episode page and pick حلقة-N from the full episode list.
//   3. GET the watch page         → two kinds of playable sources:
//      a) mycimafsd={base64} token     → direct video-host embed (fastvip.space,
//         hglink.to, …) — movies; MUST be iframed DIRECTLY in the user's
//         browser (stream tokens are minted for the requesting network)
//      b) ?secure_stream={zlib-b64}   → decodes to a DIRECT MP4 on
//         link.mycima.cv (video/mp4 + byte ranges + ACAO:*) — the reliable
//         path for SERIES EPISODES, plays natively in a <video> element
//      The ?my_player={id} links (MyCima's own mycima-my.com player page) are
//      SKIPPED: iframing them shows the MyCima WEBSITE instead of the title
//      (user-reported bug) and they are Cloudflare-gated. (2026-10-08)
// Arabic text normalization + multiple query variants fix most "title not
// found" cases (ال-prefix, diacritics, hamza forms, ة/ه, ى/ي).

const MYCIMA_BASE = "https://alking.mycima.cv"
const MYCIMA_REFERER = "https://alking.mycima.cv/"

// ── Mycina page fetching ──────────────────────────────────────────────
// Resilient 3-layer fetch: direct first (fast, normal path). The "degraded
// page" scare that once motivated a sidecar-first order was actually a HAMZA
// SPELLING typo in tests: mycima's WordPress search matches EXACTLY, so
// searching الكبير اوي (plain alef) genuinely returns zero results while
// الكبير أوي (hamza) returns everything (verified live 2026-10-09 — same
// client, same instant, different letter). The sidecar
// (scripts/mycina-sidecar.mjs, localhost:3999) stays as an exotic-degradation
// fallback, then curl (different TLS fingerprint).
const SIDECAR_BASE = "http://127.0.0.1:3999"

/** Fetch a mycima page HTML — direct fetch, then sidecar, then curl. */
async function fetchMycimaPage(url: string, referer: string = MYCIMA_REFERER): Promise<string | null> {
  // 1) direct fetch (normal path — fastest)
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.9,en;q=0.8", Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (r.ok) {
      const body = await r.text()
      if (body.length > 500) return body
    }
  } catch {
    /* fall through */
  }
  // 2) sidecar (different process — exotic-degradation fallback; short
  //    timeout so a hung sidecar never stalls the resolver)
  try {
    const r = await fetch(
      `${SIDECAR_BASE}/fetch?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    )
    if (r.ok) {
      const d = (await r.json()) as { ok?: boolean; status?: number; body?: string }
      if (d.ok && d.status === 200 && typeof d.body === "string" && d.body.length > 500) {
        return d.body
      }
    }
  } catch {
    /* sidecar down — fall through */
  }
  // 3) curl (different TLS fingerprint — sometimes passes when node doesn't)
  return curlFetchHtml(url, referer)
}


// ── Direct-content verification (content-disposition) ────────────────
// link.mycima.cv responses carry `content-disposition: attachment;
// filename*=UTF-8''<REAL CONTENT NAME>.mp4` — the CDN literally names the
// file's true content. This is the ONLY reliable defense against mycina's
// crossed download links (verified live 2026-10-09: the عمر وسلمى trilogy
// pages' ONLY mp4 each resolved to «مسلسل سلمى الحلقة 9/12/20» — a
// completely different, wrong title; user-reported as "opens a Turkish
// series"). Every direct mp4 must pass this gate before reaching the player.

export type ContentVerify = {
  title: string
  type: "movie" | "series"
  season?: number | null
  episode?: number | null
}

/** Read the content-disposition filename of a media URL (HEAD, then a tiny
 * ranged GET — some CDNs omit the header on HEAD). */
async function mediaDispositionFilename(url: string): Promise<string | null> {
  try {
    const h = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA, Referer: MYCIMA_REFERER },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    const cd = h.headers.get("content-disposition")
    if (cd) return cd
  } catch {
    /* fall through to ranged GET */
  }
  try {
    const r = await fetch(url, {
      headers: { Range: "bytes=0-64", "User-Agent": UA, Referer: MYCIMA_REFERER },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    return r.headers.get("content-disposition")
  } catch {
    return null
  }
}

function decodeDispositionName(cd: string): string | null {
  const raw =
    cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    cd.match(/filename="?([^";]+)"?/i)?.[1] ??
    ""
  if (!raw.trim()) return null
  try {
    return decodeURIComponent(raw.trim())
  } catch {
    return raw.trim()
  }
}

/** Verify a direct media URL's real content against the requested title.
 *  "match"    — filename names the requested title (movie: all words + sequel;
 *              series: all words + episode number)
 *  "mismatch" — filename names DIFFERENT content (wrong title / movie-vs-
 *              series swap / wrong episode). NEVER play these.
 *  "unknown"  — no disposition filename (Latin-only names for Arabic titles,
 *              header absent) — can't judge; keep the source.
 */
export async function verifyDirectContent(
  url: string,
  want: ContentVerify
): Promise<"match" | "mismatch" | "unknown"> {
  const cd = await mediaDispositionFilename(url)
  if (!cd) return "unknown"
  const name = decodeDispositionName(cd)
  if (!name) return "unknown"
  // Latin-only filenames can't be matched against Arabic titles — don't judge.
  if (!/[\u0600-\u06FF]/.test(name) && /[\u0600-\u06FF]/.test(want.title)) return "unknown"

  const fn = normalizeArabic(name)
  const words = titleWords(want.title)
  const stripAl = (w: string) => w.replace(/^ال/, "")
  const hasSeriesMarkers = /مسلسل|حلقه/.test(fn)

  if (want.type === "movie") {
    // A series/episode file is never the requested movie.
    if (hasSeriesMarkers) return "mismatch"
    if (words.length === 0) return "unknown"
    const hits = words.filter((w) => fn.includes(w) || fn.includes(stripAl(w))).length
    if (hits < words.length) return "mismatch"
    // Sequel gate: عمر وسلمى 2 must not resolve to part 1/3's file, and part 1
    // must not resolve to a sequel file.
    const wantSeq = sequelNumberOf(want.title)
    const fnSeq = sequelNumberOf(name)
    if (wantSeq !== null && fnSeq !== null && wantSeq !== fnSeq) return "mismatch"
    if (wantSeq === null && fnSeq !== null) return "mismatch"
    return "match"
  }

  // Series request
  if (/فيلم/.test(fn) && !hasSeriesMarkers) return "mismatch" // a movie file for a series request
  if (words.length > 0) {
    const hits = words.filter((w) => fn.includes(w) || fn.includes(stripAl(w))).length
    if (hits < words.length) return "mismatch"
  }
  // Episode gate: the file's حلقة-N must equal the requested episode.
  if (want.episode != null && want.episode > 0) {
    const ep = fn.match(/حلقه[^0-9]*(\d{1,3})/)?.[1]
    if (ep && Number(ep) !== want.episode) return "mismatch"
  }
  return "match"
}

export type MycimaSource = {
  url: string      // embed URL (kind=embed) or direct MP4 URL (kind=mp4)
  host: string     // human host name (FastVIP, HGLink, MyCima MP4…)
  referer: string  // referer that unlocks the host (= MyCima)
  /** How the player should render this source. */
  kind: "embed" | "mp4"
  /** Quality label when known (e.g. "720p"). */
  quality?: string
}

/** Normalize Arabic text for slug matching (diacritics, tatweel, letter forms). */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    // Arabic-Indic digits → ASCII (slugs occasionally use ٠١٢…)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\u200c-\u200f]/g, "")
    .replace(/[:：'"«»،؟?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// ─── Title verification gate (2026-10-09) ────────────────────────────────────
// User-reported bugs: "Omar & Salma 2 opens part 1" and "any series opens a
// Turkish series". Root cause: the resolver picked the FIRST fuzzy search hit
// (`anyMovie[0]`) / the first حلقة-N link on a series-hub page — mycima hub
// pages mix in OTHER (often Turkish-dubbed) series' episodes. Every candidate
// page URL must now pass this verification gate before it is used.

/** Arabic stopwords never required when matching a slug. */
const AR_STOPWORDS = new Set([
  "في", "من", "على", "الى", "عن", "مع", "او", "و", "ثم", "يا", "الا", "هو", "هي", "مسلسل", "فيلم", "مشاهدة", "الموسم", "موسم", "الجزء", "جزء", "انمي",
])

/** Significant normalized words of a title (ال-prefix kept; substring checks
 *  below also test the stripped form). */
function titleWords(title: string): string[] {
  return normalizeArabic(title)
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && !AR_STOPWORDS.has(w) && !/^\d+$/.test(w))
}

/** Arabic ordinal names → number (الجزء الثاني → 2). */
const AR_ORDINAL_WORDS: [RegExp, number][] = [
  [/الاول|الاولي/, 1], [/الثاني|التاني/, 2], [/الثالث|التالت/, 3], [/الرابع/, 4],
  [/الخامس/, 5], [/السادس/, 6], [/السابع/, 7], [/الثامن/, 8], [/التاسع/, 9], [/العاشر/, 10],
]

/** Sequel/sequence number of a title: trailing standalone digit (not a year)
 *  or Arabic ordinal word. "عمر وسلمى 2" → 2; "الكبير أوي" → null. */
function sequelNumberOf(text: string): number | null {
  const n = normalizeArabic(text)
  // standalone numbers 1-99 (sequels), not years
  const digits = [...n.matchAll(/(?:^|\s|-)(\d{1,4})(?:\s|-|$)/g)].map((m) => Number(m[1]))
  const nonYear = digits.filter((d) => d >= 1 && d <= 99)
  if (nonYear.length > 0) return nonYear[nonYear.length - 1]
  for (const [re, v] of AR_ORDINAL_WORDS) {
    if (re.test(n)) return v
  }
  return null
}

function isYear(n: number): boolean {
  return n >= 1900 && n <= 2035
}

/** The pure slug segment of a mycima page URL — strips the post-date path
 *  (…/2026/10/05/مشاهدة-فيلم-X/) whose date numbers would otherwise pollute
 *  the sequel-number gate with bogus 10 / 5 values. */
function urlSlugSegment(pageUrl: string): string {
  try {
    const u = new URL(pageUrl)
    const segs = u.pathname.split("/").filter(Boolean)
    return segs[segs.length - 1] ?? u.pathname
  } catch {
    return pageUrl
  }
}

/**
 * Score how well a mycima page URL matches the requested title.
 *   -1  = reject (a different title — NEVER play this)
 *   50  = acceptable (all significant title words present)
 *   80  = strong (words + correct sequel number)
 * `opts.season` / `opts.episode`: for series episode pages the slug LEGITIMATELY
 * contains the season/episode numbers (الكبير-اوي-8-حلقة-29) — those are
 * structural, not sequel markers, and are excluded from the number gate.
 */
export function matchTitleScore(
  pageUrl: string,
  title: string,
  opts?: { season?: number | null; episode?: number | null }
): number {
  const slug = normalizeArabic(decodeURIComponent(urlSlugSegment(pageUrl)))
  const words = titleWords(title)
  if (words.length === 0) return -1

  // 1) Word gate: EVERY significant word must appear in the slug (with or
  //    without the leading definite article — slug variants differ).
  const stripAl = (w: string) => w.replace(/^ال/, "")
  for (const w of words) {
    if (!slug.includes(w) && !slug.includes(stripAl(w))) return -1
  }
  let score = 50

  // 2) Sequel-number gate: "عمر وسلمى 2" must NOT resolve to part 1/3, and
  //    "الحريفة" (no sequel) must NOT resolve to "الحريفة 2". Standalone
  //    non-year numbers in the slug, excluding the requested season/episode.
  const structural = new Set(
    [opts?.season ?? null, opts?.episode ?? null].filter(
      (n): n is number => n !== null && n > 0
    )
  )
  const slugNums = [...slug.matchAll(/(?:^|[-/])(\d{1,4})(?:[-/]|$)/g)]
    .map((m) => Number(m[1]))
    .filter((d) => !isYear(d) && !structural.has(d))
  const wantSeq = sequelNumberOf(title)
  if (wantSeq !== null) {
    const ordFor = AR_ORDINAL_WORDS.find(([re]) => re.test(slug))?.[1] ?? null
    if (slugNums.includes(wantSeq) || ordFor === wantSeq) {
      score += 30
    } else if (slugNums.length > 0 || ordFor !== null) {
      // The slug has a DIFFERENT sequel/ordinal number → different part.
      return -1
    }
    // No sequel number in the slug at all → weak accept.
  } else if (slugNums.length > 0) {
    // Title has no sequel but the page is "…-2" → the sequel of the title.
    return -1
  }

  return score
}

/** Verify the fetched watch page really is the requested title, via its
 *  <title>/og:title (slugs can be aliased; the page title never lies). */
function pageTitleMatches(pageHtml: string, title: string): boolean {
  const og = pageHtml.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ??
    pageHtml.match(/content="([^"]+)"\s+property="og:title"/)?.[1] ??
    pageHtml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""
  if (!og) return true // can't read a title — don't hard-block
  const page = normalizeArabic(decodeURIComponent(og))
  const words = titleWords(title)
  if (words.length === 0) return true
  const stripAl = (w: string) => w.replace(/^ال/, "")
  const hits = words.filter((w) => page.includes(w) || page.includes(stripAl(w))).length
  return hits / words.length >= 0.6
}

/** Search query variants for Arabic titles (MyCima slugs drop prefixes etc).
 *  Includes HAMZA/SPELLING variants — mycima's WordPress search matches
 *  EXACTLY, so الكبير اوي (plain alef) finds nothing for الكبير أوي (hamza):
 *  verified live 2026-10-09. We generate normalized-spelling variants
 *  (أ/إ/آ→ا, ى→ي, ة→ه) so a spelling difference never zeroes the search. */
function mycimaQueryVariants(title: string): string[] {
  const clean = title.replace(/[:：]/g, " ").replace(/\s+/g, " ").trim()
  const variants = new Set<string>([clean])
  // Normalized spelling (أ→ا etc.) — covers source-title vs slug disagreements.
  const normalized = clean
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
  if (normalized !== clean) variants.add(normalized)
  // Reversal: if the title is ALREADY normalized (plain alef), the site may
  // spell it with hamza — try re-hamza-ing each plain alef that is NOT part
  // of the definite article ال (e.g. الكبير اوي → الكبير أوي, never ألكبير).
  else {
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] !== "ا") continue
      const prev = i > 0 ? clean[i - 1] : " "
      const next = clean[i + 1] ?? ""
      // skip the definite article: ا followed by ل at a word start
      if (next === "ل" && (i === 0 || prev === " ")) continue
      variants.add(clean.slice(0, i) + "أ" + clean.slice(i + 1))
    }
  }
  const words = clean.split(" ").filter((w) => w.length > 1)
  // Drop the leading definite article: "الحيطة" → "حيطة" (slugs vary)
  if (clean.startsWith("ال") && clean.length > 4) variants.add(clean.slice(2))
  // First two words only (long titles are often shortened in slugs)
  if (words.length > 2) variants.add(words.slice(0, 2).join(" "))
  return [...variants]
}


/** Decode a mycimafsd token (base64 / base64url) into the real embed URL. */
function decodeMycimafsd(token: string): string | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = Buffer.from(b64, "base64").toString("utf8")
    return /^https?:\/\//.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

/** Decode a secure_stream param (url-safe base64 zlib) into the target URL. */
export function decodeSecureStream(val: string): string | null {
  try {
    const b64 = val.replace(/-/g, "+").replace(/_/g, "/")
    const out = zlib.inflateSync(Buffer.from(b64, "base64")).toString("utf8")
    return /^https?:\/\//.test(out) ? out : null
  } catch {
    return null
  }
}

function mycimaContentLinks(html: string): string[] {
  const links = [...html.matchAll(/href="(https?:\/\/alking\.mycima\.cv\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => {
      if (/\.(css|js|png|jpg|jpeg|svg|ico|webp|xml|gif)|wp-content|wp-includes|wp-json|feed|xmlrpc|#|\?s=|comment|contact|terms|about|privacy|dmca|app-download/i.test(u)) return false
      // Only watch pages carry the embed token — series hubs / archives don't.
      if (/\/(series|movies|episodes|category|tag|page|release-year|genre|language|quality|actor|director)\//i.test(u)) return false
      return true
    })
  return [...new Set(links)]
}

/** my_player page URLs on a MyCima watch page (mycima-my.com/?my_player=ID).
 *  Iframing these shows the MyCima website (user-reported bug) — but FETCHING
 *  them server-side reveals an ArtPlayer page with a direct
 *  link.mycima.cv MP4 (see resolveMyPlayer). */
function myPlayerUrlsFromPage(pageHtml: string): string[] {
  const out: string[] = []
  for (const m of pageHtml.matchAll(/data-watch="([^"]+)"/g)) {
    const cand = m[1]
    if (/^https?:\/\//.test(cand) && cand.includes("my_player=")) {
      out.push(cand.startsWith("http") ? cand : `https://mycima-my.com/${cand.replace(/^\//, "")}`)
    }
  }
  return [...new Set(out)]
}

/** curl-based fetch for hosts whose Cloudflare configuration challenges
 *  Node's TLS ClientHello (mycima-my.com returns "Just a moment…" to every
 *  node fetch/https variant, while curl passes — verified live 2026-10-09:
 *  node → 403 CF challenge, curl → 200 with the ArtPlayer markup). */
async function curlFetchHtml(url: string, referer: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-s", "-L", "--max-time", "15", "-H", `User-Agent: ${UA}`, "-H", `Referer: ${referer}`, "-H", "Accept: text/html,*/*", url],
      { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    )
    return stdout && stdout.length > 500 ? stdout : null
  } catch {
    return null
  }
}

/** Resolve a MyCima my_player page (mycima-my.com/?my_player=ID) to its
 *  DIRECT media source. The player page embeds an ArtPlayer setup with
 *  `const videoUrl = "https://link.mycima.cv/…"` — a direct MP4 (byte
 *  ranges + ACAO:*; the server disguises content-type as image/jpeg —
 *  browsers sniff the MP4 container and play it fine in a <video> element).
 *  Verified live 2026-10-09: جعفر العمدة حلقة 1 → link.mycima.cv/ce22f53a…
 *  (593MB, 206 partial content, ACAO:*). The page is fetched via curl —
 *  node's TLS fingerprint gets Cloudflare-challenged. */
async function resolveMyPlayer(myPlayerUrl: string): Promise<MycimaSource | null> {
  const html = await curlFetchHtml(myPlayerUrl, MYCIMA_REFERER)
  if (!html) return null
  const m =
    html.match(/const\s+videoUrl\s*=\s*["'](https?:\/\/link\.mycima\.cv\/[^"']+)["']/) ??
    html.match(/["'](https?:\/\/link\.mycima\.cv\/[^"']+)["']/)
  if (!m) return null
  return { url: m[1], host: "MyCima", referer: "https://mycima-my.com/", kind: "mp4" }
}

/** Extract every playable source from a MyCima watch-page HTML. */
function mycimaSourcesFromPage(pageHtml: string): MycimaSource[] {
  const sources: MycimaSource[] = []
  const seen = new Set<string>()

  // Never treat MyCima's OWN pages as playable EMBEDS — iframing them shows
  // the user the MyCima website instead of the title (user-reported bug,
  // 2026-10-09). Embed sources must point at third-party video hosts.
  // ak.sv is also skipped: it's a full streaming SITE (301 → redirect chain),
  // not a clean embed player — it renders a website UI inside the player.
  // NOTE: kind "mp4" (link.mycima.cv direct media) is exempt — those ARE
  // playable direct video URLs.
  const isPlayableEmbedUrl = (u: string) =>
    !!u &&
    !/mycima\.(cv|com|net)/i.test(u) &&
    !/mycima-my\.com/i.test(u) &&
    !/^https?:\/\/ak\.sv\//i.test(u)

  const push = (s: MycimaSource) => {
    if (!s.url || seen.has(s.url)) return
    if (s.kind === "embed" && !isPlayableEmbedUrl(s.url)) return
    seen.add(s.url)
    sources.push(s)
  }

  // a) data-watch attributes: mycimafsd base64 tokens (direct video hosts).
  //    my_player short tokens (MyCima's own CF-gated mycima-my.com player
  //    page) are SKIPPED — iframing them shows the MyCima WEBSITE instead of
  //    the title (user-reported bug, 2026-10-08).
  for (const m of pageHtml.matchAll(/data-watch="([^"]+)"/g)) {
    const cand = m[1]
    if (/^https?:\/\//.test(cand)) {
      if (cand.includes("my_player=")) continue
      const pm = cand.match(/[?&][a-z_]+=([A-Za-z0-9_=+/-]{20,})/i)
      const decoded = pm ? decodeMycimafsd(pm[1]) : null
      const url = decoded ?? (cand.startsWith("http") && !cand.includes("mycima-my.com") ? cand : null)
      if (url && !url.includes("secure_stream")) {
        push({ url, host: getHost(url), referer: MYCIMA_REFERER, kind: "embed" })
      }
    } else {
      const url = decodeMycimafsd(cand)
      if (url) push({ url, host: getHost(url), referer: MYCIMA_REFERER, kind: "embed" })
    }
  }

  // b) download-section secure_stream links → decode → DIRECT MP4 when the
  //    target is a direct media host (link.mycima.cv serves video/mp4 with
  //    byte ranges + ACAO:*). Azrak/queue pages and nested mycima-my.com
  //    links are skipped (not directly playable).
  const dlEntries = [...pageHtml.matchAll(
    /href="(https?:\/\/[^"]*secure_stream=[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<resolution>([\s\S]*?)<\/resolution>/g
  )]
  for (const [, href, resolution] of dlEntries) {
    const ssVal = href.match(/secure_stream=([^&"]+)/)?.[1] ?? ""
    const decoded = decodeSecureStream(ssVal)
    if (!decoded) continue
    // Only direct media hosts — queue/redirector pages won't play.
    if (!/link\.mycima\.cv|\.mp4|\.m3u8/i.test(decoded)) continue
    const quality = resolution.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().match(/\d{3,4}p/)?.[0]
    push({ url: decoded, host: "MyCima MP4", referer: MYCIMA_REFERER, kind: "mp4", quality })
  }

  return sources
}

/** Series hub crawling: fetch a hub page and return its حلقة-N episode links. */
async function mycimaEpisodeLinksFromHub(hubUrl: string): Promise<string[]> {
  try {
    const html = await fetchMycimaPage(hubUrl)
    if (!html) return []
    return mycimaContentLinks(html).filter((u) => /حلقة/.test(decodeURIComponent(u)))
  } catch {
    return []
  }
}

// Arabic ordinal season names (الموسم الأول …) → number, for season hints.
// Matched against the NORMALIZED slug (hamza forms collapse to ا).
const AR_ORDINALS: [RegExp, number][] = [
  [/الاول/, 1], [/الثاني/, 2], [/الثالث/, 3], [/الرابع/, 4], [/الخامس/, 5],
  [/السادس/, 6], [/السابع/, 7], [/الثامن/, 8], [/التاسع/, 9], [/العاشر/, 10],
]

function seasonFromSlug(slug: string): number | null {
  // Numeric season: "-الكبير-أوي-8-حلقة-29" → 8 (normalized: hyphens preserved)
  const n = normalizeArabic(decodeURIComponent(slug))
  const num = n.match(/[-–](\d{1,2})-حلقه/)
  if (num) return Number(num[1])
  // Ordinal season: "…-الموسم-الاول" → 1
  for (const [re, s] of AR_ORDINALS) {
    if (re.test(n)) return s
  }
  return null
}

export async function searchMycima(
  title: string,
  type: "movie" | "series",
  season?: number | null,
  episode?: number | null
): Promise<{ sources: MycimaSource[]; pageUrl: string | null }> {
  try {
    // Step 1: search — try query variants until one returns content links.
    // (fetchMycimaPage routes through the sidecar — see its comment.)
    let links: string[] = []
    for (const q of mycimaQueryVariants(title)) {
      const searchHtml = await fetchMycimaPage(`${MYCIMA_BASE}/?s=${encodeURIComponent(q)}`)
      if (!searchHtml) continue
      links = mycimaContentLinks(searchHtml)
      if (links.length > 0) break
    }
    if (links.length === 0) return { sources: [], pageUrl: null }

    const norm = (s: string) => normalizeArabic(decodeURIComponent(s))
    // VERIFIED candidates only — matchTitleScore() rejects every page whose
    // slug doesn't contain ALL significant title words (with the correct
    // sequel number). This is what guarantees "عمر وسلمى 2" never resolves
    // to part 1/3 and a series never resolves to another (e.g. Turkish-dubbed)
    // series that the fuzzy WordPress search mixed in.
    let candidates: string[] = []
    let lastVerifiedPage: string | null = null

    if (type === "movie") {
      // Movie pages: must contain the movie word (فيلم) and NOT be an episode
      // page (حلقة) — an episode of a same-named series is not the movie.
      const normMovieWord = normalizeArabic("فيلم")
      const scored = links
        .map((u) => ({ u, score: matchTitleScore(u, title) }))
        .filter((c) => c.score > 0 && !/حلقه/.test(norm(c.u)))
        // prefer watch pages that carry the movie word
        .sort((a, b) => {
          const aMovie = norm(a.u).includes(normMovieWord) ? 1 : 0
          const bMovie = norm(b.u).includes(normMovieWord) ? 1 : 0
          if (aMovie !== bMovie) return bMovie - aMovie
          return b.score - a.score
        })
      candidates = scored.map((c) => c.u)
    } else {
      // Series: the episode page must match حلقة-{ep} AND the series name.
      // Search results only index recent posts, so when the episode isn't
      // there, crawl the series hub page — whose episode list mixes in OTHER
      // series (verified live 2026-10-09: related series' حلقة-1 appears on
      // the hub) — so the hub results are name-verified too.
      const ep = episode ?? 1
      const s = season ?? 1
      const epPattern = new RegExp(`${normalizeArabic("حلقة")}-${ep}(/|$)`)
      const rankBySeason = (urls: string[]) => {
        const seasonHit = urls.filter((u) => seasonFromSlug(u) === s)
        if (seasonHit.length) return seasonHit
        const noSeason = urls.filter((u) => seasonFromSlug(u) === null)
        if (noSeason.length) return noSeason
        // No exact season — same series, wrong season markers: prefer the
        // season CLOSEST to the requested one (e.g. user opens S1 of a show
        // whose hub only lists S7/S8 episodes).
        return urls
          .slice()
          .sort(
            (a, b) =>
              Math.abs((seasonFromSlug(a) ?? 0) - s) - Math.abs((seasonFromSlug(b) ?? 0) - s)
          )
      }
      let eps = rankBySeason(
        links.filter(
          (u) =>
            epPattern.test(norm(u)) &&
            matchTitleScore(u, title, { season: s, episode: ep }) > 0
        )
      )
      if (eps.length === 0) {
        // Crawl the hub: the SEED must also be a verified episode of the
        // requested series — a fuzzy-search episode of another series must
        // never hand us the wrong hub.
        const seed = links.find(
          (u) =>
            /حلقة/.test(decodeURIComponent(u)) &&
            matchTitleScore(u, title, { season: s, episode: ep }) > 0
        )
        if (seed) {
          const seedHtml = await fetchMycimaPage(seed)
          if (seedHtml) {
            const hubUrl =
              seedHtml.match(/href="(https?:\/\/alking\.mycima\.cv\/series\/[^"]+)"/i)?.[1] ?? null
            if (hubUrl) {
              const hubEpisodes = await mycimaEpisodeLinksFromHub(hubUrl)
              eps = rankBySeason(
                hubEpisodes.filter(
                  (u) =>
                    epPattern.test(norm(u)) &&
                    matchTitleScore(u, title, { season: s, episode: ep }) > 0
                )
              )
            }
          }
        }
      }
      candidates = eps
    }
    if (candidates.length === 0) return { sources: [], pageUrl: null }

    // Step 3: fetch the watch page(s) — the page <title>/og:title is the FINAL
    // verification (slug aliases can't fool it). Try up to 3 verified
    // candidates and use the first that has playable sources.
    for (const cand of candidates.slice(0, 3)) {
      const pageHtml = await fetchMycimaPage(cand)
      if (!pageHtml) continue
      if (!pageTitleMatches(pageHtml, title)) continue
      lastVerifiedPage = cand
      let sources = mycimaSourcesFromPage(pageHtml)
      // ── Content gate: verify each DIRECT mp4's real content via its CDN
      // content-disposition filename. mycina's download links are frequently
      // CROSSED with other titles' files (عمر وسلمى 2 → مسلسل سلمى الحلقة 9,
      // verified live 2026-10-09) — those must never reach the player.
      const embeds = sources.filter((s) => s.kind !== "mp4")
      const mp4s: MycimaSource[] = []
      for (const s of sources.filter((x) => x.kind === "mp4")) {
        const verdict = await verifyDirectContent(s.url, { title, type, season, episode })
        if (verdict !== "mismatch") mp4s.push(s)
      }
      sources = [...mp4s, ...embeds]
      if (sources.length > 0) {
        return { sources, pageUrl: lastVerifiedPage }
      }
      // No embed/mp4 sources on the watch page — currently-airing series
      // pages (e.g. جعفر العمدة, الكبير أوي 8) carry ONLY my_player links.
      // Resolve them to their direct link.mycima.cv MP4s instead — and pass
      // the resolved file through the SAME content gate (my_player pages can
      // serve crossed files too).
      const myPlayers = myPlayerUrlsFromPage(pageHtml)
      for (const mp of myPlayers.slice(0, 2)) {
        const resolved = await resolveMyPlayer(mp)
        if (!resolved) continue
        const verdict = await verifyDirectContent(resolved.url, { title, type, season, episode })
        if (verdict === "mismatch") continue
        return { sources: [resolved], pageUrl: lastVerifiedPage }
      }
      // Verified page but nothing playable at all — try the next candidate.
    }
    return { sources: [], pageUrl: lastVerifiedPage }
  } catch {
    return { sources: [], pageUrl: null }
  }
}

// ─── Direct Video Extraction from Embed Page ────────────────────────────────
// Fetches an embed page (MixDrop, Morencius, VOE, etc.), extracts the direct
// video URL (MP4 or HLS), and returns it.
export async function extractDirectFromEmbed(
  embedUrl: string,
  host: string,
  refererOverride?: string
): Promise<{ url: string; type: "mp4" | "hls"; referer: string } | null> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: refererOverride || "https://alking.mycima.cv/",
  }

  let html = ""
  let finalUrl = embedUrl
  try {
    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: undefined,
    })
    html = await res.text()
    finalUrl = res.url || embedUrl
  } catch {
    return null
  }

  // Strategy 1: Packed JS (MixDrop, Morencius, etc.)
  const packedBlock = extractPackedJs(html)
  if (packedBlock) {
    try {
      const unpacked = unpack(packedBlock)

      // MixDrop: MDCore.wurl="..."
      const wurlMatch = unpacked.match(/MDCore\.wurl="(.*?)"/)
      if (wurlMatch) {
        let u = wurlMatch[1]
        if (u.startsWith("//")) u = "https:" + u
        if (!u.startsWith("http")) u = "https:" + u
        return {
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          referer: "https://mixdrop.ag",
        }
      }

      // file:"https://..." in unpacked JS
      const srcFileMatch = unpacked.match(/file:\s*["'](https?:\/\/[^"']+)["']/i)
      if (srcFileMatch) {
        const u = srcFileMatch[1]
        if (u.match(/\.(mp4|m3u8|ts)/i) || u.includes("master") || u.includes("hls")) {
          return {
            url: u,
            type: u.includes(".m3u8") ? "hls" : "mp4",
            referer: finalUrl,
          }
        }
      }

      // Any https://...mp4 or https://...m3u8 in unpacked JS
      const urlMatch = unpacked.match(/(https:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)/i)
      if (urlMatch) {
        const u = urlMatch[1]
        return {
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          referer: finalUrl,
        }
      }

      // "hls2":"https://..." (Morencius)
      const hlsMatch = unpacked.match(/["']hls\w*["']\s*:\s*["'](https:\/\/[^"']+)["']/i)
      if (hlsMatch) {
        const u = hlsMatch[1]
        return { url: u, type: "hls", referer: finalUrl }
      }
    } catch {}
  }

  // Strategy 2: VOE JS redirect + hls
  if (host === "VOE" || embedUrl.includes("voe.")) {
    const redirectMatch = html.match(/window\.location\.href\s*=\s*['"](https:\/\/[^'"]+)['"]/)
    if (redirectMatch) {
      try {
        const redRes = await fetch(redirectMatch[1], {
          headers: { ...headers, Referer: embedUrl },
          redirect: "follow",
          signal: undefined,
        })
        const redHtml = await redRes.text()
        const hlsMatch = redHtml.match(/'hls': ?'(http.*?)'/)
        if (hlsMatch) {
          return { url: hlsMatch[1], type: "hls", referer: "https://voe.sx" }
        }
        const m3u8Match = redHtml.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)
        if (m3u8Match) {
          return { url: m3u8Match[0], type: "hls", referer: redirectMatch[1] }
        }
      } catch {}
    }
    const voeHls = html.match(/'hls': ?'(http.*?)'/)
    if (voeHls) {
      return { url: voeHls[1], type: "hls", referer: "https://voe.sx" }
    }
  }

  // Strategy 3: sources:[{file:"..."}]
  const srcMatch = html.match(/sources:\s*\[\{[^}]*file:\s*"(https:\/\/[^"]+)"/i)
  if (srcMatch) {
    const u = srcMatch[1]
    return {
      url: u,
      type: u.includes(".m3u8") ? "hls" : "mp4",
      referer: finalUrl,
    }
  }

  // Strategy 4: "file":"..."
  const fileMatch = html.match(/['"]file['"]\s*:\s*['"](https:\/\/[^'"]+)['"]/i)
  if (fileMatch) {
    const u = fileMatch[1]
    return {
      url: u,
      type: u.includes(".m3u8") ? "hls" : "mp4",
      referer: finalUrl,
    }
  }

  // Strategy 5: Generic m3u8
  const m3u8Match = html.match(/https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i)
  if (m3u8Match) {
    return { url: m3u8Match[0], type: "hls", referer: finalUrl }
  }

  // Strategy 6: Generic mp4
  const mp4Match = html.match(/https:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i)
  if (mp4Match) {
    return { url: mp4Match[0], type: "mp4", referer: finalUrl }
  }

  return null
}

// ─── File Size Fetching ─────────────────────────────────────────────────────
// Extracts a FRESH video URL from an embed page and HEADs it to get the file
// size. For HLS, estimates by sampling segments.
export async function getDownloadInfo(
  embedUrl: string,
  referer: string,
  variantIndex: number = -1
): Promise<{ success: boolean; videoUrl: string | null; videoType: "mp4" | "hls"; size: number }> {
  try {
    const extracted = await extractDirectFromEmbed(embedUrl, "")
    if (!extracted) {
      return { success: false, videoUrl: null, videoType: "mp4", size: 0 }
    }

    let size = 0
    // For MP4: HEAD the direct URL
    if (extracted.type === "mp4") {
      try {
        const sizeHeaders: Record<string, string> = {
          "User-Agent": UA,
          Accept: "*/*",
        }
        if (extracted.referer) sizeHeaders["Referer"] = extracted.referer
        const sizeRes = await fetch(extracted.url, {
          method: "HEAD",
          headers: sizeHeaders,
          redirect: "follow",
          signal: undefined,
        })
        const len = sizeRes.headers.get("content-length")
        size = len ? parseInt(len, 10) || 0 : 0
      } catch {}
    }

    // For HLS (or if MP4 HEAD failed): estimate by sampling segments
    if (size === 0 && extracted.type === "hls") {
      size = await estimateHlsSize(extracted.url, extracted.referer, variantIndex)
    }

    return {
      success: true,
      videoUrl: extracted.url,
      videoType: extracted.type,
      size,
    }
  } catch {
    return { success: false, videoUrl: null, videoType: "mp4", size: 0 }
  }
}

// Estimate HLS total size by sampling segments
async function estimateHlsSize(
  m3u8Url: string,
  referer: string,
  variantIndex: number = -1
): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
  }
  if (referer) headers["Referer"] = referer

  try {
    const playlistRes = await fetch(m3u8Url, {
      headers,
      redirect: "follow",
      signal: undefined,
    })
    if (!playlistRes.ok) return 0
    let playlist = await playlistRes.text()
    let baseUrl = new URL(playlistRes.url || m3u8Url)

    // If master playlist, resolve to the requested variant
    if (playlist.includes("#EXT-X-STREAM-INF")) {
      const variantUrls: string[] = []
      const lines = playlist.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("#EXT-X-STREAM-INF")) {
          for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j].trim()
            if (next && !next.startsWith("#")) {
              try {
                variantUrls.push(new URL(next, baseUrl).href)
              } catch {}
              break
            }
          }
        }
      }
      const pickIdx = variantIndex >= 0 && variantIndex < variantUrls.length
        ? variantIndex
        : 0
      if (variantUrls.length > 0) {
        try {
          const variantRes = await fetch(variantUrls[pickIdx], {
            headers,
            redirect: "follow",
            signal: undefined,
          })
          if (variantRes.ok) {
            playlist = await variantRes.text()
            baseUrl = new URL(variantRes.url || variantUrls[pickIdx])
          }
        } catch {}
      }
    }

    // Parse segment URLs
    const lines = playlist.split("\n")
    const segments: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        try {
          segments.push(new URL(trimmed, baseUrl).href)
        } catch {}
      }
    }

    if (segments.length === 0) return 0

    // HEAD 2 segments in PARALLEL for speed
    const sampleSize = Math.min(segments.length, 2)
    const sampleResults = await Promise.all(
      segments.slice(0, sampleSize).map(async (segUrl) => {
        try {
          const segRes = await fetch(segUrl, {
            method: "HEAD",
            headers,
            redirect: "follow",
            signal: undefined,
          })
          const len = segRes.headers.get("content-length")
          return len ? parseInt(len, 10) || 0 : 0
        } catch {
          return 0
        }
      })
    )
    let sampleTotal = 0
    let sampledCount = 0
    for (const s of sampleResults) {
      if (s > 0) {
        sampleTotal += s
        sampledCount++
      }
    }

    if (sampleTotal > 0 && sampledCount > 0) {
      return Math.round((sampleTotal / sampledCount) * segments.length)
    }
    return 0
  } catch {
    return 0
  }
}
