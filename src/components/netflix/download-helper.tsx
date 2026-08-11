"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download,
  X,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Film,
  FileVideo,
  AlertCircle,
  Search,
  Terminal,
  Server,
  Globe,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  /** The embed URL currently loaded in the player iframe. */
  streamUrl: string
  title: string
  /** IMDB ID of the title (used to search Arabic sites). */
  imdbId: string
  /** movie | series */
  type: "movie" | "series"
  /** Currently selected provider ID (e.g. "2embed.cc" or "egydead"). */
  sourceId: string
  /** Season/episode for series. */
  season?: number
  episode?: number
}

type DownloadSource = {
  url: string
  type: "mp4" | "hls"
  host: string
  referer: string
  quality: string
  filename: string
  /** Embed page URL — when present, download uses /api/download?embed=... mode
   *  to extract + download atomically (avoids token expiration). */
  embedUrl?: string
  /** Which Arabic site this source was found on (e.g. "egydead", "shahid4u"). */
  arabicSite?: string
  /** File size in bytes (0 if unknown). */
  size?: number
  /** For HLS master playlists: which variant index to download (0=first, 1=second) */
  variantIndex?: number
}

// Format bytes as a human-readable string (e.g. "1.2 GB", "450 MB")
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB", "TB"]
  let unitIdx = 0
  let size = bytes
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024
    unitIdx++
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIdx]}`
}

// Check if a size is valid (not an error page). CDN HEAD requests sometimes
// return tiny sizes (like 548 bytes for a 403 error page) instead of the
// actual video size. We filter these out — real video files are at least 1MB.
function isValidVideoSize(bytes: number): boolean {
  return bytes > 1024 * 1024 // Must be at least 1MB to be a real video
}

// Sort sources by quality (1080p first, then 720p, then 480p, then SD)
function sortSourcesByQuality(sources: DownloadSource[]): DownloadSource[] {
  const qualityRank: Record<string, number> = {
    "1080p": 0,
    "720p": 1,
    "480p": 2,
    "SD": 3,
  }
  return [...sources].sort((a, b) => {
    const ra = qualityRank[a.quality] ?? 4
    const rb = qualityRank[b.quality] ?? 4
    if (ra !== rb) return ra - rb
    // Same quality — sort by host name for consistency
    return a.host.localeCompare(b.host)
  })
}

// Format the Arabic site name for display
function formatArabicSite(site?: string): string {
  if (!site) return ""
  const names: Record<string, string> = {
    egydead: "EgyDead",
    egybest: "EgyBest",
    shahid4u: "Shahid4u",
    faselhd: "FaselHD",
  }
  return names[site] || site
}

type ExtractState = {
  loading: boolean
  sources: DownloadSource[]
  provider: string
  providerId: string
  fallbackUrl: string | null
  error: string | null
}

export function DownloadHelper({
  open,
  onClose,
  streamUrl,
  title,
  imdbId,
  type,
  sourceId,
  season,
  episode,
}: Props) {
  const { t, isArabic } = useLang()
  const { toast } = useToast()
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [state, setState] = useState<ExtractState>({
    loading: false,
    sources: [],
    provider: "",
    providerId: "",
    fallbackUrl: null,
    error: null,
  })

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  // ─── Extract downloadable sources when the dialog opens ─────────────────
  // overrideSourceId lets us retry with a different provider (e.g. Arabic)
  // without changing the parent's sourceId state.
  const extractSources = useCallback(async (overrideSourceId?: string) => {
    const sid = overrideSourceId ?? sourceId
    // Defer the initial loading state to avoid set-state-in-effect warnings
    await Promise.resolve()
    setState({
      loading: true,
      sources: [],
      provider: "",
      providerId: sid,
      fallbackUrl: null,
      error: null,
    })
    try {
      const params = new URLSearchParams({
        imdbId,
        type,
        sourceId: sid,
        title,
      })
      if (season) params.set("season", String(season))
      if (episode) params.set("episode", String(episode))
      // 30-second timeout — Arabic provider extraction can take ~10s
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(`/api/extract-download?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json().catch(() => ({}))
      setState({
        loading: false,
        sources: data.sources ?? [],
        provider: data.provider ?? "",
        providerId: data.providerId ?? sid,
        fallbackUrl: data.fallbackUrl ?? null,
        error: data.success === false ? data.error ?? "No sources" : null,
      })
    } catch (e) {
      setState({
        loading: false,
        sources: [],
        provider: "",
        providerId: sid,
        fallbackUrl: streamUrl,
        error: e instanceof Error ? e.message : "Request failed",
      })
    }
  }, [imdbId, type, sourceId, title, season, episode, streamUrl])

  // ─── Retry with the Arabic provider (EgyDead) ────────────────────────────
  // EgyDead searches Arabic streaming sites and extracts direct MP4/HLS URLs
  // that CAN be downloaded server-side (unlike 2Embed which uses encrypted JS).
  const tryArabicProvider = useCallback(() => {
    extractSources("egydead")
  }, [extractSources])

  // ─── Auto-fallback to Arabic provider ────────────────────────────────────
  // When the regular provider (2Embed, etc.) finds no downloadable sources,
  // automatically try the Arabic provider (EgyDead) which can extract direct
  // MP4/HLS URLs. This makes the download "just work" without the user having
  // to manually click "Try Arabic provider".
  useEffect(() => {
    if (state.loading) return
    if (state.sources.length > 0) return
    if (state.providerId === "egydead") return // Already tried Arabic
    if (state.providerId === "") return // Haven't loaded yet
    // Regular provider found no sources — auto-try Arabic after a short delay
    const timer = setTimeout(() => {
      extractSources("egydead")
    }, 500)
    return () => clearTimeout(timer)
  }, [state.loading, state.sources.length, state.providerId, extractSources])

  // When the dialog opens, go STRAIGHT to the Arabic provider (EgyDead).
  // Regular providers (2Embed) use encrypted JS players that can't be extracted
  // server-side, so trying them first just wastes ~2 seconds before falling back.
  // Going straight to Arabic cuts the total wait time from ~15s to ~8s.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) extractSources("egydead")
    })
    return () => { cancelled = true }
  }, [open, extractSources])

  // ─── Build a /api/download URL for a source ──────────────────────────────
  // When the source has an embedUrl (Arabic providers), use embed mode so the
  // server extracts + downloads in one request (avoids token expiration).
  // Otherwise, use direct URL mode.
  const buildDownloadUrl = (src: DownloadSource): string => {
    const params = new URLSearchParams({
      filename: src.filename,
    })
    if (src.embedUrl) {
      // Embed mode: server will fetch the embed page, extract the video URL,
      // and download it atomically — no token expiration.
      params.set("embed", src.embedUrl)
      if (src.referer) params.set("referer", src.referer)
      // For HLS master playlists, pass the variant index so the server
      // downloads the correct quality variant.
      if (src.variantIndex !== undefined && src.variantIndex >= 0) {
        params.set("variant", String(src.variantIndex))
      }
    } else {
      // Direct URL mode: download the pre-extracted video URL directly.
      params.set("url", src.url)
      params.set("type", src.type)
      if (src.referer) params.set("referer", src.referer)
    }
    return `/api/download?${params}`
  }

  // ─── Trigger a download (native browser download) ────────────────────────
  // Uses a hidden iframe so the browser triggers a file download without
  // navigating away or opening a new tab. The server returns
  // Content-Disposition: attachment which forces the download dialog.
  const startDownload = (src: DownloadSource) => {
    const downloadUrl = buildDownloadUrl(src)
    // Create a hidden iframe to trigger the download. This avoids opening
    // a new tab and works reliably for large files (1GB+).
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = downloadUrl
    document.body.appendChild(iframe)
    // Remove the iframe after 60 seconds (download should have started by then)
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 60000)
    toast({ title: t("downloadStarted"), description: src.filename })
  }

  const copyUrl = (url: string, idx: number) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm nf-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl nf-scroll"
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 to-transparent px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">
                  {t("downloadBuiltIn")} — {title}
                </h2>
                <p className="text-xs text-white/50">
                  {t("downloadVideo")} · {state.provider || sourceId}
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5">
              {/* Loading state */}
              {state.loading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm font-semibold text-white">
                    {isArabic
                      ? "جارٍ البحث في المواقع العربية عن روابط التحميل…"
                      : "Searching Arabic sites for download links…"}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    EgyDead · EgyBest · Shahid4u · FaselHD
                  </p>
                  <p className="mt-2 text-[10px] text-white/30">
                    {isArabic ? "قد يستغرق ذلك 10 ثوانٍ" : "This may take ~10 seconds"}
                  </p>
                </div>
              )}

              {/* Sources found */}
              {!state.loading && state.sources.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-white">
                      {state.sources.length} {t("downloadSourcesFound")}
                    </span>
                    <span className="text-xs text-white/40">
                      · {sortSourcesByQuality(state.sources).map(s => s.quality).filter((v, i, a) => a.indexOf(v) === i).join(" / ")}
                    </span>
                  </div>
                  <div className="max-h-80 space-y-2.5 overflow-y-auto nf-scroll pr-1">
                    {sortSourcesByQuality(state.sources).map((src, i) => (
                      <SourceCard
                        key={i}
                        source={src}
                        onDownload={() => startDownload(src)}
                        downloadUrl={buildDownloadUrl(src)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No sources found */}
              {!state.loading && state.sources.length === 0 && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <h3 className="text-sm font-semibold text-white">
                      {t("downloadNoSources")}
                    </h3>
                  </div>
                  <p className="text-xs leading-relaxed text-white/60">
                    {t("downloadNoSourcesDesc")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => extractSources()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {t("downloadRetry")}
                    </button>
                    {/* Try Arabic provider automatically */}
                    {sourceId !== "egydead" && (
                      <button
                        onClick={tryArabicProvider}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/30"
                      >
                        <Film className="h-3.5 w-3.5" />
                        {isArabic ? "جرّب مزود عربي" : "Try Arabic provider"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Manual options */}
              {!state.loading && (state.fallbackUrl || state.sources.length > 0) && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Server className="h-4 w-4 text-white/50" />
                    <h3 className="text-sm font-semibold text-white">
                      {t("downloadManual")}
                    </h3>
                  </div>

                  {/* Show the embed/stream URL */}
                  {state.fallbackUrl && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
                        {t("downloadHost")}: {new URL(state.fallbackUrl).hostname}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-black/50 px-2 py-1.5 text-[11px] text-white/80">
                          {state.fallbackUrl}
                        </code>
                        <button
                          onClick={() => copyUrl(state.fallbackUrl!, 999)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                        >
                          {copiedIdx === 999 ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> {isArabic ? "تم" : "Copied"}
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> {t("downloadCopyUrl")}
                            </>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <a
                          href={state.fallbackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t("downloadOpenTab")}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* yt-dlp command — always show (uses direct URL if available,
                      otherwise the embed URL — yt-dlp can extract from both) */}
                  {(() => {
                    const ytUrl = state.sources[0]?.url || state.fallbackUrl
                    if (!ytUrl) return null
                    const ytCmd = `yt-dlp -o "${title}.%(ext)s" "${ytUrl}"`
                    return (
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
                          <Terminal className="h-3 w-3" />
                          {t("downloadYtDlp")}
                        </div>
                        <p className="mb-2 text-[11px] text-white/50">
                          {t("downloadYtDlpHint")}
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 overflow-x-auto rounded bg-black/50 px-2 py-1.5 text-[11px] text-green-400 nf-scroll">
                            {ytCmd}
                          </code>
                          <button
                            onClick={() => copyUrl(ytCmd, 998)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                          >
                            {copiedIdx === 998 ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Disclaimer */}
              <div className="rounded-md bg-yellow-500/10 p-3 text-[11px] leading-relaxed text-yellow-400/80">
                {t("downloadDisclaimer")}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Live size fetcher hook ────────────────────────────────────────────────
// Fetches the file size for a download source by calling /api/download-info
// which extracts a FRESH URL and HEADs it atomically (avoids token expiration).
// Returns: { size, loading, error }
function useLiveSize(source: DownloadSource) {
  const [size, setSize] = useState<number>(source.size ?? 0)
  const [loading, setLoading] = useState(!size || size <= 0)

  useEffect(() => {
    // If we already have a size, don't fetch
    if (source.size && source.size > 0) {
      return
    }
    // Need to live-fetch the size
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true)
    })
    const params = new URLSearchParams({
      embed: source.embedUrl || "",
      // Always use the Arabic site referer for fetching the embed page.
      // source.referer is the CDN referer (e.g. "https://mixdrop.ag") which
      // is used for the video URL, not the embed page.
      referer: "https://tv10.egydead.live/",
    })
    if (source.variantIndex !== undefined && source.variantIndex >= 0) {
      params.set("variant", String(source.variantIndex))
    }
    fetch(`/api/download-info?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setSize(data.size ?? 0)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSize(0)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [source.embedUrl, source.referer, source.variantIndex, source.size])

  return { size, loading }
}

// ─── Source card ────────────────────────────────────────────────────────────
function SourceCard({
  source,
  onDownload,
  downloadUrl,
}: {
  source: DownloadSource
  onDownload: () => void
  downloadUrl: string
}) {
  const { t } = useLang()
  const isMp4 = source.type === "mp4"
  const { size: liveSize, loading: sizeLoading } = useLiveSize(source)
  // Quality badge color: 1080p=green, 720p=blue, 480p=amber, SD=gray
  const qualityColor =
    source.quality === "1080p"
      ? "bg-green-500/15 text-green-400"
      : source.quality === "720p"
        ? "bg-blue-500/15 text-blue-400"
        : source.quality === "480p"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-white/10 text-white/60"
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.05]">
      <div
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full",
          isMp4 ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"
        )}
      >
        {isMp4 ? <Film className="h-5 w-5" /> : <FileVideo className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-white">{source.host}</p>
          {/* Quality badge */}
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", qualityColor)}>
            {source.quality}
          </span>
          {/* Type badge */}
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
              isMp4 ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"
            )}
          >
            {source.type}
          </span>
          {/* File size badge — live-fetched */}
          {sizeLoading ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/40">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ...
            </span>
          ) : isValidVideoSize(liveSize) ? (
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/70">
              {formatFileSize(liveSize)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-white/50">
          {source.type === "hls" ? "MPEG-TS" : "MP4"}
          {source.arabicSite && (
            <span className="text-white/30"> · via {formatArabicSite(source.arabicSite)}</span>
          )}
        </p>
      </div>
      {/* Primary download button — triggers hidden iframe download */}
      <button
        onClick={onDownload}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition",
          isMp4
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-blue-600 text-white hover:bg-blue-700"
        )}
      >
        <Download className="h-3.5 w-3.5" />
        {isMp4 ? t("downloadMp4") : t("downloadHls")}
      </button>
      {/* Direct link fallback — if the iframe download doesn't trigger,
          the user can right-click this link and "Save link as..." */}
      <a
        href={downloadUrl}
        download={source.filename + (isMp4 ? ".mp4" : ".ts")}
        className="shrink-0 rounded-md bg-white/10 px-2 py-2 text-white/60 transition hover:bg-white/20 hover:text-white"
        title="Direct download link (right-click → Save link as...)"
        aria-label="Direct download link"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
