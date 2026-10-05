import { NextRequest, NextResponse } from "next/server"

// GET /api/video-proxy?url=<embed-url>
//
// Proxies a provider's embed page with Kuro Ads Killer logic integrated.
// Based on https://github.com/KuroShonenJPN/Ads-Block
//
// The injected script:
// 1. Removes ad overlays, modals, popups (clicks close buttons, hides elements)
// 2. Removes ad iframes (doubleclick, googlesyndication, etc.)
// 3. Overrides window.open to block popunders
// 4. Runs a MutationObserver to catch dynamically added ads
// 5. Scans after user clicks (aggressive mode)
// 6. Does NOT break video players (checks for <video> before removing elements)

const AD_DOMAINS = [
  "doubleclick.net", "googleads.g.doubleclick.net", "googlesyndication.com",
  "google-analytics.com", "googletagmanager.com", "connatix.com",
  "popunder.net", "ads.exoclick.com", "exosrv.com",
  "popads.net", "propellerads.com", "adsterra.com",
  "juicyads.com", "trafficjunky.net", "hilltopads.com",
  "histats.com", "adskeeper.com", "syndication.exoclick.com",
  "main.exosrv.com", "a.realsrv.com", "syndication.realsrv.com",
  "taboola.com", "outbrain.com", "adnxs.com",
]

// Kuro Ads Killer content script — adapted for non-extension use
const KURO_ADS_SCRIPT = `
<script id="kuro-ads-killer">
(function() {
  // === CONFIG (all features ON) ===
  var config = {
    blockPopups: true,
    blockOverlays: true,
    blockTabs: true,
    blockIframes: true,
    aggressiveMode: true
  };

  // === SELECTORS ===
  var CLOSE_BUTTON_SELECTORS = [
    'button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]',
    'button[aria-label*="skip" i]', '[role="button"][aria-label*="close" i]',
    '[role="button"][aria-label*="dismiss" i]', '[title*="close" i]',
    '[title*="dismiss" i]', '.close', '.close-btn', '.close-button',
    '.btn-close', '.modal-close', '.popup-close', '.overlay-close',
    '.lightbox-close', '.interstitial-close', '.mfp-close'
  ];

  var OVERLAY_SELECTORS = [
    '[aria-modal="true"]', '[role="dialog"]',
    '[class*="popup" i]', '[id*="popup" i]',
    '[class*="modal" i]', '[id*="modal" i]',
    '[class*="overlay" i]', '[id*="overlay" i]',
    '[class*="lightbox" i]', '[id*="lightbox" i]',
    '[class*="backdrop" i]', '[id*="backdrop" i]',
    '[class*="interstitial" i]', '[id*="interstitial" i]'
  ];

  // === HELPERS ===
  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    var style = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
           style.opacity !== "0" && rect.width > 0 && rect.height > 0;
  }

  function isSafeToRemove(el) {
    if (!el || !(el instanceof Element)) return false;
    var tag = el.tagName.toLowerCase();
    if (["video","img","svg","canvas","iframe"].includes(tag)) return false;
    if (el.closest("video")) return false;
    if (el.querySelector("video")) return false;
    return true;
  }

  function isLikelyOverlay(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) return false;
    var style = window.getComputedStyle(el);
    if (style.position === "fixed" || style.position === "absolute") return true;
    return false;
  }

  // === BLOCK POPUPS — click close buttons ===
  function tryClickCloseButtons() {
    var clicked = false;
    for (var i = 0; i < CLOSE_BUTTON_SELECTORS.length; i++) {
      var buttons = document.querySelectorAll(CLOSE_BUTTON_SELECTORS[i]);
      for (var j = 0; j < buttons.length; j++) {
        if (isVisible(buttons[j]) && isSafeToRemove(buttons[j])) {
          try { buttons[j].click(); clicked = true; } catch(e) {}
        }
      }
    }
    return clicked;
  }

  // === BLOCK OVERLAYS — remove overlay elements ===
  function removeOverlayLikeElements() {
    var removed = false;
    for (var i = 0; i < OVERLAY_SELECTORS.length; i++) {
      var nodes = document.querySelectorAll(OVERLAY_SELECTORS[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (!isVisible(nodes[j])) continue;
        if (!isSafeToRemove(nodes[j])) continue;
        if (!isLikelyOverlay(nodes[j]) && !config.aggressiveMode) continue;
        try {
          nodes[j].style.setProperty("display","none","important");
          nodes[j].style.setProperty("visibility","hidden","important");
          nodes[j].style.setProperty("pointer-events","none","important");
          removed = true;
        } catch(e) {}
      }
    }
    return removed;
  }

  // === BLOCK AD IFRAMES ===
  function removeAdIframes() {
    var iframes = document.getElementsByTagName("iframe");
    var removed = false;
    for (var i = iframes.length - 1; i >= 0; i--) {
      var iframe = iframes[i];
      if (!isVisible(iframe)) continue;
      var src = (iframe.src || "").toLowerCase();
      var suspicious = src.includes("doubleclick") || src.includes("adservice") ||
        src.includes("googlesyndication") || src.includes("adnxs") ||
        src.includes("taboola") || src.includes("outbrain") ||
        src.includes("exoclick") || src.includes("popads") || src.includes("popunder");
      if (suspicious) { iframe.remove(); removed = true; }
    }
    return removed;
  }

  // === UNLOCK SCROLL ===
  function unlockScroll() {
    document.body.style.setProperty("overflow","auto","important");
    document.documentElement.style.setProperty("overflow","auto","important");
  }

  // === SCAN AND KILL ===
  function scanAndKill() {
    var didClick = tryClickCloseButtons();
    var removedOverlay = removeOverlayLikeElements();
    var removedIframes = removeAdIframes();
    if (didClick || removedOverlay || removedIframes) {
      unlockScroll();
    }
  }

  // === MUTATION OBSERVER — catch dynamically added ads ===
  var observer = new MutationObserver(function() { scanAndKill(); });
  observer.observe(document.documentElement || document.body, {
    childList: true, subtree: true, attributes: true
  });

  // === CLICK HANDLER — scan after user clicks (aggressive mode) ===
  document.addEventListener("click", function(e) {
    var target = e.target;
    if (target instanceof Element && (target.closest("video") || target.matches("video"))) return;
    setTimeout(scanAndKill, 80);
    setTimeout(scanAndKill, 250);
    setTimeout(scanAndKill, 600);
  }, true);

  // === BLOCK POPUNDERS — override window.open ===
  var origOpen = window.open;
  window.open = function(url) {
    if (url) {
      var urlStr = String(url).toLowerCase();
      var adPatterns = ["popunder","popads","exoclick","adsterra","propellerads",
        "doubleclick","googlesyndication","taboola","outbrain","adnxs","redirect"];
      for (var i = 0; i < adPatterns.length; i++) {
        if (urlStr.includes(adPatterns[i])) return null;
      }
    }
    // Allow non-ad popups (some players need them)
    return origOpen ? origOpen.apply(this, arguments) : null;
  };

  // === INITIAL SCAN ===
  scanAndKill();
  setTimeout(scanAndKill, 500);
  setTimeout(scanAndKill, 1500);
  setTimeout(scanAndKill, 3000);
})();
</script>
`

