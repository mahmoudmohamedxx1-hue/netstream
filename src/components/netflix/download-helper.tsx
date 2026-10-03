"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, ExternalLink, Copy, Check, Loader2, Film, FileVideo,
  AlertCircle, Terminal, Server, Globe, Link2,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  streamUrl: string
  title: string
  imdbId: string
  type: "movie" | "series"
  sourceId: string
  season?: number
  episode?: number
}

type DownloadSource = {
  url: string
  type: "mp4" | "hls"
  host: string
  quality: string
  filename: string
  size?: number
}

export function DownloadHelper({ open, onClose, streamUrl, title, imdbId, type, sourceId, season, episode }: Props) {
  const { t: tr } = useLang()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<DownloadSource[]>([])
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    // Use microtask to avoid setState-in-effect warning
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setSources([])
      setCopied(false)
    })

    // Try to extract direct video URLs from the current provider
    const params = new URLSearchParams({
      imdbId, type, sourceId, title,
      ...(season ? { season: String(season) } : {}),
      ...(episode ? { episode: String(episode) } : {}),
    })

    fetch(`/api/extract-download?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        // Filter to only REAL direct video URLs (not embed page URLs)
        const real = (data?.sources ?? []).filter((s: any) => {
          const url = s.url || ""
          return url.includes(".m3u8") || url.includes(".mp4") ||
                 url.includes("/playlist/") || url.includes("/stream/")
        })
        if (real.length > 0) {
          setSources(real.map((s: any) => ({
            url: s.url, type: s.type || "mp4", host: s.host || "unknown",
            quality: s.quality || "Unknown", filename: s.filename || title,
            size: s.size || 0,
          })))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, imdbId, type, sourceId, title, season, episode])

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(streamUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: "URL copied!", description: "Paste it into yt-dlp or a download manager" })
  }

  const handleDownload = (source: DownloadSource) => {
    const filename = `${safeTitle}.${source.type === "hls" ? "ts" : "mp4"}`
    const params = new URLSearchParams({
      url: source.url,
      type: source.type,
      filename,
      referer: `https://${source.host}/`,
    })
    const downloadUrl = `/api/download?${params}`
    setDownloading(source.url)
    // Trigger download
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => setDownloading(null), 3000)
    toast({ title: "Download started", description: filename })
  }

  const handleServerDownload = () => {
    // Try embed mode — extracts + downloads in one request
    const filename = `${safeTitle}.ts`
    const params = new URLSearchParams({
      embed: streamUrl,
      filename,
      referer: `https://${sourceId}/`,
    })
    const downloadUrl = `/api/download?${params}`
    setDownloading("server")
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => setDownloading(null), 5000)
    toast({ title: "Server download started", description: "Extracting video from server..." })
  }

  const ytdlpCommand = `yt-dlp -o "${safeTitle}.%(ext)s" "${streamUrl}"`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20">
                  <Download className="size-4 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-white">Download</h3>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
              {/* Title */}
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Film className="size-3.5" />
                <span className="truncate">{title}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{sourceId}</span>
              </div>

              {/* Option 1: Direct sources (if found) */}
              {loading ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-xs text-white/50">Searching for download links...</span>
                </div>
              ) : sources.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                    Direct Download
                  </p>
                  {sources.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => handleDownload(src)}
                      disabled={downloading === src.url}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06] disabled:opacity-50"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20">
                        {src.type === "hls" ? <Server className="size-4 text-primary" /> : <FileVideo className="size-4 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">{src.quality} · {src.type.toUpperCase()}</p>
                        <p className="truncate text-[10px] text-white/40">{src.host}</p>
                      </div>
                      {downloading === src.url ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : (
                        <Download className="size-4 text-white/40" />
                      )}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Option 2: Server download (embed extraction) */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Server Download
                </p>
                <button
                  onClick={handleServerDownload}
                  disabled={downloading === "server"}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/20">
                    <Server className="size-4 text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Extract & Download</p>
                    <p className="text-[10px] text-white/40">Server extracts the video URL and downloads it</p>
                  </div>
                  {downloading === "server" ? (
                    <Loader2 className="size-4 animate-spin text-violet-400" />
                  ) : (
                    <Download className="size-4 text-white/40" />
                  )}
                </button>
              </div>

              {/* Option 3: Copy stream URL */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Stream URL
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <Link2 className="size-4 shrink-0 text-white/30" />
                  <input
                    readOnly
                    value={streamUrl}
                    className="min-w-0 flex-1 bg-transparent text-xs text-white/50 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyUrl}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/20"
                  >
                    {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Option 4: Open in new tab */}
              <div className="space-y-2">
                <button
                  onClick={() => window.open(streamUrl, "_blank", "noopener,noreferrer")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06]"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/20">
                    <ExternalLink className="size-4 text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Open in New Tab</p>
                    <p className="text-[10px] text-white/40">Download manually from the provider</p>
                  </div>
                  <ExternalLink className="size-4 text-white/40" />
                </button>
              </div>

              {/* Option 5: yt-dlp command */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  yt-dlp Command
                </p>
                <div className="rounded-xl border border-white/5 bg-black/40 p-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-3.5 shrink-0 text-white/30" />
                    <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-400/80">
                      {ytdlpCommand}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ytdlpCommand)
                        toast({ title: "Command copied!" })
                      }}
                      className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/20"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3">
                <AlertCircle className="size-3.5 shrink-0 text-yellow-500/70" />
                <p className="text-[10px] leading-relaxed text-yellow-500/60">
                  Downloading copyrighted content may be illegal in your country. This tool is for personal use of public-domain or freely-distributed content only.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
