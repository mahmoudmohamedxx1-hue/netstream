import { NextRequest, NextResponse } from "next/server"

// GET /api/video-proxy?url=<embed-url>&referer=<referer>
//
// Proxies a provider's embed page with ad-blocking. Works across ALL platforms
// and devices (Vercel, Netlify, mobile, desktop, Smart TV).
//
// Key design decisions:
// 1. We do NOT override window.fetch or XMLHttpRequest globally — that breaks
//    video players that load their video via fetch/XHR (vidfast, vidcore, etc.)
// 2. We only strip <script> tags from KNOWN ad domains (doubleclick, exoclick,
//    popads, etc.) — not all scripts
// 3. We inject CSS to hide ad elements (banners, popunders, overlays)
// 4. We bypass 2Embed's sandbox detection (isReallySandboxed)
// 5. We set permissive CSP headers so the video player can load from any CDN

// ── Known ad domains — scripts from these are stripped ────────────────────
const AD_DOMAINS = [
  "doubleclick.net", "googleads.g.doubleclick.net", "googlesyndication.com",
  "google-analytics.com", "googletagmanager.com", "connatix.com",
  "eyeota.net", "crwdcntrl.net", "dotomi.com", "everesttech.net",
  "dtscout.com", "mrktmtrcs.net", "dasdaily.com", "agl006.host",
  "goodimpressioncrboost.com", "manitobaboats.com", "bookmsg.com",
  "popunder.net", "ads.exoclick.com", "exosrv.com", "adsystem.com",
  "a-mo.net", "a.mrktmtrcs.net", "a.dtssrv.com", "tag-ab",
  "instream/ad_status", "ad_status.js", "tagivi.com",
  "popads.net", "propellerads.com", "adsterra.com",
  "juicyads.com", "trafficjunky.net", "hilltopads.com",
  "histats.com", "rexsrv.com", "adskeeper.com",
  "syndication.exoclick.com", "main.exosrv.com",
  "a.realsrv.com", "syndication.realsrv.com",
]

// ── CSS to hide ad elements (uBlock Origin Lite style) ────────────────────
const AD_BLOCK_CSS = `
<style id="netstream-adblock">
  /* Hide 2Embed sandbox error */
  #sbxErr { display: none !important; visibility: hidden !important; opacity: 0 !important; }
  /* Hide ad containers by ID/class pattern */
  [id*="ad-"], [id*="ads-"], [id*="ad_"], [id*="ads_"],
  [class*="ad-"], [class*="ads-"], [class*="ad_"], [class*="ads_"],
  [id*="banner"], [class*="banner"],
  [id*="popunder"], [class*="popunder"], [class*="pop-under"],
  [id*="overlay-ad"], [class*="overlay-ad"], [class*="overdiv"],
  [id*="popup"], [class*="popup-ad"],
  iframe[src*="doubleclick"], iframe[src*="googleads"], iframe[src*="connatix"],
  iframe[src*="popunder"], iframe[src*="dasdaily"], iframe[src*="adskeeper"],
  iframe[src*="exoclick"], iframe[src*="exosrv"], iframe[src*="popads"],
  iframe[src*="adsterra"], iframe[src*="juicyads"], iframe[src*="trafficjunky"],
  iframe[src*="hilltopads"], iframe[src*="propellerads"],
  div[class*="ad-container"], div[id*="ad-container"],
  div[class*="ad-wrapper"], div[id*="ad-wrapper"],
  .ad-banner, .ad-overlay, .ad-popup, .adbd, #ad, #ads, .ad, .ads, .advert,
  .advertisement, .ad-notice, .ad-label,
  #sbxErr, .dropdown.ad, .ad-frame, .ad-slot,
  /* Common popunder/redirect patterns */
  [onclick*="window.open"], [onclick*="location.href"],
  a[href*="popunder"], a[href*="popads"], a[href*="exoclick"],
  a[href*="adsterra"], a[href*="propellerads"],
  /* Video player should fill the screen */
  video, .jwplayer, .video-js, .vjs-tech, #videojs, #iframesrc, #player, #playerWrap,
  .player, .player-container, .video-container, #vidplayer, #embedPlayer,
  .fluid-player, .fluid_video_wrapper, #fluid-player-elem,
  .p2play, .p2p-player, #p2p-player,
  {
    width: 100% !important; height: 100% !important;
  }
  /* Hide everything that's not the video player */
  body > div:not([id*="player"]):not([class*="player"]):not([id*="video"]):not([class*="video"]):not([id*="embed"]):not([class*="embed"]):not([id*="jw"]):not([class*="jw"]):not([id*="vjs"]):not([class*="vjs"]):not([id*="fluid"]):not([class*="fluid"]):not([id*="p2p"]):not([class*="p2p"]) {
    /* Don't hide — some providers wrap the player in a generic div */
  }
  body { margin: 0; padding: 0; background: #000; overflow: hidden; }
</style>
`

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("url")
  const referer = url.searchParams.get("referer") || ""

  if (!embedUrl) {
    return new NextResponse("url required", { status: 400 })
  }

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }
  if (referer) headers["Referer"] = referer

  try {
    const res = await fetch(embedUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      // If the provider returns an error, pass it through — don't proxy it
      // (the player will auto-switch to the next provider)
      return new NextResponse(`HTTP ${res.status}`, { status: res.status })
    }
    let html = await res.text()
    const finalUrl = res.url || embedUrl

    // 1. Strip ad scripts from known ad domains ONLY
    //    Do NOT strip other scripts — they're needed for the video player
    for (const domain of AD_DOMAINS) {
      const escaped = domain.replace(/\./g, "\\.").replace(/\//g, "\\/")
      const pattern = new RegExp(
        `<script[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></script>`,
        "gi"
      )
      html = html.replace(pattern, "")
      // Also strip <iframe> ad tags
      const iframePattern = new RegExp(
        `<iframe[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></iframe>`,
        "gi"
      )
      html = html.replace(iframePattern, "")
    }

    // 2. Bypass 2Embed's sandbox detection (isReallySandboxed)
    html = html.replace(
      /function\s+isReallySandboxed\s*\(\)\s*\{[\s\S]*?\n\s*\}/,
      "function isReallySandboxed() { return false; }"
    )
    html = html.replace(
      /sbxErr\.style\.display\s*=\s*['"]flex['"]/gi,
      "sbxErr.style.display = 'none'"
    )

    // 3. Inject ad-blocking CSS at the start of <head>
    //    NO JavaScript injection — we don't override fetch/XHR because that
    //    breaks video players that load their video via fetch/XHR.
    html = html.replace(/<head([^>]*)>/i, `<head$1>${AD_BLOCK_CSS}`)

    // 4. Add <base> tag so relative URLs resolve correctly
    const baseTag = `<base href="${finalUrl}">`
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Allow framing from our own domain
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*",
        // Permissive CSP — let the video player load from any CDN
        // (we block ad domains by stripping their scripts in the HTML above)
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
          "script-src * 'unsafe-inline' 'unsafe-eval'",
          "style-src * 'unsafe-inline'",
          "img-src * data: blob:",
          "media-src * data: blob:",
          "frame-src *",
          "font-src * data:",
          "connect-src *",
        ].join("; "),
      },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    // Don't return a "Proxy error" message that the user sees —
    // return a simple 502 so the player auto-switches to the next provider
    return new NextResponse("", { status: 502 })
  }
}
