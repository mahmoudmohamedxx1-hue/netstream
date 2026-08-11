import { NextRequest, NextResponse } from "next/server"

// GET /api/video-proxy?url=<embed-url>&referer=<referer>
//
// Proxies a provider's embed page with:
// 1. The correct Referer header (so the provider serves the full page)
// 2. A bypass for 2Embed's isReallySandboxed() check (which falsely triggers
//    "Sandbox not allowed" in cross-origin iframes)
// 3. CSS to hide ad elements (no JS injection — JS was causing crashes)

const AD_DOMAINS = [
  "doubleclick.net", "googleads.g.doubleclick.net", "googlesyndication.com",
  "google-analytics.com", "googletagmanager.com", "connatix.com",
  "eyeota.net", "crwdcntrl.net", "dotomi.com", "everesttech.net",
  "dtscout.com", "mrktmtrcs.net", "dasdaily.com", "agl006.host",
  "goodimpressioncrboost.com", "manitobaboats.com", "bookmsg.com",
  "popunder.net", "ads.exoclick.com", "exosrv.com", "adsystem.com",
  "a-mo.net", "a.mrktmtrcs.net", "a.dtssrv.com", "tag-ab",
  "instream/ad_status", "ad_status.js", "tagivi.com",
]

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

    // 1. Strip ad scripts from known ad domains
    for (const domain of AD_DOMAINS) {
      const pattern = new RegExp(
        `<script[^>]*src=["'][^"']*${domain.replace(/\./g, "\\.")}[^"']*["'][^>]*></script>`,
        "gi"
      )
      html = html.replace(pattern, "")
    }

    // 2. Bypass 2Embed's sandbox detection:
    //    - Replace the isReallySandboxed function body with `return false;`
    //    - Replace `sbxErr.style.display = 'flex'` with `'none'`
    //    - Hide the #sbxErr overlay via CSS
    // The function is inline in 2Embed's HTML, so we can replace it directly.
    html = html.replace(
      /function\s+isReallySandboxed\s*\(\)\s*\{[\s\S]*?\n\s*\}/,
      "function isReallySandboxed() { return false; }"
    )
    html = html.replace(
      /sbxErr\.style\.display\s*=\s*['"]flex['"]/gi,
      "sbxErr.style.display = 'none'"
    )

    // 3. Inject CSS to hide ad elements + ad-blocking JS (like uBlock Origin Lite)
    //    Only block fetch/XHR to ad domains and hide ad elements via CSS.
    //    Do NOT override createElement or appendChild — that breaks the player.
    const injectedCSS = `
      <style id="netstream-adblock">
        #sbxErr { display: none !important; visibility: hidden !important; opacity: 0 !important; }
        [id*="ad-"], [id*="ads-"], [class*="ad-"], [class*="ads-"],
        [id*="banner"], [class*="banner"], [id*="popunder"], [class*="popunder"],
        [id*="overlay"], [class*="overlay-ad"], [class*="overdiv"],
        iframe[src*="doubleclick"], iframe[src*="googleads"], iframe[src*="connatix"],
        iframe[src*="popunder"], iframe[src*="dasdaily"], iframe[src*="adskeeper"],
        div[class*="ad-container"], div[id*="ad-container"],
        .ad-banner, .ad-overlay, .ad-popup, .adbd, #ad, #ads, .ad, .ads, .advert,
        #sbxErr, .dropdown { display: none !important; visibility: hidden !important;
          width: 0 !important; height: 0 !important; opacity: 0 !important; }
        video, .jwplayer, .video-js, .vjs-tech, #videojs, #iframesrc {
          width: 100% !important; height: 100% !important;
        }
        body { margin: 0; padding: 0; background: #000; overflow: hidden; }
      </style>
      <script>
        // uBlock Origin Lite-style ad blocking — block ad network requests
        (function() {
          var adPatterns = [
            /doubleclick/, /googleads/, /googlesyndication/, /connatix/,
            /popunder/, /adsystem/, /dtscout/, /histats/, /mrktmtrcs/,
            /dasdaily/, /adskeeper/, /rexsrv/, /agl006/, /crwdcntrl/,
            /eyeota/, /dotomi/, /everesttech/, /goodimpression/, /manitobaboats/,
            /bookmsg/, /exoclick/, /exosrv/, /tag_ab/, /tagivi/,
            /google-analytics/, /googletagmanager/, /popads/, /propellerads/,
            /adsterra/, /juicyads/, /trafficjunky/, /hilltopads/,
          ];
          // Block fetch requests to ad domains
          var origFetch = window.fetch;
          window.fetch = function(url, opts) {
            var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
            if (adPatterns.some(function(p) { return p.test(urlStr); })) {
              return Promise.reject(new Response('', { status: 403 }));
            }
            return origFetch.apply(this, arguments);
          };
          // Block XMLHttpRequest to ad domains
          var origOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (adPatterns.some(function(p) { return p.test(url); })) {
              arguments[1] = 'about:blank';
            }
            return origOpen.apply(this, arguments);
          };
        })();
      </script>
    `

    // Inject at the very beginning of <head> so it runs before 2Embed's scripts
    html = html.replace(/<head([^>]*)>/i, `<head$1>${injectedCSS}`)

    // Add <base> tag so relative URLs resolve correctly
    const baseTag = `<base href="${finalUrl}">`
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*",
        // Content Security Policy — blocks ad domains from loading
        // (similar to uBlock Origin Lite's declarativeNetRequest rules)
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
          "script-src * 'unsafe-inline' 'unsafe-eval'",
          "style-src * 'unsafe-inline'",
          "img-src * data: blob:",
          "media-src * data: blob:",
          "frame-src *",
          "font-src * data:",
          "connect-src *",
          // Block ad domains via frame-src and img-src restrictions
          // (CSP can't block script-src by domain with *, but we strip
          // ad scripts in the HTML above)
        ].join("; "),
      },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return new NextResponse(`Proxy error: ${error}`, { status: 500 })
  }
}
