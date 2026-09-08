"use client"

// ═══════════════════════════════════════════════════════════════════════════
// StremioPlayer — streams torrents directly in a native <video> element.
//
// Architecture:
//   1. Fetches torrent streams from Stremio addons (Torrentio, etc.)
//   2. User picks a stream (quality + seeders)
//   3. Requests /api/stremio-stream?infoHash=...&fileIdx=0 which proxies to
//      the torrent-stream mini-service (Node.js, port 3031)
//   4. The mini-service uses webtorrent in Node (TCP/UDP + uTP — NOT browser-
//      limited WebRTC) to download the torrent and stream the video file over
//      HTTP with Range request support (for seeking)
//   5. The browser plays it in a native <video> element with FULL controls:
//      play/pause, seek, volume, speed, PiP, fullscreen, download
//
// The mini-service caches torrents in-memory and prioritizes the requested
// byte range so seeking is fast. Torrents are destroyed after 10 min of
// inactivity.
//
// If the torrent has no seeders reachable from the server (rare for popular
// torrents), the user can fall back to the magnet link (opens in their torrent
// client) or the Stremio deep link.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from "react"
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Loader2, AlertCircle, Download, Gauge, SkipForward, SkipBack,
  PictureInPicture2, ChevronDown, Magnet, ExternalLink, Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Stream = {
  infoHash: string
  fileIdx: number
  name: string
  title: string
  quality: string
  size: string
  seeders: string
  filename: string
  sourceAddon: string
}

type Props = {
  imdbId: string
  type: "movie" | "series"
  season?: number
  episode?: number
  title: string
  onProgress?: (position: number, duration: number) => void
}

// Build the stream URL that proxies through our Next.js API to the
// torrent-stream mini-service. Using a relative URL + XTransformPort query
// param so the Caddy gateway routes it correctly.
function buildStreamUrl(infoHash: string, fileIdx: number): string {
  return `/api/stremio-stream?infoHash=${infoHash}&fileIdx=${fileIdx}`
}

function buildMagnet(infoHash: string, name?: string): string {
  const dn = name ? `&dn=${encodeURIComponent(name)}` : ""
  const trackers = [
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.btorrent.xyz",
    "wss://tracker.webtorrent.dev",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
  ]
  const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("")
  return `magnet:?xt=urn:btih:${infoHash}${dn}${tr}`
}

function buildStremioDeepLink(imdbId: string, type: "movie" | "series", season?: number, episode?: number): string {
  return type === "series"
    ? `stremio://${imdbId}:${season ?? 1}:${episode ?? 1}`
    : `stremio://${imdbId}`
}

