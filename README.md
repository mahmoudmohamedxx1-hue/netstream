# 🎬 NetStream

A Netflix-style streaming platform built with Next.js 16, TypeScript, and Prisma. Stream movies and TV series via third-party providers, with a built-in download system — no browser extension required.

![Next.js](https://img.shields.io/badge/Next.js-16.1.3-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6.11-blue?logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)
![License](https://img.shields.io/badge/License-Educational-yellow)

---

## ✨ Features

### 🎥 Streaming
- **30+ streaming providers** — 2Embed, VidSrc, SmashyStream, MultiEmbed, and more
- **Arabic provider support** — EgyDead, EgyBest, Shahid4u, FaselHD with automatic scraping
- **Real-time server latency testing** — find the fastest provider automatically
- **Multiple quality variants** — HLS master playlist parsing (360p, 480p, 720p, 1080p)
- **Ad-block injection** — uBlock Origin Lite-style ad blocking built into the video proxy
- **Sandbox bypass** — automatically bypasses 2Embed's sandbox detection
- **Picture-in-Picture** — floating video player across tabs
- **Fullscreen mode** with keyboard shortcuts (R, N, T, F, Esc)

### ⬇️ Built-in Download System
- **No browser extension needed** — downloads happen entirely server-side
- **Multiple quality options** — each provider's HLS variants listed separately
- **Live file size fetching** — real-time size estimation per source (MP4 + HLS)
- **Embed mode** — extracts fresh video URL + downloads atomically (avoids token expiration)
- **HLS concatenation** — .m3u8 segments stitched into a single .ts file
- **Multiple servers** — MixDrop, VOE, StreamRuby, Morencius, HGCloud, VidSrc.Hair, Cineby, VidCore
- **yt-dlp command generation** — for advanced users

### 🌍 Bilingual Support
- **English & Arabic** with full RTL support
- **TMDB localized content** — titles, overviews, and genres fetched in the selected language
- **Language-aware caching** — separate cache entries per language
- **No hydration mismatch** — SSR-safe language loading

### 🎨 UI/UX
- **Netflix-style design** — hero banner, content rows, hover preview cards
- **Specular card animations** — red glow ring on hover (consistent across all pages)
- **React Bits components** — DecryptedText logo, GooeyNav navigation, CurvedLoop footer
- **Custom specular buttons** with shine effects
- **Responsive design** — mobile-first with touch-friendly controls
- **Dark mode** with next-themes
- **Custom scrollbar styling**

### 📊 Data & Metadata
- **TMDB integration** — real posters, backdrops, cast, trailers, similar titles
- **Curated catalog** — 250+ top-rated movies and series with real IMDB IDs
- **Watchlist** — save titles to "My List" (persisted in SQLite)
- **Continue Watching** — track playback progress across sessions
- **Provider reliability stats** — community-sourced working/broken reports
- **IMDB ID quick-launch** — paste any IMDB ID to play instantly

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 16 (App Router)                │
├──────────────┬──────────────┬───────────────────────────┤
│   Frontend   │   API Routes │     Shared Libraries      │
│              │              │                           │
│  React 19    │  /api/tmdb   │  video-extract.ts         │
│  Tailwind 4  │  /api/download│  (2Embed servers,        │
│  shadcn/ui   │  /api/extract│   Arabic search,         │
│  Framer      │  /api/arabic │   video extraction,      │
│  HLS.js      │  /api/2embed │   HLS parsing)           │
│              │  /api/video  │                           │
│              │  -proxy      │  vidsrc.ts (30+ providers)│
│              │              │  tmdb.ts (TMDB API)       │
├──────────────┴──────────────┴───────────────────────────┤
│              Prisma ORM + SQLite                         │
│  (Watchlist, History, ProviderStats)                    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Shared video extraction library** (`src/lib/video-extract.ts`) — All API routes import shared functions directly instead of making HTTP requests to each other. This works in both dev and production (serverless).

2. **Embed mode downloads** — The `/api/download?embed=...` endpoint extracts a fresh video URL and downloads it in a single atomic request, avoiding CDN token expiration.

3. **Live size fetching** — File sizes are fetched lazily per-source via `/api/download-info`, which extracts a fresh URL and HEADs it. Error page sizes (<1MB) are automatically filtered.

4. **HLS variant parsing** — Master playlists are parsed to list every quality variant (360p, 480p, 720p) as separate download options.

5. **SSR-safe i18n** — Language always starts as "en" on both server and client, then switches to the saved language after hydration via `useEffect`.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TMDB API key** (free at [themoviedb.org](https://developer.themoviedb.org/docs))

### Installation

```bash
# Clone the repository
git clone https://github.com/mahmoudmohamedxx1-hue/netstream.git
cd netstream

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env and add your TMDB API key (or use the built-in default)

# Initialize the database
bun run db:push

# Start the development server
bun run dev
```

Open `http://localhost:3000` in your browser.

### Production Build

```bash
# Build for production
bun run build

# Start the production server
bun run start
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=file:./db/custom.db
TMDB_API_KEY=your_tmdb_api_key_here  # Optional, has built-in default
```

### Build Configuration

The project uses **webpack** (not Turbopack) for production builds to reduce memory usage:

```json
{
  "build": "NODE_OPTIONS=\"--max-old-space-size=3072\" next build --webpack && ..."
}
```

### Provider Configuration

All streaming providers are defined in `src/lib/vidsrc.ts`. To add a new provider:

```typescript
{
  id: "newprovider",
  name: "New Provider",
  quality: "1080p",
  tier: 1,
  logo: "NP",
  color: "from-blue-500 to-cyan-600",
  mobile: true,
  region: "Global",
  buildMovie: (id) => `https://newprovider.com/embed/${id}`,
  buildSeries: (id, s, e) => `https://newprovider.com/embed/${id}/${s}/${e}`,
}
```

---

## 📁 Project Structure

```
netstream/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes
│   │   │   ├── 2embed-servers/     # Extract 2Embed server mirrors
│   │   │   ├── arabic-stream/      # Arabic site scraper
│   │   │   ├── download/           # Video download (MP4 + HLS)
│   │   │   ├── download-info/      # File size info
│   │   │   ├── extract-download/   # Find downloadable sources
│   │   │   ├── tmdb/               # TMDB API proxy
│   │   │   ├── video-proxy/        # Embed page proxy with ad-block
│   │   │   └── ...                 # 25+ API routes
│   │   ├── globals.css             # Global styles
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page
│   ├── components/
│   │   ├── netflix/                # Netflix-style components
│   │   │   ├── player-modal.tsx    # Video player with server selector
│   │   │   ├── download-helper.tsx # Download dialog with live sizes
│   │   │   ├── tmdb-home.tsx       # Home page with hero + rows
│   │   │   ├── title-detail.tsx    # Title detail page
│   │   │   └── ...
│   │   ├── ui/                     # shadcn/ui components (40+)
│   │   ├── specular/               # Custom specular buttons
│   │   └── react-bits/             # React Bits animations
│   ├── hooks/                      # React hooks
│   │   ├── use-language.ts         # Bilingual support (EN/AR)
│   │   ├── use-tmdb.ts             # TMDB data fetching
│   │   └── ...
│   └── lib/
│       ├── video-extract.ts        # Shared video extraction logic
│       ├── vidsrc.ts               # 30+ streaming providers
│       ├── tmdb.ts                 # TMDB API client
│       ├── movies-data.ts          # Curated catalog
│       └── ...
├── prisma/
│   └── schema.prisma               # Database schema
├── public/                         # Static assets
├── package.json
├── next.config.ts
└── Caddyfile                       # Gateway config
```

---

## 🎯 API Reference

### Streaming APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tmdb/home` | GET | Home page content (trending, popular, top rated) |
| `/api/tmdb/browse` | GET | Browse movies/series with pagination |
| `/api/tmdb/[imdbId]` | GET | Full title metadata (cast, trailer, similar) |
| `/api/video-proxy` | GET | Proxy embed pages with ad-block injection |

### Download APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/extract-download` | GET | Find all downloadable sources for a title |
| `/api/download` | GET | Download video (MP4 direct or HLS concatenation) |
| `/api/download-info` | GET | Get file size for a download source |
| `/api/2embed-servers` | GET | Extract 2Embed's server mirrors |

### Arabic Provider APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/arabic-stream` | GET | Search Arabic sites for video sources |
| `/api/arabic-search` | GET | Search Arabic sites for movie page URLs |

### User Data APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/watchlist` | GET/POST/DELETE | Manage user's watchlist |
| `/api/history` | GET/POST/DELETE | Manage continue watching history |
| `/api/provider-stats` | GET/POST | Provider reliability reports |

---

## 🔧 Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 16.1.3 | Full-stack framework (App Router) |
| **TypeScript** | 5.0 | Type-safe development |
| **Prisma** | 6.11 | Database ORM (SQLite) |
| **Tailwind CSS** | 4.0 | Utility-first styling |
| **shadcn/ui** | Latest | Component library (New York style) |
| **Framer Motion** | 12.x | Animations |
| **HLS.js** | 1.6 | HLS video playback |
| **Lucide Icons** | Latest | Icon system |
| **Caddy** | 2.x | Reverse proxy / gateway |

---

## ⚠️ Disclaimer

NetStream does **not** host any content. All streaming is provided by third-party embed providers (2Embed, VidSrc, etc.). This project is for **educational purposes only**. Downloading copyrighted content may be illegal in your country. You are responsible for complying with your local laws.

---

## 📄 License

This project is for educational use. All streaming content is provided by third-party providers. TMDB data is used under their API terms of service.

---

## 🙏 Acknowledgments

- **[TMDB](https://www.themoviedb.org/)** for movie/TV metadata and images
- **[2Embed](https://www.2embed.cc/)** for the streaming embed API
- **[shadcn/ui](https://ui.shadcn.com/)** for the component library
- **[React Bits](https://github.com/DavidHDev/react-bits)** for animation components
- **[ImZaw](https://github.com/ImZaw/cloudstream-extensions-arabic)** for Arabic provider scraping logic

---

<div align="center">
  <p>Made with ❤️ for movie lovers</p>
  <p>⭐ Star this repo if you found it useful!</p>
</div>
