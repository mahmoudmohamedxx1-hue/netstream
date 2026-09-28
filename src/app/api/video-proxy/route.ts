import { NextRequest, NextResponse } from "next/server"

// GET /api/video-proxy?url=<embed-url>&referer=<referer>
//
// Proxies a provider's embed page with FULL ad-blocking that works across
// ALL platforms and devices (Vercel, Netlify, mobile, desktop, Smart TV).
//
// This restores the ad-blocking approach from commit 111e1c1 (the version
// that successfully blocked ads for 2+ weeks), with a critical fix:
// the fetch/XHR override now WHITELISTS video stream URLs (.m3u8, .mp4,
// .ts, .key) so it doesn't break the video player.

// ── Known ad domains — scripts/iframes from these are stripped ────────────
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
  #sbxErr { display: none !important; visibility: hidden !important; opacity: 0 !important; }
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
  [onclick*="window.open"], [onclick*="location.href"],
  a[href*="popunder"], a[href*="popads"], a[href*="exoclick"],
  a[href*="adsterra"], a[href*="propellerads"],
  video, .jwplayer, .video-js, .vjs-tech, #videojs, #iframesrc, #player, #playerWrap,
  .player, .player-container, .video-container, #vidplayer, #embedPlayer,
  .fluid-player, .fluid_video_wrapper, #fluid-player-elem,
  .p2play, .p2p-player, #p2p-player,
  { width: 100% !important; height: 100% !important; }
  body { margin: 0; padding: 0; background: #000; overflow: hidden; }
</style>
`

// ── JS ad-blocker — overrides fetch/XHR to block ad network requests ──────
// CRITICAL FIX: whitelists video stream URLs (.m3u8, .mp4, .ts, .key) so
// the video player can load its stream. Only blocks requests to KNOWN ad
// domains, not all requests.
const AD_BLOCK_JS = `
<script>
(function() {
  // Ad network hostname patterns — only these are blocked
  var adPatterns = [
    /doubleclick/, /googleads/, /googlesyndication/, /connatix/,
    /popunder/, /adsystem/, /dtscout/, /histats/, /mrktmtrcs/,
    /dasdaily/, /adskeeper/, /rexsrv/, /agl006/, /crwdcntrl/,
    /eyeota/, /dotomi/, /everesttech/, /goodimpression/, /manitobaboats/,
    /bookmsg/, /exoclick/, /exosrv/, /tag_ab/, /tagivi/,
    /google-analytics/, /googletagmanager/, /popads/, /propellerads/,
    /adsterra/, /juicyads/, /trafficjunky/, /hilltopads/,
    /realsrv/, /syndication\\.exosrv/, /syndication\\.realsrv/,
  ];
  // Video stream patterns — NEVER block these (they're the actual video)
  var videoPatterns = [/\\.m3u8/, /\\.mp4/, /\\.ts(?:\\?|$)/, /\\.key\\?/,
    /\\/stream\\//, /\\/hls\\//, /\\/dash\\//, /videoplayback/, /\\/video\\/];

  function isAdRequest(urlStr) {
    try {
      // If it's a video stream URL, never block it
      if (videoPatterns.some(function(p) { return p.test(urlStr); })) return false;
      // Check if the URL matches any ad pattern
      return adPatterns.some(function(p) { return p.test(urlStr); });
    } catch(e) { return false; }
  }

  // Override fetch — block ad requests, allow everything else
  try {
    var origFetch = window.fetch;
    window.fetch = function(url, opts) {
      var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
      if (isAdRequest(urlStr)) {
        return Promise.resolve(new Response('', { status: 403 }));
      }
      return origFetch.apply(this, arguments);
    };
  } catch(e) {}

  // Override XMLHttpRequest — block ad requests, allow everything else
  try {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        if (isAdRequest(url)) {
          arguments[1] = 'about:blank';
        }
      } catch(e) {}
      return origOpen.apply(this, arguments);
    };
  } catch(e) {}

  // Block window.open (popunders) — but only for ad URLs
  try {
    var origWindowOpen = window.open;
    window.open = function(url) {
      if (url && isAdRequest(String(url))) return null;
      // Allow non-ad popups (some players need them)
      return origWindowOpen ? origWindowOpen.apply(this, arguments) : null;
    };
  } catch(e) {}
})();
</script>
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
      return new NextResponse(`HTTP ${res.status}`, { status: res.status })
    }
    let html = await res.text()
    const finalUrl = res.url || embedUrl

    // 1. Strip ad scripts and iframes from known ad domains
    for (const domain of AD_DOMAINS) {
      const escaped = domain.replace(/\./g, "\\.").replace(/\//g, "\\/")
      const scriptPattern = new RegExp(
        `<script[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></script>`,
        "gi"
      )
      html = html.replace(scriptPattern, "")
      const iframePattern = new RegExp(
        `<iframe[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></iframe>`,
        "gi"
      )
      html = html.replace(iframePattern, "")
    }

    // 2. Bypass 2Embed's sandbox detection
    html = html.replace(
      /function\s+isReallySandboxed\s*\(\)\s*\{[\s\S]*?\n\s*\}/,
      "function isReallySandboxed() { return false; }"
    )
    html = html.replace(
      /sbxErr\.style\.display\s*=\s*['"]flex['"]/gi,
      "sbxErr.style.display = 'none'"
    )

    // 3. Inject ad-blocking CSS + JS at the start of <head>
    //    The JS overrides fetch/XHR to block ad network requests at runtime,
    //    while whitelisting video stream URLs (.m3u8, .mp4, .ts) so the
    //    video player can load its stream.
    html = html.replace(/<head([^>]*)>/i, `<head$1>${AD_BLOCK_CSS}${AD_BLOCK_JS}`)

    // 4. Add <base> tag so relative URLs resolve correctly
    const baseTag = `<base href="${finalUrl}">`
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*",
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
    return new NextResponse("", { status: 502 })
  }
}