export function StremioPlayer({ imdbId, type, season, episode, title, onProgress }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const metadataCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [streams, setStreams] = useState<Stream[]>([])
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showStreamList, setShowStreamList] = useState(false)
  const [peerStatus, setPeerStatus] = useState<{ peers: number; pct: number } | null>(null)

  // ── Fetch streams from Stremio addons ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) { setLoading(true); setError(null) }
    })
    const params = new URLSearchParams({ type })
    if (type === "series") {
      params.set("season", String(season ?? 1))
      params.set("episode", String(episode ?? 1))
    }
    fetch(`/api/stremio/${encodeURIComponent(imdbId)}?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setStreams(data.streams ?? [])
        setLoading(false)
        if (!data.streams?.length) {
          setError("No torrent streams found for this title. Try the embed players below.")
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [imdbId, type, season, episode])

  // ── Stream a torrent via the torrent-stream mini-service ──────────────────
  const startStream = useCallback(async (stream: Stream) => {
    setSelectedStream(stream)
    setShowStreamList(false)
    setConnecting(true)
    setError(null)
    setPlaying(false)
    setPeerStatus(null)

    // Stop any metadata polling
    if (metadataCheckRef.current) {
      clearInterval(metadataCheckRef.current)
      metadataCheckRef.current = null
    }

    try {
      // Ping the metadata endpoint first to trigger torrent discovery.
      // This returns once the torrent has metadata (or times out).
      const metaUrl = `/api/stremio-stream?infoHash=${stream.infoHash}&fileIdx=${stream.fileIdx}&metadata=1`
      const metaRes = await fetch(metaUrl, { cache: "no-store" })
      const meta = await metaRes.json().catch(() => ({}))

      if (meta.error) {
        // Provide a helpful error message based on the error type
        let errorMsg = meta.error
        if (/timed out|no seeders/i.test(meta.error)) {
          errorMsg = "No seeders reachable from the server after 60s. This torrent may have low seeder count. Try another quality or use the magnet link below."
        } else if (/offline|not responding/i.test(meta.error)) {
          errorMsg = "Torrent streaming service is offline. Use the magnet link below to open in your torrent app, or switch to the embed player."
        }
        setError(errorMsg)
        setConnecting(false)
        return
      }

      // Start polling for peer status while the video loads
      metadataCheckRef.current = setInterval(async () => {
        try {
          const r = await fetch(metaUrl, { cache: "no-store" })
          const d = await r.json().catch(() => ({}))
          if (d.ready) {
            setPeerStatus({ peers: d.numPeers ?? 0, pct: d.downloadedPct ?? 0 })
          }
        } catch {}
      }, 3000)

      // Set the video src to the stream endpoint — the browser's <video>
      // element will make Range requests for seeking.
      const video = videoRef.current
      if (!video) {
        setError("Video element not ready")
        setConnecting(false)
        return
      }
      const streamUrl = buildStreamUrl(stream.infoHash, stream.fileIdx)
      video.src = streamUrl
      video.load()
    } catch (e: any) {
      setError(`Failed to start stream: ${e.message}`)
      setConnecting(false)
    }
  }, [])

  // ── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => { setPlaying(true); setConnecting(false) }
    const onPause = () => setPlaying(false)
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onLoadedMeta = () => {
      setDuration(video.duration)
      setConnecting(false)
    }
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted) }
    const onWaiting = () => setConnecting(true)
    const onPlaying = () => setConnecting(false)
    const onError = () => {
      // Only show error if we actually have a src (not during initial load)
      if (video.src && selectedStream) {
        setError("Stream failed. The torrent may have no seeders reachable from the server. Try another quality or use the magnet link.")
        setConnecting(false)
      }
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("loadedmetadata", onLoadedMeta)
    video.addEventListener("volumechange", onVolumeChange)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("error", onError)

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("loadedmetadata", onLoadedMeta)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("error", onError)
    }
  }, [selectedStream])

  // ── Progress reporting ────────────────────────────────────────────────────
  useEffect(() => {
    if (!onProgress) return
    progressTimerRef.current = setInterval(() => {
      const video = videoRef.current
      if (video && !video.paused && video.currentTime > 0) {
        onProgress(video.currentTime, video.duration || 0)
      }
    }, 10000)
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current) }
  }, [onProgress])

  // ── Cleanup metadata polling on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      if (metadataCheckRef.current) clearInterval(metadataCheckRef.current)
    }
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const showControlsTemp = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) showControlsTemp() })
    return () => { cancelled = true }
  }, [playing, showControlsTemp])

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current
      if (!v) return
      switch (e.key) {
        case " ": e.preventDefault(); if (v.paused) v.play(); else v.pause(); break
        case "ArrowLeft": v.currentTime = Math.max(0, v.currentTime - 10); break
        case "ArrowRight": v.currentTime = Math.min(v.duration, v.currentTime + 10); break
        case "ArrowUp": v.volume = Math.min(1, v.volume + 0.1); break
        case "ArrowDown": v.volume = Math.max(0, v.volume - 0.1); break
        case "f": document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen(); break
        case "m": v.muted = !v.muted; break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (v) { if (v.paused) v.play(); else v.pause() }
  }
  const toggleFullscreen = () => {
    document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen()
  }
  const togglePiP = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {}
  }
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }
  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00"
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`
  }

  const stremioDeepLink = buildStremioDeepLink(imdbId, type, season, episode)

  // ── Loading state (fetching streams) ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-black p-4 text-center text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
        <p className="text-sm text-white/60">Finding streams from Stremio addons…</p>
        <p className="text-xs text-white/30">Querying Torrentio, KnightCrawler, Annatar & Comet</p>
      </div>
    )
  }

  // ── Error state (no streams) ──────────────────────────────────────────────
  if (error && !selectedStream && streams.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black p-4 text-center text-white">
        <AlertCircle className="h-10 w-10 text-white/30" />
        <p className="max-w-sm text-sm text-white/70">{error}</p>
      </div>
    )
  }

  // ── Stream picker (before playback starts) ────────────────────────────────
  if (!selectedStream && streams.length > 0) {
    return (
      <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a0a] to-black text-white">
        <div className="border-b border-white/10 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold sm:text-base">Select a stream — {streams.length} available</h3>
              <p className="mt-0.5 text-[11px] text-white/40 sm:text-xs">
                Stremio torrents · streamed via server-side webtorrent
              </p>
            </div>
            <a
              href={stremioDeepLink}
              className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/20 px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/30 sm:inline-flex"
              title="Open in Stremio desktop app"
            >
              <Play className="h-3 w-3 fill-current" /> Stremio App
            </a>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {streams.slice(0, 30).map((s, i) => {
            const is4K = /4k|2160/i.test(s.quality)
            const is1080 = /1080/i.test(s.quality)
            const seeders = parseInt(s.seeders) || 0
            return (
              <button
                key={`${s.infoHash}-${s.fileIdx}-${i}`}
                onClick={() => startStream(s)}
                className="flex w-full items-center gap-3 border-b border-white/5 p-3 text-left transition hover:bg-white/5 active:bg-white/10 sm:gap-3 sm:p-3.5"
              >
                <div className="flex w-12 shrink-0 justify-center sm:w-14">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-bold sm:text-[10px]",
                    is4K ? "bg-yellow-500/20 text-yellow-400" :
                    is1080 ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-white/10 text-white/60"
                  )}>{s.quality}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium sm:text-sm">{s.filename || s.title.split("\n")[0]}</p>
                  <p className="mt-0.5 text-[11px] text-white/40 sm:text-[10px]">
                    {s.size} · <span className={cn(
                      seeders > 100 ? "text-emerald-400/70" : seeders > 10 ? "text-yellow-400/70" : "text-red-400/70"
                    )}>👤 {s.seeders} seeders</span> · {s.sourceAddon}
                  </p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Video player ──────────────────────────────────────────────────────────
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="group relative h-full w-full bg-black"
      onMouseMove={showControlsTemp}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        onClick={togglePlay}
      />

      {/* Connecting / buffering indicator */}
      {connecting && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold text-white">
            {peerStatus ? `Connected to ${peerStatus.peers} peers` : "Connecting to torrent swarm…"}
          </p>
          {peerStatus && (
            <p className="text-xs text-white/50">
              Buffering: {peerStatus.pct}% downloaded · {selectedStream?.quality} · {selectedStream?.size}
            </p>
          )}
          {!peerStatus && (
            <p className="text-xs text-white/40">
              {selectedStream?.quality} · {selectedStream?.size} · {selectedStream?.filename || selectedStream?.title.split("\n")[0]}
            </p>
          )}
          <p className="mt-2 max-w-xs text-[11px] text-white/30">
            First load takes 10-30s while the server finds seeders. Subsequent seeks are instant.
          </p>
        </div>
      )}

      {/* Title bar */}
      <div className={cn(
        "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-3 transition-opacity sm:p-4",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{title}</h3>
          {streams.length > 1 && (
            <button
              onClick={() => setShowStreamList(true)}
              className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 sm:h-auto sm:py-1.5"
            >
              {selectedStream?.quality}
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Stream switcher dropdown */}
      {showStreamList && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setShowStreamList(false)} />
          <div className="absolute right-3 top-12 z-30 max-h-72 w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-white/15 bg-[#181818] p-2 shadow-2xl sm:right-4">
            {streams.slice(0, 20).map((s, i) => (
              <button
                key={i}
                onClick={() => startStream(s)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md p-2.5 text-left text-xs transition hover:bg-white/10 sm:p-2",
                  selectedStream?.infoHash === s.infoHash && "bg-primary/20"
                )}
              >
                <span className="w-10 shrink-0 text-center font-bold text-white/60">{s.quality}</span>
                <span className="min-w-0 flex-1 truncate text-white/80">{s.size} · {s.seeders} seeders</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Controls */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2 pt-12 transition-opacity sm:px-4 sm:pb-3",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Scrubber */}
        <div className="relative mb-2 h-2.5 cursor-pointer rounded-full bg-white/20 sm:h-1.5" onClick={handleSeek}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
        </div>
        {/* Buttons */}
        <div className="flex items-center gap-1 text-white sm:gap-2">
          <button onClick={togglePlay} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime -= 10 }} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label="Back 10 seconds">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10 }} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label="Forward 10 seconds">
            <SkipForward className="h-4 w-4" />
          </button>
          <button onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted }} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <span className="ml-1 text-xs text-white/80">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <div className="flex-1" />
          {/* Download button */}
          {selectedStream && (
            <a
              href={`/api/stremio-stream?infoHash=${selectedStream.infoHash}&fileIdx=${selectedStream.fileIdx}&download=1`}
              className="rounded p-2.5 hover:bg-white/10 sm:p-1.5"
              title="Download video file"
              aria-label="Download"
            >
              <Download className="h-5 w-5" />
            </a>
          )}
          {/* Speed */}
          <button
            onClick={() => {
              const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75]
              const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
              const v = videoRef.current; if (v) v.playbackRate = next
              setSpeed(next)
            }}
            className="flex items-center gap-1 rounded p-2.5 text-xs hover:bg-white/10 sm:p-1.5"
            aria-label={`Playback speed ${speed}x`}
          >
            <Gauge className="h-4 w-4" /><span className="hidden sm:inline">{speed}x</span>
          </button>
          <button onClick={togglePiP} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label="Picture in picture">
            <PictureInPicture2 className="h-5 w-5" />
          </button>
          <button onClick={toggleFullscreen} className="rounded p-2.5 hover:bg-white/10 sm:p-1.5" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Error overlay (during playback) */}
      {error && selectedStream && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90 p-4 text-center text-white">
          <AlertCircle className="h-10 w-10 text-red-400/60" />
          <p className="max-w-md text-sm text-white/80">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => { setError(null); setSelectedStream(null) }}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 sm:h-9"
            >
              <Play className="h-4 w-4" /> Try another stream
            </button>
            <a
              href={buildMagnet(selectedStream.infoHash, selectedStream.filename)}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 sm:h-9"
            >
              <Magnet className="h-4 w-4" /> Open Magnet
            </a>
            <a
              href={stremioDeepLink}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 sm:h-9"
            >
              <ExternalLink className="h-4 w-4" /> Stremio App
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