// CSS to hide ad elements
// Anti sandbox-false-positive script. 2embed.skin (and siblings) ship an
// isReallySandboxed() self-check that shows a "Sandbox not allowed / Remove
// sandbox" overlay when framed. The check false-positives on modern Chrome:
// `document.domain = document.domain` throws a TypeError since the setter was
// disabled, which their catch-block interprets as "we're sandboxed" — even
// with NO sandbox attribute anywhere. We neutralize the root cause by
// shadowing document.domain with a no-op setter BEFORE their scripts run, so
// every one of their checks passes naturally. (Only injected when the page
// actually contains the check — harmless for other providers.)
const SANDBOX_FIX_SCRIPT = `
<script id="netstream-sandbox-fix">
(function() {
  try {
    var host = location.hostname;
    Object.defineProperty(document, "domain", {
      configurable: true,
      get: function() { return host; },
      set: function() { /* no-op: modern browsers throw here — don't */ }
    });
  } catch (e) {}
})();
</script>
`

// JWplayer VAST ad stripper — many embed hosts (fastvip.space, MixDrop
// family, …) configure jwplayer with a VAST ad that blocks the video from
// starting (the player waits for the ad to resolve). We intercept the
// jwplayer global and drop the `advertising` block from every setup() call,
// so the real video starts immediately.
const JW_AD_STRIP_SCRIPT = `
<script id="jw-ad-strip">
(function() {
  var realJw;
  function wrap(fn) {
    var wrapped = function() {
      var player = fn.apply(this, arguments);
      try {
        if (player && typeof player.setup === "function") {
          var origSetup = player.setup.bind(player);
          player.setup = function(cfg) {
            if (cfg && typeof cfg === "object") {
              delete cfg.advertising;
              if (Array.isArray(cfg.tracks)) {
                cfg.tracks = cfg.tracks.filter(function(t) {
                  return t && t.kind !== "ad";
                });
              }
            }
            return origSetup(cfg);
          };
        }
      } catch (e) {}
      return player;
    };
    try {
      Object.keys(fn).forEach(function(k) { try { wrapped[k] = fn[k]; } catch (e) {} });
      if (fn.prototype) { wrapped.prototype = fn.prototype; }
    } catch (e) {}
    return wrapped;
  }
  var current = window.jwplayer;
  try {
    Object.defineProperty(window, "jwplayer", {
      configurable: true,
      get: function() { return current; },
      set: function(v) { current = typeof v === "function" ? wrap(v) : v; }
    });
    if (typeof current === "function") current = wrap(current);
  } catch (e) {}
})();
</script>
`

