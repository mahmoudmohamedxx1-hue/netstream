"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, ExternalLink, Copy, Check, Loader2, Film,
  AlertCircle, Terminal, Server, Link2, Monitor, Smartphone,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { VIDEO_SOURCES, type VideoSource } from "@/lib/vidsrc"

type Props = {
  open: boolean
  onClose: () => void
  streamUrl: string
  title: string
  sourceId: string
}

type QualityOption = {
  provider: VideoSource
  url: string
  quality: string
  estimatedSize: string
}

export function DownloadHelper({ open, onClose, streamUrl, title, sourceId }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)

  // Build quality options from available providers
  const qualityOptions: QualityOption[] = VIDEO_SOURCES
    .filter(s => s.tier < 5) // Only alive providers
    .slice(0, 10) // Top 10
    .map(s => {
      const url = s.useTmdbId
        ? streamUrl // TMDB providers use the same URL pattern
        : streamUrl.replace(sourceId, s.id) // Replace provider in URL
      // Estimate size based on quality (rough estimates for a 2hr movie)
      const sizeMap: Record<string, string> = {
        "1080p": "~3 GB",
        "720p": "~1.5 GB",
        "480p": "~500 MB",
        "HD": "~1.5 GB",
        "Multi": "~3 GB",
      }
      return {
        provider: s,
        url,
        quality: s.quality,
        estimatedSize: sizeMap[s.quality] || "~2 GB",
      }
    })

  const handleDownload = (option: QualityOption) => {
    const filename = `${safeTitle}.ts`
    const params = new URLSearchParams({
      embed: option.url,
      filename,
      referer: `https://${option.provider.id}/`,
    })
    setDownloading(option.provider.id)
    const a = document.createElement("a")
    a.href = `/api/download?${params}`
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => setDownloading(null), 5000)
    toast({
      title: "Download started",
      description: `${option.provider.name} · ${option.quality} · ${option.estimatedSize}`,
    })
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(streamUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: "URL copied!", description: "Paste into yt-dlp or a download manager" })
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
              {/* Quality options */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Download Options
                </p>
                {qualityOptions.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleDownload(option)}
                    disabled={downloading === option.provider.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold text-white",
                        option.provider.color
                      )}
                    >
                      {option.provider.logo}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-white">{option.provider.name}</p>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/70">
                          {option.quality}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/40">
                        {option.estimatedSize} · {option.provider.id}
                      </p>
                    </div>
                    {downloading === option.provider.id ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <Download className="size-4 text-white/40" />
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-white/5" />

              {/* Copy stream URL */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Manual Options
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

              {/* Open in new tab */}
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

              {/* yt-dlp */}
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
