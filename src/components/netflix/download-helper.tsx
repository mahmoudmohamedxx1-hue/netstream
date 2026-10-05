"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download, X, Copy, Check, Loader2, AlertCircle, Zap, Server,
  Terminal, FileVideo, HardDriveDownload, RefreshCw,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useLanguage } from "@/hooks/use-language"
import { addDownloadRecord } from "@/lib/download-history"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Download manager v2 — real, working downloads.
//
// Why the old version failed:
//   1. CORS — segments were fetched directly from provider CDNs with a custom
//      Referer header → preflight → blocked. Now every request goes through
//      /api/hls-proxy (same-origin), which also rewrites playlists.
//   2. Wrong AES-128 IV derivation (segment index vs media-sequence).
//   3. ffmpeg.wasm core fetched from unpkg.com at runtime (31 MB, flaky).
//      Now served locally from /public/ffmpeg.
//   4. Series detection scraped the (possibly proxied/encoded) player URL.
//      Now imdbId / type / season / episode are passed as explicit props.
//
// Two download modes:
//   • Fast in-browser — parallel segment fetch via proxy, AES-128 decryption,
//     fMP4 → real .mp4 streamed to disk (File System Access API when
//     available), TS → automatic ffmpeg.wasm remux to .mp4.
//   • Direct server download — /api/download-file streams the assembled file
//     with Content-Disposition, so the browser's native download manager
//     handles progress / pause / resume.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onClose: () => void
  imdbId: string
  type: "movie" | "series"
  season?: number
  episode?: number
  title: string
  poster?: string | null
}

type Variant = {
  url: string
  resolution: string
  quality: string
  bandwidth: string
  segmentCount: number
  estimatedBytes: number
  estimatedSize: string
  container: "fmp4" | "ts"
  aesKeyUrl: string | null
  aesIv: string | null
  mediaSequence: number
}

type SourceInfo = {
  success: boolean
  provider?: string
  m3u8Url?: string
  referer?: string
  variants?: Variant[]
  error?: string
}

type Phase = "idle" | "probing" | "ready" | "downloading" | "converting" | "done" | "error"

type ParsedClientPlaylist = {
  segments: string[]       // already-proxied URLs
  keyUrl: string | null    // already-proxied
  ivHex: string | null
  mediaSequence: number
  mapUrl: string | null    // already-proxied
}

const CONCURRENCY = 5

function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return "—"
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}

function fmtSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 ** 2) return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`
}

function fmtEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return `${m}m ${s}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function safeFilename(name: string): string {
  return (name || "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().substring(0, 80) || "video"
}

/** Parse an m3u8 that has already been rewritten by /api/hls-proxy. */
function parseProxiedPlaylist(text: string): ParsedClientPlaylist {
  const out: ParsedClientPlaylist = { segments: [], keyUrl: null, ivHex: null, mediaSequence: 0, mapUrl: null }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("#EXT-X-KEY")) {
      out.keyUrl = line.match(/URI="([^"]+)"/)?.[1] || null
      out.ivHex = line.match(/IV=0x([0-9a-fA-F]+)/)?.[1] || null
    } else if (line.startsWith("#EXT-X-MAP")) {
      out.mapUrl = line.match(/URI="([^"]+)"/)?.[1] || null
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
      out.mediaSequence = parseInt(line.split(":")[1], 10) || 0
    } else if (!line.startsWith("#")) {
      out.segments.push(line)
    }
  }
  return out
}

/** 16-byte big-endian sequence IV per the HLS spec (when IV attr is absent). */
function seqIv(seq: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(16)
  const dv = new DataView(iv.buffer)
  dv.setUint32(8, Math.floor(seq / 2 ** 32))
  dv.setUint32(12, seq >>> 0)
  return iv
}

function hexIv(hex: string): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(16)
  const clean = (hex.startsWith("0x") ? hex.slice(2) : hex).padStart(32, "0").slice(-32)
  for (let i = 0; i < 16; i++) iv[i] = parseInt(clean.substr(i * 2, 2), 16) || 0
  return iv
}