const AD_BLOCK_CSS = `
<style id="netstream-adblock">
  #sbxErr { display: none !important; }
  [id*="ad-"], [id*="ads-"], [class*="ad-"], [class*="ads-"],
  [id*="banner"], [class*="banner"], [id*="popunder"], [class*="popunder"],
  [id*="overlay-ad"], [class*="overlay-ad"],
  iframe[src*="doubleclick"], iframe[src*="googleads"], iframe[src*="exoclick"],
  iframe[src*="popads"], iframe[src*="adsterra"], iframe[src*="popunder"],
  .ad-banner, .ad-overlay, .ad-popup, #ad, #ads, .ad, .ads, .advert,
  #sbxErr, .ad-frame, .ad-slot,
  video, .jwplayer, .video-js, .vjs-tech, #videojs, #player, .player,
  .fluid-player, .fluid_video_wrapper, .p2play,
  { width: 100% !important; height: 100% !important; }
  body { margin: 0; padding: 0; background: #000; overflow: hidden; }
</style>
`

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("url")
  if (!embedUrl) return new NextResponse("url required", { status: 400 })

  // Optional referer — some video hosts only serve their embed page when the
  // linking site's referer is present (e.g. MyCima → fastvip.space).
  const referer = url.searchParams.get("referer")
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  }
  if (referer && /^https?:\/\//.test(referer)) {
    headers["Referer"] = referer
  }

  try {
    const res = await fetch(embedUrl, {
      headers, redirect: "follow", signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return new NextResponse(`HTTP ${res.status}`, { status: res.status })

    let html = await res.text()
    const finalUrl = res.url || embedUrl

    // 1. Strip ad scripts/iframes from known ad domains
    for (const domain of AD_DOMAINS) {
      const escaped = domain.replace(/\./g, "\\.").replace(/\//g, "\\/")
      html = html.replace(
        new RegExp(`<script[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></script>`, "gi"), ""
      )
      html = html.replace(
        new RegExp(`<iframe[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*></iframe>`, "gi"), ""
      )
    }

    // 2. Bypass 2Embed sandbox detection — two layers:
    //    a) replace the whole isReallySandboxed() function (anchored on the
    //       document.domain probe so the lazy match can't stop at a nested
    //       try-block and corrupt the script), and
    //    b) SANDBOX_FIX_SCRIPT below makes the domain probe a no-op anyway.
    html = html.replace(
      /function\s+isReallySandboxed\s*\(\)\s*\{[\s\S]*?document\.domain[\s\S]*?return false;\s*\n\s*\}/,
      "function isReallySandboxed() { return false; }"
    )

    // 2b. Strip host anti-embed traps: some video hosts (fastvip.space and
    // the StreamHG family) ship an inline "sandbox" checker plus an obfuscated
    // ad/anti-adblock loader (hg-plugin.js) that redirect the page to
    // /blocked.html when the embed runs outside the host's own origin.
    // Remove both — the player setup lives in a separate packed script.
    html = html.replace(
      /<script(?![^>]*\bsrc\b)[^>]*>(?:(?!<\/script>)[\s\S])*?blocked\.html[\s\S]*?<\/script>/gi,
      ""
    )
    html = html.replace(
      /<script[^>]+src=["'][^"']*hg-plugin\.js[^"']*["'][^>]*>\s*<\/script>/gi,
      ""
    )

    // 3. Inject Kuro Ads Killer script + CSS. The sandbox-fix script (no-op
    //    document.domain setter) is injected into EVERY proxied page, not just
    //    2embed's — VidLink / VidCore / VidFast ship the same legacy check
    //    (`document.domain = document.domain` → catch → "Please Disable
    //    Sandbox" overlay) inside lazily-loaded JS chunks, so it can't be
    //    pattern-matched in the HTML. Shadowing the setter before any script
    //    runs makes the probe a silent no-op for every provider.
    html = html.replace(/<head([^>]*)>/i, `<head$1>${SANDBOX_FIX_SCRIPT}${AD_BLOCK_CSS}${JW_AD_STRIP_SCRIPT}${KURO_ADS_SCRIPT}`)

    // 4. Add <base> tag
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${finalUrl}">`)

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
          "frame-src *", "font-src * data:", "connect-src *",
        ].join("; "),
      },
    })
  } catch {
    return new NextResponse("", { status: 502 })
  }
}
