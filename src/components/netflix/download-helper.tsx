"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, Copy, Check, Loader2, AlertCircle, Film,
  ExternalLink, Terminal, Server,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  streamUrl: string
  title: string
  sourceId: string
}

export function DownloadHelper({ open, onClose, streamUrl, title, sourceId }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)

  // Extract imdbId from the stream URL or props
  const imdbId = streamUrl.match(/(tt\d{7,8}|tmdb-\d+)/)?.[0] || ""
  const isSeries = streamUrl.includes("/tv/") || streamUrl.includes("season")

  const handleDownload = async (quality: string) => {
    setDownloading(true)
    const filename = `${safeTitle}.ts`
    const params = new URLSearchParams({
      imdbId,
      type: isSeries ? "series" : "movie",
      title: safeTitle,
      ...(isSeries ? { season: "1", episode: "1" } : {}),
    })
    
    toast({
      title: "Download starting...",
      description: `Fetching ${quality} from MoviesAPI server`,
    })

    try {
      const a = document.createElement("a")
      a.href = `/api/download-movie?${params}`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast({
        title: "Download started!",
        description: filename,
      })
    } catch {
      toast({
        title: "Download failed",
        description: "Could not start download. Try another method below.",
        variant: "destructive",
      })
    }
    setTimeout(() => setDownloading(false), 3000)
  }

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
    toast({ title: "Copied!" })
  }

  const ytdlpCommand = `yt-dlp -o "${safeTitle}.%(ext)s" "${streamUrl}"`

  const qualityOptions = [
    { label: "1080p", size: "~3 GB", desc: "Full HD" },
    { label: "720p", size: "~1.5 GB", desc: "HD" },
    { label: "480p", size: "~500 MB", desc: "SD" },
  ]

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
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20">
                  <Download className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Download</h3>
                  <p className="text-[10px] text-white/40 truncate max-w-[200px]">{title}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
              {/* Server Download — REAL working download */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Server Download (MoviesAPI)
                </p>
                {qualityOptions.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleDownload(opt.label)}
                    disabled={downloading}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20">
                      <Server className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-white">{opt.label}</p>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{opt.desc}</span>
                      </div>
                      <p className="text-[10px] text-white/40">{opt.size} · .ts file</p>
                    </div>
                    {downloading ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <Download className="size-4 text-white/40" />
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-white/5" />

              {/* Fallback: Open in new tab */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Fallback Options
                </p>
                <button
                  onClick={() => window.open(streamUrl, "_blank", "noopener,noreferrer")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06]"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/20">
                    <ExternalLink className="size-4 text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Open Provider Page</p>
                    <p className="text-[10px] text-white/40">Download manually from {sourceId}</p>
                  </div>
                  <ExternalLink className="size-4 text-white/40" />
                </button>
              </div>

              {/* Copy URL */}
              <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <Terminal className="size-4 shrink-0 text-white/30" />
                <input
                  readOnly
                  value={streamUrl}
                  className="min-w-0 flex-1 bg-transparent text-xs text-white/50 focus:outline-none"
                />
                <button
                  onClick={() => copy(streamUrl, "url")}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/20"
                >
                  {copied === "url" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </div>

              {/* yt-dlp */}
              <div className="rounded-xl border border-white/5 bg-black/40 p-3">
                <div className="flex items-center gap-2">
                  <Terminal className="size-3.5 shrink-0 text-emerald-400/60" />
                  <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-400/80">
                    {ytdlpCommand}
                  </code>
                  <button
                    onClick={() => copy(ytdlpCommand, "ytdlp")}
                    className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/20"
                  >
                    {copied === "ytdlp" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3">
                <AlertCircle className="size-3.5 shrink-0 text-yellow-500/70" />
                <p className="text-[10px] leading-relaxed text-yellow-500/60">
                  Downloading copyrighted content may be illegal in your country. For personal use only.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
