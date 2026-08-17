# NetStream — Architecture & Change Log

> **Purpose:** This document describes the architecture of the NetStream streaming website and tracks all updates made and planned. It serves as the single source of truth for developers working on the project.

---

## I. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.3 |
| **Language** | TypeScript | 5.x |
| **Runtime** | Bun | 1.3.x |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) | — |
| **Database** | Prisma ORM + SQLite | 6.x |
| **State** | Zustand (client) + React Query (server) | — |
| **Animations** | Framer Motion | 12.x |
| **Icons** | Lucide React | — |
| **Auth** | NextAuth.js v4 (available, unused) | — |
| **Deployment** | Vercel / standalone Node | — |

---

## II. Project Structure

```
netstream/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout: fonts, metadata, LanguageProvider
│   │   ├── page.tsx            # Home page (Navbar + TmdbHome + BackupSites + Footer)
│   │   ├── globals.css         # Global styles: theme, scrollbars, animations
│   │   └── api/                # 30 API routes (see Section IV)
│   ├── components/
│   │   ├── netflix/            # Core streaming UI components
│   │   │   ├── navbar.tsx          # Fixed top nav (logo, GooeyNav, search, lang)
│   │   │   ├── tmdb-home.tsx       # TMDB-powered home (hero + content rows)
│   │   │   ├── hover-preview-card.tsx  # Card with hover popup (trailer, info)
│   │   │   ├── player-modal.tsx    # Full-screen player modal (iframe + controls)
│   │   │   ├── search-overlay.tsx  # Full-screen search with debounced TMDB
│   │   │   ├── footer.tsx          # Sticky footer (social, APK, backup links)
│   │   │   ├── poster.tsx          # Image with gradient fallback
│   │   │   ├── content-row.tsx     # Horizontal scroller with arrows
│   │   │   ├── row-scroll-buttons.tsx  # Semi-opaque scroll arrows
│   │   │   ├── title-detail.tsx    # Title detail page (cast, trailer, similar)
│   │   │   ├── episode-grid.tsx    # Episode selector for series
│   │   │   ├── download-helper.tsx # Download dialog
│   │   │   ├── subtitle-helper.tsx # Subtitle search/upload dialog
│   │   │   └── server-check.tsx    # Server health check dialog
│   │   ├── react-bits/         # Visual effect components
│   │   │   ├── DecryptedText.tsx   # Logo scramble animation
│   │   │   ├── GooeyNav.tsx        # Liquid morphing nav
│   │   │   └── CurvedLoop.tsx      # Curved scrolling text
│   │   └── ui/                 # shadcn/ui components (30+)
│   ├── lib/
│   │   ├── vidsrc.ts           # 40+ streaming provider definitions + URL builders
│   │   ├── tmdb.ts             # TMDB API client (posters, metadata, trailers)
│   │   ├── imdb.ts             # IMDb dataset search (local SQLite)
│   │   ├── movies-data.ts      # Curated catalog (~44 titles with real IMDB IDs)
│   │   ├── library-store.ts    # Zustand store (watchlist + history)
│   │   ├── lang-context.tsx    # Language provider (EN/AR with RTL)
│   │   ├── video-extract.ts    # Server-side video URL extraction (MixDrop, VOE)
│   │   └── db.ts               # Prisma client singleton
│   └── hooks/
│       ├── use-language.ts     # Translation strings (EN + AR)
│       ├── use-mobile.ts       # useIsMobile() hook (768px breakpoint)
│       ├── use-pip.ts          # Picture-in-Picture helper
│       ├── use-last-provider.ts # Per-title provider memory
│       └── use-playback-progress.ts # Watch progress tracking
├── prisma/
│   └── schema.prisma           # Watchlist, WatchHistory, ImdbTitle, ProviderStat
├── public/
│   ├── favicon.png             # 67KB favicon
│   ├── favicon-32.png          # 1.7KB small favicon
│   ├── NetStream.apk           # Android app
│   └── robots.txt              # SEO crawling rules
├── next.config.ts              # standalone output, strictMode, allowed origins
├── tsconfig.json               # ES2022 target, strict mode
├── Caddyfile                   # Gateway config (port 81 → 3000)
└── package.json
```

---

## III. Data Flow

### Home Page Load
```
User → / (page.tsx)
  → Navbar (fixed, transparent→solid on scroll)
  → TmdbHome
    → fetch /api/tmdb/home (trending, popular, top IMDB, Arabic)
    → Hero carousel (rotating backdrops + YouTube trailers)
    → Content rows (Continue Watching → My List → TMDB rows)
    → Each card: HoverPreviewCard (hover → popup with trailer + info)
  → BackupSites (4 mirror deployment links)
  → Footer (social, APK download, disclaimer)
```

