import { NextRequest, NextResponse } from "next/server"

// GET /api/arabic-search?site=cimaleek&title=spider+man&type=movie
//
// Searches an Arabic streaming site by title and returns the first matching
// movie/series page URL. This is a server-side scraper because:
//   1. These sites use Cloudflare protection that blocks cross-origin requests
//   2. The video player URLs are encrypted via JS and can't be extracted server-side
//   3. The movie page URL is what we need — the user watches on the site itself
//
// Supported sites (from the Abu-Repo / CloudStream3 plugins):
//   - cimaleek  → m.cimaleek.pw  (redirects from cimaleek.to)
//   - egybest   → egybest.la
//   - egydead   → egydead.media
//   - mycima    → my-cima.video
//   - faselhd   → faselhd.club

type SiteConfig = {
  id: string
  name: string
  searchUrl: (title: string) => string
  // Regex to extract movie/series page links from the search results HTML.
  linkPattern: RegExp
  baseUrl: string
}

export const ARABIC_SITES: Record<string, SiteConfig> = {
  cimaleek: {
    id: "cimaleek",
    name: "CimaLeek",
    // cimaleek.to redirects to m.cimaleek.pw
    searchUrl: (title) => `https://cimaleek.to/?s=${encodeURIComponent(title)}`,
    // Movie links: m.cimaleek.pw/movies/slug/ or m.cimaleek.pw/series/slug/
    linkPattern: /href="(https:\/\/m\.cimaleek\.pw\/(?:movies|series)\/[^"]+)"/gi,
    baseUrl: "https://m.cimaleek.pw",
  },
  egydead: {
    id: "egydead",
    name: "EgyDead",
    // egydead.media redirects to tv10.egydead.live
    searchUrl: (title) => `https://egydead.media/?s=${encodeURIComponent(title)}`,
    // Movies: tv10.egydead.live/slug/ (no prefix)
    // Series: tv10.egydead.live/serie/slug/
    // Episodes: tv10.egydead.live/episode/slug/
    // We match all content links and filter out wp-content/wp-json/etc later.
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/(?:serie\/|episode\/)?[^"]+)"/gi,
    baseUrl: "https://tv10.egydead.live",
  },
  egybest: {
    id: "egybest",
    name: "EgyBest",
    // JS-rendered SPA — search results not in raw HTML. We return the search
    // page URL so the user can browse manually.
    searchUrl: (title) => `https://egybest.la/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(NEVER_MATCHES)"/gi,
    baseUrl: "https://egybest.la",
  },
  mycima: {
    id: "mycima",
    name: "MyCima",
    // JS-rendered — redirects to mycima.gripe, search results loaded via AJAX
    searchUrl: (title) => `https://my-cima.video/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(NEVER_MATCHES)"/gi,
    baseUrl: "https://mycima.gripe",
  },
  faselhd: {
    id: "faselhd",
    name: "FaselHD",
    // Cloudflare-protected — returns 403 to server-side requests.
    // We return the search page URL for the user to open manually.
    searchUrl: (title) => `https://faselhd.club/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(NEVER_MATCHES)"/gi,
    baseUrl: "https://faselhd.club",
  },
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const siteId = url.searchParams.get("site") ?? "cimaleek"
  const title = url.searchParams.get("title") ?? ""
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"

  if (!title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 })
  }

  const site = ARABIC_SITES[siteId]
  if (!site) {
    return NextResponse.json({ error: `unknown site: ${siteId}` }, { status: 400 })
  }

  try {
    const searchUrl = site.searchUrl(title)
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      // Even on error (403/Cloudflare), return the search page URL as a
      // fallback so the user can open it in a new tab and browse manually.
      return NextResponse.json({
        site: site.name,
        title,
        type,
        searchUrl,
        movieUrl: null,
        fallbackUrl: searchUrl,
        error: `HTTP ${res.status}`,
      })
    }

    const html = await res.text()

    // Extract movie/series links from the HTML
    const matches: string[] = []
    let match: RegExpExecArray | null
    const pattern = new RegExp(site.linkPattern)
    while ((match = pattern.exec(html)) !== null) {
      const href = match[1]
      // Skip non-content URLs (wp-content, wp-json, feed, xmlrpc, css, js, etc.)
      if (/wp-content|wp-json|wp-includes|xmlrpc|feed\/|\/feed|css\/|js\/|font|\.png|\.jpg|\.ico|\/page\/|\/category\/|\/tag\/|\/author\//.test(href)) continue
      matches.push(href)
    }

    // Deduplicate
    const unique = [...new Set(matches)]

    // Pick the best match — prefer links whose slug contains the title's first word
    const firstWord = title.split(/\s+/)[0]?.toLowerCase()
    const bestMatch = firstWord
      ? unique.find((u) => u.toLowerCase().includes(firstWord))
      : unique[0]

    const movieUrl = bestMatch ?? unique[0] ?? null

    // If no movie URL was found (JS-rendered sites), return the search page URL
    // as a fallback so the user can browse the site manually.
    const fallbackUrl = movieUrl ? null : searchUrl

    return NextResponse.json({
      site: site.name,
      title,
      type,
      searchUrl,
      movieUrl,
      fallbackUrl,
      alternatives: unique.slice(0, 5),
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({
      site: site.name,
      title,
      searchUrl: site.searchUrl(title),
      movieUrl: null,
      error,
    })
  }
}
