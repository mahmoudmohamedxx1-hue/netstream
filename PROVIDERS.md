# NetStream — Streaming Providers

NetStream plays every movie & series by **IMDB ID** through a network of third‑party embed providers. The player (`src/components/netflix/player-modal.tsx`) lets the user switch providers from the **Server** dropdown, with mobile‑first providers shown at the top on phones.

This document lists **every provider** wired into `src/lib/vidsrc.ts`, grouped by tier, with the exact embed URL pattern, quality, mobile‑friendliness, and notes.

> **Total:** 24 providers — 6 primary · 3 backup · 6 advanced · 9 mobile‑first (including 3 Arabic).

---

## How providers work

Each provider is a function that takes an **IMDB ID** (e.g. `tt0111161`) and returns an embed URL. For series, the function also takes `season` and `episode` numbers. The player renders that URL in an `<iframe>`.

```ts
type VideoSource = {
  id: string                              // unique key used in the dropdown & state
  name: string                            // display name
  quality: string                         // "HD" | "1080p" | "Multi"
  tier: 1 | 2 | 3 | 4                     // grouping (primary / backup / advanced / mobile)
  logo: string                            // 1-2 char abbreviation shown in the logo badge
  color: string                           // tailwind gradient classes for the logo badge
  mobile: boolean                         // true = touch-friendly responsive embed UI
  region: "Global" | "Arabic" | "Indonesian"
  buildMovie: (imdbId: string) => string
  buildSeries: (imdbId: string, s: number, e: number) => string
}
```

### Default provider selection

| Platform | Default | Reason |
|---|---|---|
| Desktop | **VidSrc.net** | Fastest response (≈0.57 s), no sandbox checks, mobile responsive |
| Mobile (≤768 px) | **MoviesHub (vidsrc.me)** | Zero sandbox checks, touch‑friendly, works in the Android APK |

When the user picks a **Quality** from the dropdown, the player auto‑switches to the fastest provider that supports that quality (different providers for mobile vs desktop — see `sourceForQuality()` in `player-modal.tsx`).

### Logo badges

Every provider has a 1–2 character logo abbreviation rendered on a colored gradient. The logo is generated from the provider's `logo` and `color` fields — no external image assets required, so it loads instantly on mobile and works offline in the APK.

---

## Tier 1 — Primary servers (fast + reliable, <1 s response)

Shown by default in the dropdown. All six are mobile‑friendly.

| # | Logo | Provider | Quality | Region | Movie URL | Series URL |
|---|---|---|---|---|---|---|
| 1 | <span align="center">🟥 **VS**</span> | **VidSrc.net** | HD | Global | `https://vidsrc.net/embed/movie?imdb={id}` | `https://vidsrc.net/embed/tv?imdb={id}&season={s}&episode={e}` |
| 2 | <span align="center">🟧 **VS**</span> | **VidSrc.to** | 1080p | Global | `https://vidsrc.to/embed/movie/{id}` | `https://vidsrc.to/embed/tv/{id}/{s}-{e}` |
| 3 | <span align="center">🟩 **2E**</span> | **2Embed** (2embed.cc) | 1080p | Global | `https://www.2embed.cc/embed/{id}` | `https://www.2embed.cc/embedtv/{id}&s={s}&e={e}` |
| 4 | <span align="center">🟦 **2S**</span> | **2Embed.stream** | 1080p | Global | `https://2embed.stream/embed/{id}` | `https://2embed.stream/embedtv/{id}&s={s}&e={e}` |
| 5 | <span align="center">🟪 **SS**</span> | **SmashyStream** | Multi | Global | `https://embed.smashystream.com/playere.php?imdb={id}` | `…/playere.php?imdb={id}&season={s}&episode={e}` |
| 6 | <span align="center">🟪 **MH**</span> | **MoviesHub** (vidsrc.me) | HD | Global | `https://vidsrc.me/embed/movie?imdb={id}` | `https://vidsrc.me/embed/tv?imdb={id}&season={s}&episode={e}` |

**Notes:**
- **VidSrc.net** — fastest provider (~0.57 s), responsive on phones, no iframe sandbox blocks. **Default for desktop.**
- **MoviesHub (vidsrc.me)** — zero sandbox checks, smallest page weight, ideal for the Android APK. **Default for mobile.**
- **SmashyStream** — multi‑source scanner: opens a player that checks 6 upstream sources in parallel and lets the user pick the best one. Best fallback when other providers are down.
- **2Embed.cc** — reliable 1080p, occasionally shows an ad overlay first.

---