### Movie Playback
```
User clicks card → openPlayer(title)
  → PlayerModal opens
    → fetch /api/provider-stats (per-title reliability, cached)
    → fetch /api/provider-latency (background, 10s timeout)
    → fetch /api/server-health (background, 3s per provider)
    → Auto-picks best provider (stats > health > tier-based)
    → iframe loads provider URL (vidsrc, 2embed, etc.)
    → User can switch provider via dropdown (50+ sources)
    → Watch progress reported to /api/history every 10s
```

### Search
```
User clicks search → SearchOverlay opens
  → Debounced (300ms) TMDB search
  → Parallel: /api/tmdb/search (titles) + /api/tmdb/search (people)
  → Results grid with keyboard navigation (↑↓ Enter Esc)
  → IMDB ID quick-launch panel (play by tt0111161)
  → Empty state: trending titles from TMDB
```

---

## IV. API Routes

| Route | Purpose | Cache |
|-------|---------|-------|
| `/api/tmdb/home` | Home page content (5 rows) | 1 hour (revalidate) |
| `/api/tmdb/browse` | Browse page (popular, trending, genre, recommendations) | 1 hour |
| `/api/tmdb/search` | TMDB search (titles, people) | — |
| `/api/tmdb/lookup` | TMDB ID → IMDB ID resolution | — |
| `/api/tmdb/[imdbId]` | Title metadata (genres, runtime, seasons) | — |
| `/api/server-health` | Tests all providers in parallel | 1 hour (in-memory) |
| `/api/provider-latency` | Provider response times | — |
| `/api/provider-stats` | Per-title provider reliability from DB | — |
| `/api/watchlist` | GET/POST/DELETE watchlist | — |
| `/api/history` | GET/POST/DELETE watch history | — |
| `/api/2embed-servers` | Extract 2Embed server mirrors | — |
| `/api/extract-video` | Extract direct video URL from embed | — |
| `/api/extract-download` | Server-side download with token refresh | — |
| `/api/arabic-search` | Search Arabic streaming sites | — |
| `/api/arabic-stream` | Extract Arabic video embed URLs | — |
| `/api/download` | Download video file (embed mode) | — |
| `/api/download-info` | Get file size before download | — |
| `/api/youtube-embed` | YouTube embed URL builder | — |
| `/api/imdb/[imdbId]` | Local IMDb dataset lookup | — |
| `/api/imdb/search` | Local IMDb title search | — |
| `/api/imdb/discover` | IMDb discover (popular, top rated) | — |
| `/api/titles/[imdbId]` | Title detail from local DB | — |
| `/api/titles/search` | Title search from local DB | — |
| `/api/titles/browse` | Browse titles from local DB | — |
| `/api/stream-video` | Stream video via server-side extraction | — |

---

## V. Streaming Provider Architecture

### Provider Tiers
- **Tier 1** (19 providers): Best — work in browser iframes, tested 2025
  - 2embed.cc, anyembed, vidsrc.me, vidsrc.in, smashystream, vidsrc.hair, vidlink.pro, videasy.net, vidfast.pro, vidjoy.pro, vidsrc.dev, vidsrc.io, vidsrc.cc, vixsrc.to, moviesapi.to, multiembed.mov, superembed, 111movies, vidsrc.to
- **Tier 2** (4 providers): Reliable backups
  - vidsrc.skin, vidsrc.pro, vidsrc.cc, multiembed.mov
- **Tier 3** (8 providers): Arabic / Regional (EgyDead, Shahid4u, FaselHD, etc.)
- **Tier 5** (16 providers): Dead/unverified (hidden by default, accessible via "Others" tab)

### Provider URL Pattern
All providers follow the `VideoSource` interface:
```typescript
{
  id: string           // unique identifier
  name: string         // display name
  buildMovie: (imdbId) => string   // movie embed URL
  buildSeries: (imdbId, season, episode) => string  // series embed URL
  tier: 1|2|3|5        // reliability tier
  mobile: boolean      // touch-friendly?
  region: "Global"|"Arabic"|"Indonesian"
}
```

### Health Check Logic
- `/api/server-health` tests all providers in parallel
- **3-second timeout** per provider (was 8s — reduced for faster UX)
- **403 treated as "ok"** — Cloudflare blocks server-side but works in browser iframes
- Results cached in-memory for 1 hour per imdbId
- Non-blocking: player loads immediately, health data updates dropdown when ready

---

## VI. Key Design Decisions

1. **Iframe-based playback** — All providers use iframe embeds (not direct video extraction). This avoids CORS issues, ad-injection from providers, and works universally.

2. **TMDB for metadata** — Posters, backdrops, trailers, genres, and cast all come from TMDB (free API). The API key has a hardcoded fallback for zero-config startup, but should be overridden via `TMDB_API_KEY` env var in production.

3. **Local IMDb dataset** — 11K titles imported from IMDb's public dataset into SQLite. Enables instant search and ID lookup without external API calls.

4. **Dual language (EN/AR)** — Full RTL support via `lang-context.tsx`. All UI strings in `use-language.ts`.

5. **Hover preview cards** — 1-second hover delay for regular rows, 3-second delay for Top IMDB rows (so users can read rank numerals). Popup shows trailer + genres + match percentage.

