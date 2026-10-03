"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, Copy, Check, Loader2, AlertCircle,
  ExternalLink, Terminal, Server, Film, FileVideo,
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

type VariantInfo = {
  url: string
  resolution: string
  quality: string
  bandwidth: string
}

type DownloadInfo = {
  success: boolean
  m3u8Url: string
  variants: VariantInfo[]
  aesKeyUrl: string | null
  aesIv: string | null
  segmentCount: number
  estimatedSize: string
  referer: string
}

export function DownloadHelper({ open, onClose, streamUrl, title, sourceId }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState("")
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const cancelRef = useRef(false)

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80)
  const imdbId = streamUrl.match(/(tt\d{7,8}|tmdb-\d+)/)?.[0] || ""
  const isSeries = streamUrl.includes("/tv/") || streamUrl.includes("season")

  const fetchDownloadInfo = async () => {
    setLoading(true)
    setDownloadInfo(null)
    try {
      const params = new URLSearchParams({
        imdbId, type: isSeries ? "series" : "movie", title: safeTitle,
        ...(isSeries ? { season: "1", episode: "1" } : {}),
      })
      const res = await fetch(`/api/download-movie?${params}`)
      const data = await res.json()
      if (data.success) setDownloadInfo(data)
      else toast({ title: "Could not find download source", description: data.error, variant: "destructive" })
    } catch { toast({ title: "Failed to fetch download info", variant: "destructive" }) }
    finally { setLoading(false) }
  }

  const downloadVariant = async (variant: VariantInfo) => {
    if (!downloadInfo) return
    setDownloading(true)
    setProgress(0)
    setProgressText("Fetching playlist...")
    cancelRef.current = false

    try {
      // 1. Fetch variant playlist
      const plRes = await fetch(variant.url, { headers: { "Referer": downloadInfo.referer } })
      const playlist = await plRes.text()
      const base = new URL(variant.url)

      // 2. Parse segments + AES key
      let aesKey: ArrayBuffer | null = null
      const segments: string[] = []
      for (const line of playlist.split("\n")) {
        const trimmed = line.trim()
        if (trimmed.includes("#EXT-X-KEY") && trimmed.includes("AES-128")) {
          if (downloadInfo.aesKeyUrl) {
            const keyRes = await fetch(downloadInfo.aesKeyUrl, { headers: { "Referer": downloadInfo.referer } })
            aesKey = await keyRes.arrayBuffer()
          }
        }
        if (trimmed && !trimmed.startsWith("#")) {
          try { segments.push(new URL(trimmed, base).href) } catch { segments.push(trimmed) }
        }
      }

      // 3. Download all segments
      setProgressText(`Downloading 0/${segments.length} segments...`)
      const chunks: Uint8Array[] = []
      for (let i = 0; i < segments.length; i++) {
        if (cancelRef.current) break
        const segRes = await fetch(segments[i], { headers: { "Referer": downloadInfo.referer } })
        if (!segRes.ok) continue
        let segData = new Uint8Array(await segRes.arrayBuffer())

        // 4. Decrypt AES-128
        if (aesKey) {
          try {
            const key = await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["decrypt"])
            const iv = new Uint8Array(16)
            new DataView(iv.buffer).setUint32(12, i + 1)
            segData = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, segData))
          } catch {}
        }

        chunks.push(segData)
        setProgress(Math.round(((i + 1) / segments.length) * 80)) // 80% for download
        setProgressText(`Downloading ${i + 1}/${segments.length} segments...`)
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0))
      }

      if (cancelRef.current) { setDownloading(false); return }

      // 5. Concatenate
      setProgressText("Combining segments...")
      setProgress(85)
      const totalSize = chunks.reduce((s, c) => s + c.length, 0)
      const tsData = new Uint8Array(totalSize)
      let offset = 0
      for (const chunk of chunks) { tsData.set(chunk, offset); offset += chunk.length }

      // 6. Convert to MP4 using ffmpeg.wasm
      setProgressText("Converting to MP4...")
      setProgress(90)
      setFfmpegLoading(true)

      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg")
        const { fetchFile, toBlobURL } = await import("@ffmpeg/util")

        const ffmpeg = new FFmpeg()
        const coreURL = await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript")
        const wasmURL = await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm")
        await ffmpeg.load({ coreURL, wasmURL })

        // Write the .ts file to ffmpeg's virtual filesystem
        ffmpeg.writeFile("input.ts", tsData)

        // Remux .ts to .mp4 (stream copy — no re-encoding, very fast)
        setProgressText("Converting to MP4 (this may take a minute)...")
        await ffmpeg.exec(["-i", "input.ts", "-c", "copy", "-movflags", "+faststart", "output.mp4"])

        // Read the output .mp4
        const mp4Data = await ffmpeg.readFile("output.mp4")

        // 7. Download the MP4 file
        setProgressText("Saving MP4 file...")
        setProgress(100)
        const blob = new Blob([mp4Data], { type: "video/mp4" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${safeTitle}.mp4`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setProgressText(`Done! ${(blob.size / 1024 / 1024).toFixed(1)} MB MP4`)
        toast({ title: "Download complete!", description: `${safeTitle}.mp4 (${(blob.size / 1024 / 1024).toFixed(1)} MB)` })
      } catch (ffmpegError) {
        // If ffmpeg fails, fall back to .ts file
        console.error("ffmpeg conversion failed:", ffmpegError)
        setProgressText("Conversion failed, saving as .ts...")
        const blob = new Blob([tsData], { type: "video/mp2t" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${safeTitle}.ts`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast({ title: "Saved as .ts (conversion failed)", description: `${safeTitle}.ts`, variant: "destructive" })
      } finally {
        setFfmpegLoading(false)
      }
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
    toast({ title: "Copied!" })
  }

  const ytdlpCommand = `yt-dlp -o "${safeTitle}.%(ext)s" "${streamUrl}"`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !downloading && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
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
              <button onClick={() => !downloading && onClose()} className="text-white/40 hover:text-white disabled:opacity-30" disabled={downloading}>
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
              {/* Step 1: Find sources */}
              {!downloadInfo && !loading && (
                <button onClick={fetchDownloadInfo}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90">
                  <Server className="size-4" /> Find Download Sources
                </button>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span className="text-sm text-white/50">Finding download sources...</span>
                </div>
              )}

              {/* Step 2: Quality options */}
              {downloadInfo && !downloading && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                    Download as MP4 ({downloadInfo.segmentCount} segments · ~{downloadInfo.estimatedSize})
                  </p>
                  {downloadInfo.variants.map((v, i) => (
                    <button key={i} onClick={() => downloadVariant(v)}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06]">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20">
                        <FileVideo className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-white">{v.quality}</p>
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">MP4</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{v.resolution}</span>
                        </div>
                        <p className="text-[10px] text-white/40">{downloadInfo.estimatedSize} · MP4 video file</p>
                      </div>
                      <Download className="size-4 text-white/40" />
                    </button>
                  ))}
                  {downloadInfo.aesKeyUrl && (
                    <p className="text-[10px] text-white/30 flex items-center gap-1">
                      <AlertCircle className="size-3" /> AES-128 encrypted — decrypted + converted to MP4 automatically
                    </p>
                  )}
                </div>
              )}

              {/* Progress */}
              {downloading && (
                <div className="space-y-3 py-4">
                  <div className="flex items-center gap-2">
                    {ffmpegLoading ? <Loader2 className="size-4 animate-spin text-emerald-400" /> : <Loader2 className="size-4 animate-spin text-primary" />}
                    <span className="text-xs text-white/70">{progressText}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={cn("h-full transition-all duration-300", ffmpegLoading ? "bg-emerald-500" : "bg-primary")} style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-center text-[10px] text-white/30">{progress}%</p>
                  {!ffmpegLoading && (
                    <button onClick={() => { cancelRef.current = true; setDownloading(false) }}
                      className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:bg-white/5">
                      Cancel
                    </button>
                  )}
                </div>
              )}

              {/* Fallbacks */}
              {!downloading && (
                <>
                  {downloadInfo && <div className="border-t border-white/5" />}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">Fallback Options</p>
                    <button onClick={() => window.open(streamUrl, "_blank", "noopener,noreferrer")}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.06]">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/20"><ExternalLink className="size-4 text-sky-400" /></div>
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">Open Provider Page</p><p className="text-[10px] text-white/40">Download manually from {sourceId}</p></div>
                      <ExternalLink className="size-4 text-white/40" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <Terminal className="size-4 shrink-0 text-white/30" />
                    <input readOnly value={streamUrl} className="min-w-0 flex-1 bg-transparent text-xs text-white/50 focus:outline-none" />
                    <button onClick={() => copy(streamUrl, "url")} className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/20">
                      {copied === "url" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      {copied === "url" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/40 p-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="size-3.5 shrink-0 text-emerald-400/60" />
                      <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-400/80">{ytdlpCommand}</code>
                      <button onClick={() => copy(ytdlpCommand, "ytdlp")} className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/20">
                        {copied === "ytdlp" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3">
                    <AlertCircle className="size-3.5 shrink-0 text-yellow-500/70" />
                    <p className="text-[10px] leading-relaxed text-yellow-500/60">Downloading copyrighted content may be illegal in your country. For personal use only.</p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
