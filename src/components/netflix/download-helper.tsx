"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, ExternalLink, Copy, Check, Terminal, AlertCircle,
  Film, FileVideo, Link2, Monitor, ChevronDown, ChevronUp,
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
  const [showGuide, setShowGuide] = useState(false)

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)
  const ytdlpCommand = `yt-dlp -o "${safeTitle}.%(ext)s" "${streamUrl}"`

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
    toast({ title: "Copied!" })
  }

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
              {/* Info banner */}
              <div className="flex items-start gap-2 rounded-xl border border-sky-500/10 bg-sky-500/5 p-3">
                <AlertCircle className="size-3.5 shrink-0 text-sky-500/70" />
                <p className="text-[10px] leading-relaxed text-sky-500/60">
                  Streaming providers load videos via JavaScript. Use one of the methods below to download.
                </p>
              </div>

              {/* Option 1: Open in new tab (most reliable) */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Method 1: Open & Download
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
                    <p className="text-[10px] text-white/40">Opens {sourceId} in a new tab — use the provider's download button or a browser extension</p>
                  </div>
                  <ExternalLink className="size-4 text-white/40" />
                </button>
              </div>

              {/* Option 2: yt-dlp (most powerful) */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Method 2: yt-dlp (Best Quality)
                </p>
                <div className="rounded-xl border border-white/5 bg-black/40 p-3 space-y-2">
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
                  <button
                    onClick={() => setShowGuide(!showGuide)}
                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60"
                  >
                    {showGuide ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {showGuide ? "Hide" : "Show"} setup guide
                  </button>
                  {showGuide && (
                    <div className="space-y-1 text-[10px] leading-relaxed text-white/50">
                      <p className="font-semibold text-white/70">Install yt-dlp:</p>
                      <p>• Windows: <code className="text-emerald-400/70">winget install yt-dlp</code></p>
                      <p>• Mac: <code className="text-emerald-400/70">brew install yt-dlp</code></p>
                      <p>• Linux: <code className="text-emerald-400/70">pip install yt-dlp</code></p>
                      <p className="mt-2 font-semibold text-white/70">Then paste the command above in your terminal.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Option 3: Copy stream URL */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Method 3: Copy URL
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <Link2 className="size-4 shrink-0 text-white/30" />
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
                <p className="text-[10px] text-white/30">
                  Paste into yt-dlp, IDM, or any download manager that supports HLS streaming.
                </p>
              </div>

              {/* Option 4: Browser extension recommendation */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Method 4: Browser Extension
                </p>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="size-3.5 text-white/40" />
                    <p className="text-xs font-semibold text-white">Video Downloader Extensions</p>
                  </div>
                  <div className="space-y-1 text-[10px] text-white/50">
                    <p>• <a href="https://chromewebstore.google.com/detail/video-downloadhelper/lmgijlmpgpefjffgnghhfonigfcknlej" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Video DownloadHelper</a> — detects videos on any page</p>
                    <p>• <a href="https://chromewebstore.google.com/detail/stream-recorder-download/hbcopbihchclgldldbcijnafgmccakm" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Stream Recorder</a> — downloads HLS streams</p>
                    <p>• <a href="https://chromewebstore.google.com/detail/coco-m3u8-downloader/ilcbhgiplnpnaknfhkjkeaoeoecipamh" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Coco M3U8 Downloader</a> — downloads m3u8 streams</p>
                  </div>
                  <p className="mt-2 text-[10px] text-white/30">
                    Install one, open the provider page (Method 1), then click the extension to download.
                  </p>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3">
                <AlertCircle className="size-3.5 shrink-0 text-yellow-500/70" />
                <p className="text-[10px] leading-relaxed text-yellow-500/60">
                  Downloading copyrighted content may be illegal in your country. This tool is for personal use only.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