## Tier 2 — Backup servers

Revealed by clicking **+ More** in the dropdown.

| # | Logo | Provider | Quality | Region | Movie URL | Series URL |
|---|---|---|---|---|---|---|
| 7 | <span align="center">🟨 **VI**</span> | **VidSrc.in** | HD | Global | `https://vidsrc.in/embed/movie/{id}` | `https://vidsrc.in/embed/tv/{id}/{s}-{e}` |
| 8 | <span align="center">🟩 **2K**</span> | **2Embed.skin** | 1080p | Global | `https://www.2embed.skin/embed/movie?id={id}` | `https://www.2embed.skin/embed/tv?id={id}&s={s}&e={e}` |
| 9 | <span align="center">🟦 **VP**</span> | **VidSrc.pro** | HD | Global | `https://vidsrc.pro/embed/movie/{id}` | `https://vidsrc.pro/embed/tv/{id}/{s}-{e}` |

---

## Tier 3 — Advanced / multi‑source / regional

Revealed by clicking **+ More** in the dropdown.

| # | Logo | Provider | Quality | Region | Movie URL | Series URL |
|---|---|---|---|---|---|---|
| 10 | <span align="center">🟪 **VX**</span> | **VidSrc.xyz** | 1080p | Global | `https://vidsrc.xyz/embed/movie/{id}` | `https://vidsrc.xyz/embed/tv/{id}/{s}-{e}` |
| 11 | <span align="center">🟩 **AE**</span> | **AnyEmbed** | Multi | Global | `https://anyembed.xyz/embed/imdb-movie-{id}` | `https://anyembed.xyz/embed/imdb-tv-{id}-{s}-{e}` |
| 12 | <span align="center">🟨 **TJ**</span> | **Twojar** | HD | Global | `https://www.twojar.com/embed/{id}` | `https://www.twojar.com/tv/{id}/{s}/{e}` |
| 13 | <span align="center">🟥 **GO**</span> | **Gomo.to** | HD | Global | `https://gomo.to/movie/{id}` | `https://gomo.to/tv/{id}/{s}-{e}` |
| 14 | <span align="center">🟩 **NG**</span> | **NontonGo** | HD | 🇮🇩 Indonesian | `https://nonton.id/embed/{id}` | `https://nonton.id/embed/tv/{id}/{s}/{e}` |
| 15 | <span align="center">⬛ **SD**</span> | **SudoStream** | HD | Global | `https://sudostream.com/embed/movie/{id}` | `https://sudostream.com/embed/tv/{id}/{s}/{e}` |

---

## Tier 4 — Mobile‑first providers 📱

These providers serve embed pages with **large tap targets**, **no hover‑only controls**, and **responsive layouts that scale to phone widths**. They're shown at the **top** of the dropdown when the user is on a mobile device (≤768 px).

| # | Logo | Provider | Quality | Region | Movie URL | Series URL |
|---|---|---|---|---|---|---|
| 16 | <span align="center">🟥 **VC**</span> | **VidSrc.cc** (v2) | HD | Global | `https://vidsrc.cc/v2/embed/movie/{id}` | `https://vidsrc.cc/v2/embed/tv/{id}/{s}/{e}` |
| 17 | <span align="center">🟪 **ME**</span> | **MultiEmbed** | Multi | Global | `https://multiembed.mov/?video_id={id}` | `https://multiembed.mov/?video_id={id}&s={s}&e={e}` |
| 18 | <span align="center">🟦 **ES**</span> | **Embed.su** | 1080p | Global | `https://embed.su/embed/movie/{id}` | `https://embed.su/embed/tv/{id}/{s}/{e}` |
| 19 | <span align="center">🟩 **AE**</span> | **AutoEmbed** | Multi | Global | `https://autoembed.cc/embed/movie/{id}` | `https://autoembed.cc/embed/tv/{id}/{s}/{e}` |
| 20 | <span align="center">🟧 **2O**</span> | **2Embed.org** | 1080p | Global | `https://2embed.org/embed/{id}` | `https://2embed.org/embedtv/{id}&s={s}&e={e}` |
| 21 | <span align="center">🟪 **V⏵**</span> | **VidSrc.stream** | HD | Global | `https://vidsrc.stream/embed/movie?imdb={id}` | `https://vidsrc.stream/embed/tv?imdb={id}&season={s}&episode={e}` |

### Arabic / Regional mobile providers 🌍

Built for Arabic‑speaking users. Embed UIs are localized and tuned for low‑bandwidth mobile networks in MENA.