6. **Scroll-snap on rows** — `scroll-snap-type: x proximity` for gentle card alignment after swipe. Mobile arrows are fully visible (opacity 0.8) with `active:scale-95` press feedback.

7. **Backup site links** — 4 mirror deployment URLs at the bottom of the home page. If the main site is down, users can access mirrors.

---

## VII. Change Log

### Recent Updates (August 2026)

#### Commit `b7b3618` — Fix 7 audit issues
- ✅ Updated meta description (was outdated, referenced only vidsrc)
- ✅ Enabled `reactStrictMode: true` (was false)
- ✅ Removed duplicate `multiembed` provider entry
- ✅ Removed unused `User` and `Post` models from Prisma schema
- ✅ Fixed mobile search (navbar was too wide, search pushed off-screen)
- ✅ Removed dead `Hero` import from page.tsx
- ✅ Fixed all 15 TypeScript errors in src/ (regex flags, Variants types, null checks)
- ✅ Made server-health and provider-latency non-blocking (3s timeout, AbortSignal)

#### Commit `0f6d729` — Mobile touch scroll arrows
- ✅ Left arrow only appears when row is scrolled past start
- ✅ Mobile arrows fully visible (opacity 0.8, no hover needed)
- ✅ Wider touch targets (48px mobile, 40px desktop)
- ✅ `active:scale-95` press feedback

#### Commit `41e77df` — Semi-opaque scroll arrows
- ✅ Arrows visible at opacity 0.5 by default (was opacity 0)
- ✅ Fully visible (opacity 1.0) on hover

#### Commit `6c514ce` — Fix broken providers
- ✅ Fixed vidsrc.xyz → vidsrc.dev (DNS failed)
- ✅ Fixed vidsrc.stream → vidsrc.io (DNS failed)
- ✅ Fixed vidsrc.net → vidsrc.to (DNS failed)
- ✅ Moved 8 dead providers to tier 5
- ✅ 22/24 primary providers now working

#### Commit `24ae7b3` — Clean baseline + backup links
- ✅ Reset to clean 864c207 baseline (favicon + iframe players)
- ✅ Added 4 backup site links at bottom of home page
- ✅ Added `backupSites`/`backupSitesDesc` language strings (EN + AR)

#### Earlier commits
- ✅ Hover delay: 3s for Top IMDB rows, 1s for others
- ✅ Scrolling improvements: smooth page scroll, GPU compositing, scroll-snap
- ✅ Mobile view improvements: 44px touch targets, decluttered controls
- ✅ Stremio torrent stream browser (server-side webtorrent bridge)
- ✅ 50+ streaming providers from multiple sources
- ✅ TMDB integration for real posters and metadata
- ✅ Netflix-style hero carousel with YouTube trailers
- ✅ Continue Watching + My List with localStorage persistence
- ✅ Arabic + English language support with RTL
- ✅ Search overlay with debounced TMDB search + keyboard navigation

### Planned Future Updates
- [ ] Migrate images to `next/image` for WebP conversion + responsive sizing
- [ ] Add Zod input validation to all API routes
- [ ] Add rate limiting to API routes
- [ ] Add Content-Security-Policy header
- [ ] Add sitemap.xml + canonical URLs
- [ ] Add custom 404 and error boundary pages
- [ ] Add privacy policy + cookie consent banner
- [ ] Add GitHub social links (currently `href="#"`)
- [ ] Consolidate provider health endpoints (server-health + provider-latency + provider-stats → one endpoint)
- [ ] Remove 16 dead tier-5 providers if they stay down
- [ ] Fix footer social links to real profiles

---

## VIII. Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | `file:./db/custom.db` | SQLite database path |
| `TMDB_API_KEY` | No | Hardcoded fallback | TMDB API access (rotate the hardcoded key in production!) |

---

## IX. Deployment

### Development
```bash
bun run dev          # Start dev server on port 3000
bun run lint         # ESLint check
bun run db:push      # Push Prisma schema to SQLite
bun run db:generate  # Regenerate Prisma Client
```

### Production
```bash
bun run build        # Build standalone output
bun run start        # Start production server
```

### Gateway
- Caddy on port 81 routes to Next.js on port 3000
- `XTransformPort` query param for mini-services (e.g. `?XTransformPort=3031`)
- All API requests use relative paths only

---

## X. Security Notes

- ⚠️ **TMDB API key is hardcoded** in `src/lib/tmdb.ts` as a fallback. Remove and use env var in production.
- ⚠️ **No security headers** — Add HSTS, CSP, X-Frame-Options in `next.config.ts`
- ⚠️ **No input validation** on API routes — Add Zod schemas
- ⚠️ **No rate limiting** — Add `@upstash/ratelimit` or similar
- ✅ **No secrets in client code** — All API keys are server-side only
- ✅ **YouTube nocookie** — Trailer embeds use `youtube-nocookie.com`
- ✅ **SQLite local only** — No external database exposure

---

*Last updated: August 17, 2026*
