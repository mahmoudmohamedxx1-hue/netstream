import { NextRequest, NextResponse } from "next/server"

// GET /api/arabic-stream?site=egydead&title=spider%20man&type=movie
//
// Replicates the EXACT logic from the ImZaw cloudstream-extensions-arabic repo:
//   1. Search the Arabic site by title (like the plugin's search() method)
//   2. Find the movie page URL (like the plugin's load() method)
//   3. POST View=1 to the movie page (like the plugin's loadLinks() method)
//   4. Extract `data-link` attributes from `ul.serversList > li` elements
//      — these are the IFRAME EMBED URLs that play directly in a browser
//   5. Also extract download links from `.donwload-servers-list > li > a`
//
// The data-link URLs are already embeddable — no conversion needed.
// They include: MixDrop, VOE, StreamRuby, HGCloud, PlayMogo, Vidaraa, etc.

type EmbeddableSource = {
  url: string
  host: string
}

type SiteConfig = {
  id: string
  name: string
  searchUrl: (title: string) => string
  linkPattern: RegExp
  postView: boolean
}

const SITES: Record<string, SiteConfig> = {
  // ImZaw repo: https://github.com/ImZaw/cloudstream-extensions-arabic
  egydead: {
    id: "egydead",
    name: "EgyDead",
    searchUrl: (title) => `https://tv.egydead.live/?s=${encodeURIComponent(title)}`,
    linkPattern: /href="(https:\/\/tv10\.egydead\.live\/[^"]+)"/gi,
    postView: true,
  },
  // EgyBest's original domains are dead — routed through EgyDead
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
    // Map known domains to friendly names
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
    }
    const hostname = u.hostname.replace(/^www\./, "")
    return hostMap[hostname] ?? hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1)
  } catch {
    return "Unknown"
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const siteId = url.searchParams.get("site") ?? "egydead"
  const title = url.searchParams.get("title") ?? ""
  const type = url.searchParams.get("type") === "series" ? "series" : "movie"

  if (!title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 })
  }

  const site = SITES[siteId]
  if (!site) {
    return NextResponse.json({ error: `unknown site: ${siteId}` }, { status: 400 })
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  }

  try {
    // Step 1: Search for the movie page URL
    const searchUrl = site.searchUrl(title)
    const searchRes = await fetch(searchUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    })
    if (!searchRes.ok) {
      return NextResponse.json({
        site: site.name, title, sources: [], searchUrl,
        error: `Search HTTP ${searchRes.status}`,
      })
    }
    const searchHtml = await searchRes.text()

    // Extract movie page links — filter out non-content URLs
    const matches: string[] = []
    let match: RegExpExecArray | null
    const pattern = new RegExp(site.linkPattern.source, "gi")
    while ((match = pattern.exec(searchHtml)) !== null) {
      const href = match[1]
      if (/wp-content|wp-json|wp-includes|xmlrpc|feed|css\/|js\/|font|\.png|\.jpg|\.ico|\/page\/|\/category\/|\/tag\/|\/author\//.test(href)) continue
      if (/\/assembly\/|\/series-category\/|\/type\//.test(href)) continue
      // Skip episode links when looking for movies
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

    if (!movieUrl) {
      return NextResponse.json({
        site: site.name, title, sources: [], searchUrl,
        error: "No movie page found",
      })
    }

    // Step 2: Fetch the movie page (POST View=1 for EgyDead-style sites)
    // This is the EXACT logic from the ImZaw repo's loadLinks() method:
    //   val doc = app.post(data, data = mapOf("View" to "1")).document
    let movieHtml: string
    if (site.postView) {
      const watchRes = await fetch(movieUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: "View=1",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    } else {
      const watchRes = await fetch(movieUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      })
      movieHtml = watchRes.ok ? await watchRes.text() : ""
    }

    // Step 3: Extract embeddable iframe URLs from `data-link` attributes
    // This is the key insight from the ImZaw repo:
    //   doc.select("ul.serversList > li").apmap { li ->
    //       val iframeUrl = li.attr("data-link")
    //   }
    const sources: EmbeddableSource[] = []
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
    // These are the same video hosts but in download format — convert to embed
    const downloadPattern = /<li[^>]*class="[^"]*donwload[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"/gi
    let dlMatch2: RegExpExecArray | null
    while ((dlMatch2 = downloadPattern.exec(movieHtml)) !== null) {
      const dlUrl = dlMatch2[1]
      // Convert download URLs to embed URLs where possible
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

    return NextResponse.json({
      site: site.name,
      title,
      type,
      movieUrl,
      sources,
      sourceCount: sources.length,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({
      site: site.name, title, sources: [], error,
    })
  }
}