| # | Logo | Provider | Quality | Region | Movie URL | Series URL |
|---|---|---|---|---|---|---|
| 22 | <span align="center">🟩 **TR**</span> | **Trembed** | HD | 🌍 Arabic | `https://trembed.xyz/embed/movie/{id}` | `https://trembed.xyz/embed/tv/{id}/{s}/{e}` |
| 23 | <span align="center">🟨 **GM**</span> | **Gomoov** | HD | 🌍 Arabic | `https://gomoov.to/embed/movie/{id}` | `https://gomoov.to/embed/tv/{id}/{s}/{e}` |
| 24 | <span align="center">🟥 **AR**</span> | **ArabEmbed** | HD | 🌍 Arabic | `https://arabembed.xyz/embed/movie/{id}` | `https://arabembed.xyz/embed/tv/{id}/{s}/{e}` |

---

## Provider routing helpers

```ts
// All providers, in tier order
VIDEO_SOURCES              // 24 sources

// Grouped exports
PRIMARY_SOURCES            // tiers 1 + 2 (9 sources) — shown by default
ADVANCED_SOURCES           // tier 3 (6 sources) — behind "+ More"
MOBILE_SOURCES             // tier 4 (9 sources) — mobile-first & Arabic mobile
ARABIC_SOURCES             // any tier with region === "Arabic" (3 sources)

// Lookup
getSource(id)              // returns VideoSource by id (falls back to [0])
buildPlayerUrl(opts)       // builds the iframe URL for a given title+source
normalizeImdbId(raw)       // validates / coerces "0111161" → "tt0111161"
isValidImdbId(raw)
```

---

## Quality → Provider mapping

When the user picks a quality, the player auto‑switches provider. Mobile uses different providers than desktop so the embed stays touch‑friendly.

| Quality | Desktop | Mobile |
|---|---|---|
| Auto | VidSrc.net | VidSrc.net |
| 1080p | VidSrc.to | VidSrc.cc |
| 720p | 2Embed.cc | Embed.su |
| 480p | 2Embed.stream | VidSrc.stream |

---

## Server health check

Click the **Test** button (Activity icon) in the player controls to open the **Server Status** dialog. It pings every provider URL in parallel (8 s timeout, follows redirects) and shows:

- ✅ Green row = HTTP 2xx or 403 (403 means "blocks server‑side requests but works in a browser iframe")
- ❌ Red row = timeout or connection error
- The provider's logo badge, mobile flag 📱, and region tag (e.g. `ARABIC`)

Click any working server to switch instantly.

API endpoint: `GET /api/check-servers?imdbId={id}&type=movie|series&season={s}&episode={e}`

---

## Troubleshooting

### "Sandboxing is not allowed" / "Session verification failed"

Some providers (notably 2Embed.cc on certain titles) detect iframe embedding and refuse to play. **Fix:** click the **`Not playing? Open in tab`** button at the top‑left of the player, or use the **Open in new tab** button in the controls strip. The video plays in a full browser tab without iframe restrictions.

### Video stuck on loading spinner

The iframe `onLoad` event doesn't fire for cross‑origin embeds on mobile. NetStream auto‑hides the spinner after 5 seconds. If the spinner persists, switch the Server — the **Test** dialog shows which providers are currently responding.

### Pop‑up ads

⚠ Some providers (2Embed, VidSrc.xyz) show pop‑up ads. Use **uBlock Origin** in the browser, or the built‑in ad blocker in the NetStream Android APK WebView.

### Subtitles

Click the **Captions** button in the controls strip to open the subtitle helper. It searches **OpenSubtitles** by IMDB ID and groups results by language. Click any `.srt` to download — then load it in the player using the **CC** menu on the embed video itself (most providers support external subtitle tracks via the video element's track list).

---

## Adding a new provider

1. Open `src/lib/vidsrc.ts`.
2. Add a new entry to the appropriate tier array (`TIER_1`, `TIER_2`, `TIER_3`, or `TIER_4`).
3. Fill in all required fields: `id`, `name`, `quality`, `tier`, `logo` (1–2 chars), `color` (tailwind gradient classes), `mobile`, `region`, `buildMovie`, `buildSeries`.
4. Run `bun run lint` to verify.
5. Update this file (`PROVIDERS.md`) with the new entry in the appropriate table.
6. The provider automatically appears in:
   - The player's **Server** dropdown (in the tier's section)
   - The **Server Status** test dialog
   - The `/api/check-servers` response

---

*Last updated: 2025 — see `src/lib/vidsrc.ts` for the authoritative source.*