// File System Access API — stream to disk instead of holding the file in RAM
// (`writable` is part of the spec but missing from TS's lib.dom)
declare global {
  interface Window {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string
      types?: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }
  interface FileSystemFileHandle {
    writable: { getWriter: () => WritableStreamDefaultWriter }
  }
}

export function DownloadHelper({
  open, onClose, imdbId, type, season, episode, title, poster,
}: Props) {
  const { toast } = useToast()
  const { t, isArabic } = useLanguage()
  const [phase, setPhase] = useState<Phase>("idle")
  const [source, setSource] = useState<SourceInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState({ downloaded: 0, total: 0, speed: 0, eta: 0, segsDone: 0, segsTotal: 0 })
  const [statusText, setStatusText] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [savedAs, setSavedAs] = useState("")

  const cancelRef = useRef(false)
  const speedSamples = useRef<{ t: number; bytes: number }[]>([])

  const safeTitle = safeFilename(title)
  const suffix = type === "series" ? `.S${season ?? 1}E${episode ?? 1}` : ""

  // Record a finished (or failed) download in the persistent history —
  // shown in the Downloads panel. One line per lifecycle END, so in-flight
  // state never pollutes the list.
  const record = useCallback((
    status: "done" | "canceled" | "failed",
    o: { filename: string; container: "mp4" | "ts"; quality: string; bytes: number; mode: "browser"; error?: string }
  ) => {
    addDownloadRecord({
      imdbId, type, season: type === "series" ? (season ?? 1) : null,
      episode: type === "series" ? (episode ?? 1) : null,
      title, poster: poster ?? null,
      mode: "browser", status,
      container: o.container, quality: o.quality,
      bytes: o.bytes, sizeText: o.bytes > 0 ? fmtBytes(o.bytes) : "—",
      filename: o.filename, error: o.error,
    })
  }, [imdbId, type, season, episode, title, poster])

  // Server mode hands the file to the browser's native download manager —
  // we can't observe it from JS, so record honestly as "started".
  const recordServerStart = useCallback(() => {
    addDownloadRecord({
      imdbId, type, season: type === "series" ? (season ?? 1) : null,
      episode: type === "series" ? (episode ?? 1) : null,
      title, poster: poster ?? null,
      mode: "server", status: "started",
      container: "mp4", quality: "best",
      bytes: 0, sizeText: "—",
      filename: `${safeTitle}${suffix}.mp4`,
    })
  }, [imdbId, type, season, episode, title, poster, safeTitle, suffix])

  const serverDlUrl = () => {
    const p = new URLSearchParams({ imdbId, type, title: safeTitle, quality: "best" })
    if (type === "series") { p.set("season", String(season ?? 1)); p.set("episode", String(episode ?? 1)) }
    return `/api/download-file?${p.toString()}`
  }
  const m3u8CopyUrl = source?.m3u8Url || ""

  useEffect(() => {
    if (open) {
      setPhase("idle"); setSource(null); setError(""); setProgress(0)
      setStats({ downloaded: 0, total: 0, speed: 0, eta: 0, segsDone: 0, segsTotal: 0 })
      cancelRef.current = false
    }
  }, [open])

  // Esc to close — same guard as the X button: never close mid-download
  // (that would kill an in-flight segment fetch without cancel cleanup).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "downloading" && phase !== "converting") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, phase, onClose])

  // ── Step 1: probe sources ────────────────────────────────────────────────
  const probe = useCallback(async () => {
    setPhase("probing")
    setStatusText(t("dlProbing"))
    try {
      const p = new URLSearchParams({ imdbId, type })
      if (type === "series") { p.set("season", String(season ?? 1)); p.set("episode", String(episode ?? 1)) }
      const res = await fetch(`/api/download-movie?${p.toString()}`)
      const data: SourceInfo = await res.json()
      if (data.success && data.variants && data.variants.length > 0) {
        setSource(data)
        setPhase("ready")
      } else {
        setError(data.error || t("downloadNoSources"))
        setPhase("error")
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setPhase("error")
    }
  }, [imdbId, type, season, episode, t])

  // ── Step 2a: fast in-browser download ────────────────────────────────────
  const downloadInBrowser = useCallback(async (variant: Variant) => {
    if (!source?.referer) return
    cancelRef.current = false
    speedSamples.current = []
    setPhase("downloading")
    setProgress(0)
    setStats({ downloaded: 0, total: variant.estimatedBytes, speed: 0, eta: 0, segsDone: 0, segsTotal: variant.segmentCount })

    const isFmp4 = variant.container === "fmp4"
    const ext = isFmp4 ? "mp4" : "ts"
    const filename = `${safeTitle}${suffix}.${ext}`

    try {
      // 1. Fetch the media playlist through the proxy — it comes back with
      //    every segment / key URL already rewritten to same-origin paths.
      const proxiedPl = `/api/hls-proxy?url=${encodeURIComponent(variant.url)}&referer=${encodeURIComponent(source.referer)}&ext=m3u8`
      const plRes = await fetch(proxiedPl)
      if (!plRes.ok) throw new Error(`Playlist ${plRes.status}`)
      const pl = parseProxiedPlaylist(await plRes.text())
      if (pl.segments.length === 0) throw new Error("Empty playlist")

      setStats((s) => ({ ...s, segsTotal: pl.segments.length, total: variant.estimatedBytes }))

      // 2. AES-128 key (fetched via the already-proxied key URL)
      let aesKey: CryptoKey | null = null
      if (pl.keyUrl) {
        const keyRes = await fetch(pl.keyUrl)
        if (keyRes.ok) {
          const kb = await keyRes.arrayBuffer()
          if (kb.byteLength >= 16) {
            aesKey = await crypto.subtle.importKey("raw", kb.slice(0, 16), { name: "AES-CBC" }, false, ["decrypt"])
          }
        }
      }

      // 3. Where to write: File System Access API (streams to disk) or memory
      let fileWritable: WritableStreamDefaultWriter | null = null
      const memoryChunks: Uint8Array<ArrayBuffer>[] = []
      if (isFmp4 && typeof window !== "undefined" && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
          })
          fileWritable = handle.writable.getWriter()
        } catch (e) {
          // User dismissed the picker → treat as cancel
          if (e instanceof DOMException && e.name === "AbortError") {
            setPhase("ready"); return
          }
          fileWritable = null
        }
      }

      const writeChunk = async (chunk: Uint8Array<ArrayBuffer>) => {
        if (fileWritable) await fileWritable.write(chunk)
        else memoryChunks.push(chunk)
      }

      // fMP4: init segment (EXT-X-MAP) is the head of a valid MP4
      if (pl.mapUrl) {
        const mapRes = await fetch(pl.mapUrl)
        if (mapRes.ok) await writeChunk(new Uint8Array(await mapRes.arrayBuffer()))
      }

      // 4. Parallel fetch with in-order emission + retry
      const segs = pl.segments
      const results = new Map<number, Uint8Array<ArrayBuffer>>()
      let nextEmit = 0
      let cursor = 0
      let segsDone = 0
      let downloaded = 0
      let failed = 0
      const t0 = performance.now()

      const updateStats = (addBytes: number) => {
        downloaded += addBytes
        const now = performance.now()
        speedSamples.current.push({ t: now, bytes: downloaded })
        while (speedSamples.current.length > 24) speedSamples.current.shift()
        const first = speedSamples.current[0]
        const windowSec = Math.max(0.5, (now - first.t) / 1000)
        const speed = (downloaded - first.bytes) / windowSec
        const total = variant.estimatedBytes || downloaded * (segs.length / Math.max(1, segsDone))
        setStats({
          downloaded, total, speed,
          eta: speed > 0 ? (Math.max(0, total - downloaded)) / speed : 0,
          segsDone, segsTotal: segs.length,
        })
        setProgress(Math.min(97, Math.round((segsDone / segs.length) * (isFmp4 ? 100 : 80))))
      }

      const fetchSeg = async (idx: number): Promise<Uint8Array<ArrayBuffer> | null> => {
        for (let attempt = 0; attempt < 3 && !cancelRef.current; attempt++) {
          try {
            const res = await fetch(segs[idx])
            if (!res.ok) throw new Error(String(res.status))
            let buf = new Uint8Array(await res.arrayBuffer())
            if (buf.length === 0) throw new Error("empty")
            if (aesKey) {
              const iv = pl.ivHex ? hexIv(pl.ivHex) : seqIv(pl.mediaSequence + idx)
              try {
                buf = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, buf))
              } catch { /* keep raw on decrypt failure */ }
            }
            return buf
          } catch {
            if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
          }
        }
        return null
      }

      const worker = async () => {
        while (!cancelRef.current) {
          const idx = cursor++
          if (idx >= segs.length) return
          const buf = await fetchSeg(idx)
          segsDone++
          if (buf) {
            results.set(idx, buf)
            updateStats(buf.length)
            // emit in order
            while (results.has(nextEmit)) {
              const b = results.get(nextEmit)!
              results.delete(nextEmit)
              await writeChunk(b)
              nextEmit++
            }
          } else {
            failed++
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, segs.length) }, () => worker()))

      if (cancelRef.current) {
        try { await fileWritable?.abort() } catch {}
        setPhase("ready")
        record("canceled", { filename, container: isFmp4 ? "mp4" : "ts", quality: variant.quality, bytes: downloaded, mode: "browser" })
        toast({ title: t("dlCancelled") })
        return
      }

      if (nextEmit === 0 || (failed > 0 && failed >= Math.ceil(segs.length * 0.1))) {
        try { await fileWritable?.abort() } catch {}
        throw new Error(`${failed}/${segs.length} segments failed`)
      }

      // 5. Finish
      if (fileWritable) {
        await fileWritable.close()
        setSavedAs(filename)
        setProgress(100)
        setPhase("done")
        record("done", { filename, container: "mp4", quality: variant.quality, bytes: downloaded, mode: "browser" })
        toast({ title: t("dlDone"), description: `${filename} · ${fmtBytes(downloaded)}` })
        return
      }

      // Memory path (TS or no save-picker)
      setProgress(isFmp4 ? 100 : 85)
      const totalLen = memoryChunks.reduce((s, c) => s + c.length, 0)
      const assembled = new Uint8Array(totalLen)
      let off = 0
      for (const c of memoryChunks) { assembled.set(c, off); off += c.length }

      if (isFmp4) {
        // init + media segments = a complete MP4 — save directly
        saveBlob(assembled, filename)
        setSavedAs(filename)
        setPhase("done")
        record("done", { filename, container: "mp4", quality: variant.quality, bytes: totalLen, mode: "browser" })
        toast({ title: t("dlDone"), description: `${filename} · ${fmtBytes(totalLen)}` })
      } else {
        // TS → remux to MP4 with local ffmpeg.wasm
        setPhase("converting")
        setStatusText(t("dlConverting"))
        const mp4 = await remuxTsToMp4(assembled).catch(() => null)
        if (mp4) {
          saveBlob(mp4, `${safeTitle}${suffix}.mp4`)
          setSavedAs(`${safeTitle}${suffix}.mp4`)
          setProgress(100)
          setPhase("done")
          record("done", { filename: `${safeTitle}${suffix}.mp4`, container: "mp4", quality: variant.quality, bytes: mp4.length, mode: "browser" })
          toast({ title: t("dlDone"), description: `${safeTitle}${suffix}.mp4 · ${fmtBytes(mp4.length)}` })
        } else {
          saveBlob(assembled, filename)
          setSavedAs(filename)
          setProgress(100)
          setPhase("done")
          record("done", { filename, container: "ts", quality: variant.quality, bytes: totalLen, mode: "browser" })
          toast({ title: t("dlSavedTs"), description: `${filename} · ${fmtBytes(totalLen)}`, variant: "destructive" })
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase("error")
      try {
        record("failed", { filename: `${safeTitle}${suffix}`, container: isFmp4 ? "mp4" : "ts", quality: variant.quality, bytes: 0, mode: "browser", error: msg })
      } catch {}
      toast({ title: t("dlFailed"), description: msg, variant: "destructive" })
    }
  }, [source, safeTitle, suffix, t, toast, record])

  // ── TS → MP4 remux via local ffmpeg.wasm (no CDN dependency) ────────────
  const remuxTsToMp4 = async (ts: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg")
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    })
    ffmpeg.writeFile("input.ts", ts)
    await ffmpeg.exec(["-i", "input.ts", "-c", "copy", "-movflags", "+faststart", "output.mp4"])
    const data = await ffmpeg.readFile("output.mp4")
    return data as Uint8Array<ArrayBuffer>
  }

  const saveBlob = (data: Uint8Array<ArrayBuffer>, filename: string) => {
    const blob = new Blob([data], { type: filename.endsWith(".mp4") ? "video/mp4" : "video/mp2t" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
    toast({ title: isArabic ? "تم النسخ!" : "Copied!" })
  }

  const ytdlpCommand = `yt-dlp -o "${safeTitle}${suffix}.%(ext)s" "${m3u8CopyUrl || imdbId}"`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => { if (phase !== "downloading" && phase !== "converting") onClose() }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 16, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#161616] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir={isArabic ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {poster ? (
                   
                  <img src={poster} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                    <Download className="size-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white">{t("downloadHelper")}</h3>
                  <p className="truncate text-[11px] text-white/40">
                    {title}{type === "series" ? ` · S${season ?? 1}E${episode ?? 1}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (phase !== "downloading" && phase !== "converting") onClose() }}
                className="shrink-0 rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={phase === "downloading" || phase === "converting"}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 nf-scroll" dir={isArabic ? "rtl" : "ltr"}>
              {/* ── Phase: idle ── */}
              {phase === "idle" && (
                <div className="space-y-4">
                  <button
                    onClick={probe}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white transition hover:bg-primary/90 active:scale-[0.99]"
                  >
                    <Zap className="size-4" />
                    {t("dlGetSources")}
                  </button>
                  <p className="text-center text-[11px] leading-relaxed text-white/35">
                    {t("dlFastModeHint")}
                  </p>
                  {/* Server direct shortcut */}
                  <button
                    onClick={() => {
                      recordServerStart()
                      window.location.href = serverDlUrl()
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.07]"
                  >
                    <Server className="size-3.5" />
                    {t("dlServerMode")}
                  </button>
                </div>
              )}

              {/* ── Phase: probing ── */}
              {phase === "probing" && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span className="text-sm text-white/50">{statusText}</span>
                </div>
              )}

              {/* ── Phase: ready (quality list) ── */}
              {phase === "ready" && source?.variants && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                    {t("dlQualityOptions")}
                  </p>
                  {source.variants.map((v, i) => (
                    <div key={i} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                          <FileVideo className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-xs font-semibold text-white">{v.quality}</p>
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold",
                              v.container === "fmp4" ? "bg-emerald-500/20 text-emerald-400" : "bg-sky-500/20 text-sky-400"
                            )}>
                              {v.container === "fmp4" ? "MP4" : "TS"}
                            </span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{v.resolution}</span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-white/40">
                            {fmtBytes(v.estimatedBytes)} · {v.segmentCount} {t("dlSegments")}
                            {v.aesKeyUrl ? ` · AES-128` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => downloadInBrowser(v)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary/85"
                        >
                          <Zap className="size-3.5" />
                          {t("dlFastMode")}
                        </button>
                        <a
                          href={`/api/download-file?${new URLSearchParams({
                            imdbId, type, title: safeTitle, quality: v.quality,
                            ...(type === "series" ? { season: String(season ?? 1), episode: String(episode ?? 1) } : {}),
                          }).toString()}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-white/80 transition hover:bg-white/10"
                        >
                          <HardDriveDownload className="size-3.5" />
                          {t("dlServerMode")}
                        </a>
                      </div>
                    </div>
                  ))}
                  {source.variants[0]?.aesKeyUrl && (
                    <p className="flex items-center gap-1.5 text-[10px] text-white/30">
                      <AlertCircle className="size-3 shrink-0" /> {t("dlEncryptedAuto")}
                    </p>
                  )}
                  <button
                    onClick={probe}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/5 py-2 text-[11px] text-white/40 transition hover:bg-white/5 hover:text-white/70"
                  >
                    <RefreshCw className="size-3" /> {t("downloadRetry")}
                  </button>
                </div>
              )}

              {/* ── Phase: downloading / converting ── */}
              {(phase === "downloading" || phase === "converting") && (
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className={cn("size-4 animate-spin", phase === "converting" ? "text-emerald-400" : "text-primary")} />
                    <span className="text-xs font-semibold text-white/80">
                      {phase === "converting" ? statusText : `${t("dlDownloading")}…`}
                    </span>
                    <span className="ml-auto text-xs font-mono text-white/50">{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn("h-full rounded-full transition-all duration-300", phase === "converting" ? "bg-emerald-500" : "bg-primary")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {phase === "downloading" && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <p className="text-[9px] uppercase tracking-wide text-white/30">{t("downloadQuality")}</p>
                        <p className="mt-0.5 text-[11px] font-mono font-semibold text-white/80">
                          {fmtBytes(stats.downloaded)}{stats.total ? ` / ${fmtBytes(stats.total)}` : ""}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <p className="text-[9px] uppercase tracking-wide text-white/30">{t("dlSpeed")}</p>
                        <p className="mt-0.5 text-[11px] font-mono font-semibold text-white/80">{fmtSpeed(stats.speed)}</p>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <p className="text-[9px] uppercase tracking-wide text-white/30">{t("dlEta")}</p>
                        <p className="mt-0.5 text-[11px] font-mono font-semibold text-white/80">{fmtEta(stats.eta)}</p>
                      </div>
                    </div>
                  )}
                  {phase === "downloading" && stats.segsTotal > 0 && (
                    <p className="text-center text-[10px] text-white/30">
                      {stats.segsDone}/{stats.segsTotal} {t("dlSegments")}
                    </p>
                  )}
                  {phase === "downloading" && (
                    <button
                      onClick={() => { cancelRef.current = true }}
                      className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 transition hover:bg-white/5 hover:text-white/80"
                    >
                      {t("dlCancel")}
                    </button>
                  )}
                </div>
              )}

              {/* ── Phase: done ── */}
              {phase === "done" && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
                    <Check className="size-6 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">{t("dlDone")}</p>
                    <p className="mt-1 text-[11px] text-white/40">{savedAs}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="mt-1 rounded-lg bg-white/10 px-6 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    OK
                  </button>
                </div>
              )}

              {/* ── Phase: error ── */}
              {phase === "error" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <AlertCircle className="size-5 shrink-0 text-red-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-red-300">{t("dlFailed")}</p>
                      <p className="mt-1 break-words text-[11px] leading-relaxed text-red-200/60">{error}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={probe}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/20"
                    >
                      <RefreshCw className="size-3.5" /> {t("dlTryAgain")}
                    </button>
                    <a
                      href={serverDlUrl()}
                      onClick={recordServerStart}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                    >
                      <Server className="size-3.5" /> {t("dlServerMode")}
                    </a>
                  </div>
                </div>
              )}

              {/* ── Fallback options (when not actively downloading) ── */}
              {phase !== "downloading" && phase !== "converting" && phase !== "done" && (
                <>
                  <div className="my-4 border-t border-white/5" />
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                      {t("downloadManual")}
                    </p>
                    {m3u8CopyUrl && (
                      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                        <Terminal className="size-4 shrink-0 text-white/30" />
                        <input
                          readOnly value={m3u8CopyUrl}
                          className="min-w-0 flex-1 bg-transparent text-[11px] text-white/50 focus:outline-none"
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          onClick={() => copy(m3u8CopyUrl, "url")}
                          className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/20"
                        >
                          {copied === "url" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          {copied === "url" ? (isArabic ? "تم" : "Copied") : (isArabic ? "نسخ" : "Copy")}
                        </button>
                      </div>
                    )}
                    {m3u8CopyUrl && (
                      <div className="rounded-xl border border-white/5 bg-black/40 p-3">
                        <div className="flex items-center gap-2">
                          <Terminal className="size-3.5 shrink-0 text-emerald-400/60" />
                          <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-400/80" dir="ltr">
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
                    )}
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3">
                    <AlertCircle className="size-3.5 shrink-0 text-yellow-500/70" />
                    <p className="text-[10px] leading-relaxed text-yellow-500/60">
                      {t("downloadDisclaimer").replace("⚠ ", "")}
                    </p>
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
