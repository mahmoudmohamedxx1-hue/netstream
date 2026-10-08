// Shared video extraction logic — used by API routes so they can call each
// other's logic directly (without HTTP fetch to localhost:3000, which fails
// in production where the server runs on a different port/domain).
//
// This module is imported by:
//   /api/2embed-servers/route.ts
//   /api/extract-download/route.ts

import { unpack } from "unpacker"
import zlib from "node:zlib"

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
    .replace(/[\u200c-\u200f]/g, "")
    .replace(/[:：'"«»،؟?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** Search query variants for Arabic titles (MyCima slugs drop prefixes etc). */
function mycimaQueryVariants(title: string): string[] {
  const clean = title.replace(/[:：]/g, " ").replace(/\s+/g, " ").trim()
  const variants = new Set<string>([clean])
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

/** Extract every playable source from a MyCima watch-page HTML. */
function mycimaSourcesFromPage(pageHtml: string): MycimaSource[] {
  const sources: MycimaSource[] = []
  const seen = new Set<string>()

  const push = (s: MycimaSource) => {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url)
      sources.push(s)
    }
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
    const res = await fetch(hubUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.9,en;q=0.8", Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const html = await res.text()
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
    let links: string[] = []
    for (const q of mycimaQueryVariants(title)) {
      const searchRes = await fetch(`${MYCIMA_BASE}/?s=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.9,en;q=0.8", Accept: "text/html,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
      if (!searchRes.ok) continue
      const searchHtml = await searchRes.text()
      links = mycimaContentLinks(searchHtml)
      if (links.length > 0) break
    }
    if (links.length === 0) return { sources: [], pageUrl: null }

    const norm = (s: string) => normalizeArabic(decodeURIComponent(s))
    let pageUrl: string | null = null

    if (type === "movie") {
      // Prefer the EXACT title (slug form, trailing slash — so searching
      // "الحريفة" doesn't match "الحريفة-2"), then title-word match, then any movie.
      // Patterns are pre-normalized (ة→ه, أ→ا…) to match the normalized URLs.
      const normTitle = normalizeArabic(title)
      const normMovieWord = normalizeArabic("فيلم")
      const slug = normTitle.replace(/\s+/g, "-")
      const exact = links.filter((u) => norm(u).includes(`${normMovieWord}-${slug}/`))
      const words = normTitle.split(" ").filter((w) => w.length > 2)
      const firstWord = words[0] ?? null
      const wordMatch = firstWord
        ? links.filter((u) => norm(u).includes(normMovieWord) && norm(u).includes(firstWord))
        : []
      const anyMovie = links.filter((u) => norm(u).includes(normMovieWord))
      pageUrl = exact[0] ?? wordMatch[0] ?? anyMovie[0] ?? null
    } else {
      // Series: find the exact episode page. Search results only index recent
      // posts, so when the episode isn't there, crawl the series hub page
      // (linked from any episode page) and pick حلقة-{ep} from the full list.
      // NOTE: patterns are normalized the same way as the URLs — ة→ه means
      // "حلقة" must be searched as "حلقه" on the normalized side.
      const ep = episode ?? 1
      const s = season ?? 1
      const epPattern = new RegExp(`${normalizeArabic("حلقة")}-${ep}(/|$)`)
      const epMatch = () => links.filter((u) => epPattern.test(norm(u)))
      const rankBySeason = (urls: string[]) => {
        const seasonHit = urls.filter((u) => seasonFromSlug(u) === s)
        const noSeason = urls.filter((u) => seasonFromSlug(u) === null)
        return seasonHit.length ? seasonHit : noSeason.length ? noSeason : urls
      }
      let candidates = rankBySeason(epMatch())
      if (candidates.length === 0) {
        // Crawl the hub: any episode/series link exposes the hub URL.
        const seed =
          links.find((u) => /حلقة/.test(decodeURIComponent(u))) ??
          links.find((u) => /مسلسل/.test(decodeURIComponent(u)))
        if (seed) {
          const seedRes = await fetch(seed, {
            headers: { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.9,en;q=0.8", Accept: "text/html,*/*" },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
          })
          if (seedRes.ok) {
            const seedHtml = await seedRes.text()
            const hubUrl =
              seedHtml.match(/href="(https?:\/\/alking\.mycima\.cv\/series\/[^"]+)"/i)?.[1] ?? null
            if (hubUrl) {
              const hubEpisodes = await mycimaEpisodeLinksFromHub(hubUrl)
              candidates = rankBySeason(hubEpisodes.filter((u) => epPattern.test(norm(u))))
            }
          }
        }
      }
      pageUrl = candidates[0] ?? null
    }
    if (!pageUrl) return { sources: [], pageUrl: null }

    // Step 3: fetch the watch page and pull every playable source.
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.9,en;q=0.8", Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!pageRes.ok) return { sources: [], pageUrl: pageRes.url }
    const pageHtml = await pageRes.text()
    const sources = mycimaSourcesFromPage(pageHtml)
    return { sources, pageUrl: pageRes.url || pageUrl }
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
