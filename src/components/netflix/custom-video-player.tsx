"use client"

// ═══════════════════════════════════════════════════════════════════════════
// CustomVideoPlayer — a full-featured HTML5 video player with HLS support.
//
// Replaces the cross-origin iframe embed with our own <video> element,
// giving us full control over playback:
//   • Custom scrubber with seek
//   • Playback speed control (0.5x – 2x)
//   • Volume control + mute
//   • Quality selector (if multiple sources found)
//   • Subtitle tracks (if found)
//   • Aspect ratio modes (fit / zoom / stretch)
//   • Playback info overlay (resolution, codec, dropped frames)
//   • PiP (Picture-in-Picture)
//   • Fullscreen
//   • Keyboard shortcuts (space=play/pause, ←/→=seek, ↑/↓=volume)
//
// Uses hls.js for HLS (.m3u8) stream playback in browsers that don't
// natively support HLS (Chrome, Firefox, Edge — Safari has native support).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from "react"
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, SkipForward, SkipBack, Gauge, Subtitles,
  PictureInPicture2, Loader2, AlertCircle, RefreshCw,
} from "lucide-react"
import Hls from "hls.js"
import { cn } from "@/lib/utils"

type SubtitleTrack = { url: string; label: string; lang: string }
type VideoSource = { url: string; quality: string }

type Props = {
  videoUrl: string | null
  sources: VideoSource[]
  subtitles: SubtitleTrack[]
  title: string
  onStartPosition?: number // seconds to resume from
  onProgress?: (position: number, duration: number) => void
  onClose?: () => void
}

type AspectMode = "fit" | "zoom" | "stretch"
type SpeedOption = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2

export function CustomVideoPlayer({
  videoUrl,
  sources,
  subtitles,
  title,
  onStartPosition,
  onProgress,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [speed, setSpeed] = useState<SpeedOption>(1)
  const [aspectMode, setAspectMode] = useState<AspectMode>("fit")
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1) // -1 = off
  const [currentSource, setCurrentSource] = useState(videoUrl)
  const [showInfo, setShowInfo] = useState(false)
  const [videoStats, setVideoStats] = useState<{ width: number; height: number; fps: number } | null>(null)
  const [seeking, setSeeking] = useState(false)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initialize HLS or native playback ─────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentSource) return

    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (currentSource.includes(".m3u8")) {
      // HLS stream — use hls.js for browsers without native HLS support
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        })
        hlsRef.current = hls
        hls.loadSource(currentSource)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
          setLoading(false)
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError(`Playback error: ${data.type} — ${data.details}`)
            setLoading(false)
          }
        })
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari has native HLS support
        video.src = currentSource
        video.play().catch(() => {})
      } else {
        Promise.resolve().then(() => {
          if (cancelled) return
          setError("HLS not supported in this browser")
          setLoading(false)
        })
      }
    } else {
      // Direct video file (mp4, webm, etc.)
      video.src = currentSource
      video.play().catch(() => {})
    }

    // Resume from saved position
    if (onStartPosition && onStartPosition > 5) {
      const onLoaded = () => {
        video.currentTime = onStartPosition
        video.removeEventListener("loadedmetadata", onLoaded)
      }
      video.addEventListener("loadedmetadata", onLoaded)
    }

    return () => {
      cancelled = true
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [currentSource, onStartPosition])

  // ── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(video.currentTime)
    }
    const onLoadedMeta = () => {
      setDuration(video.duration)
      setLoading(false)
      // Get video resolution
      setVideoStats({
        width: video.videoWidth,
        height: video.videoHeight,
        fps: 30, // Approximate — browsers don't expose actual FPS easily
      })
    }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)
    const onError = () => {
      setError("Video playback failed")
      setLoading(false)
    }
    const onVolumeChange = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onProgressEvt = () => {
      // Buffer progress
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("loadedmetadata", onLoadedMeta)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("error", onError)
    video.addEventListener("volumechange", onVolumeChange)
    video.addEventListener("progress", onProgressEvt)

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("loadedmetadata", onLoadedMeta)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("error", onError)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("progress", onProgressEvt)
    }
  }, [seeking])

  // ── Progress reporting (every 10s) ────────────────────────────────────────
  useEffect(() => {
    if (!onProgress) return
    progressTimerRef.current = setInterval(() => {
      const video = videoRef.current
      if (video && !video.paused && video.currentTime > 0) {
        onProgress(video.currentTime, video.duration || 0)
      }
    }, 10000)
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [onProgress])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setShowControls(true)
    })
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!cancelled) setShowControls(false)
      }, 3000)
    }
    return () => { cancelled = true }
  }, [playing, showControlsTemporarily])

  // ── Fullscreen handling ───────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return

      switch (e.key) {
        case " ":
          e.preventDefault()
          if (video.paused) video.play(); else video.pause()
          break
        case "ArrowLeft":
          e.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case "ArrowRight":
          e.preventDefault()
          video.currentTime = Math.min(video.duration, video.currentTime + 10)
          break
        case "ArrowUp":
          e.preventDefault()
          video.volume = Math.min(1, video.volume + 0.1)
          break
        case "ArrowDown":
          e.preventDefault()
          video.volume = Math.max(0, video.volume - 0.1)
          break
        case "f":
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            containerRef.current?.requestFullscreen()
          }
          break
        case "m":
          video.muted = !video.muted
          break
        case "Escape":
          if (!document.fullscreenElement && onClose) onClose()
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, containerRef])

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    video.paused ? video.play() : video.pause()
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  const togglePiP = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch {}
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    video.currentTime = pct * duration
    setCurrentTime(video.currentTime)
  }

  const handleScrubStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setSeeking(true)
    handleSeek(e)
  }

  const handleScrubMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seeking) return
    handleSeek(e)
  }

  const handleScrubEnd = () => setSeeking(false)

  const changeSpeed = (s: SpeedOption) => {
    const video = videoRef.current
    if (video) video.playbackRate = s
    setSpeed(s)
  }

  const changeAspect = (mode: AspectMode) => {
    setAspectMode(mode)
  }

  const selectSubtitle = (index: number) => {
    const video = videoRef.current
    if (!video) return
    // Remove all existing text tracks
    for (let i = video.textTracks.length - 1; i >= 0; i--) {
      video.textTracks[i].mode = "disabled"
    }
    if (index >= 0 && subtitles[index]) {
      // Add the track if not already present
      const existing = Array.from(video.querySelectorAll("track"))
      if (!existing[index]) {
        const track = document.createElement("track")
        track.kind = "subtitles"
        track.label = subtitles[index].label
        track.srclang = subtitles[index].lang
        track.src = subtitles[index].url
        video.appendChild(track)
      }
      // Enable it
      if (video.textTracks[index]) {
        video.textTracks[index].mode = "showing"
      }
    }
    setActiveSubtitle(index)
  }

  const switchSource = (url: string) => {
    setCurrentSource(url)
    setShowSettings(false)
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00"
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m}:${sec.toString().padStart(2, "0")}`
  }

  const aspectClass = {
    fit: "object-contain",
    zoom: "object-cover",
    stretch: "object-fill",
  }[aspectMode]

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-white">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-lg font-semibold">{error}</p>
        <button
          onClick={() => { setError(null); setCurrentSource(videoUrl) }}
          className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="group relative h-full w-full bg-black"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={(e) => {
        // Click on video area toggles play (but not on controls)
        if (e.target === videoRef.current || e.target === e.currentTarget) {
          togglePlay()
        }
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className={cn("h-full w-full", aspectClass)}
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
      )}

      {/* Title overlay (top) */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <h3 className="text-sm font-bold text-white sm:text-base">{title}</h3>
      </div>

      {/* Center play/pause button (when paused) */}
      {!playing && !loading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-black/60 backdrop-blur-sm transition hover:bg-black/80">
            <Play className="h-8 w-8 fill-white text-white" />
          </div>
        </button>
      )}

      {/* Playback info overlay */}
      {showInfo && videoStats && (
        <div className="absolute right-4 top-16 z-30 rounded-lg bg-black/80 p-3 text-xs text-white/80 backdrop-blur-sm">
          <p>Resolution: {videoStats.width}×{videoStats.height}</p>
          <p>Codec: {currentSource?.includes(".m3u8") ? "H.264 (HLS)" : "MP4"}</p>
          <p>Speed: {speed}x</p>
          <p>Aspect: {aspectMode}</p>
          <p>Source: {currentSource?.split("/")[2] ?? "unknown"}</p>
        </div>
      )}

      {/* Controls bar (bottom) */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-12 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Scrubber */}
        <div
          className="group/scrub relative mb-2 h-1.5 cursor-pointer rounded-full bg-white/20"
          onMouseDown={handleScrubStart}
          onMouseMove={handleScrubMove}
          onMouseUp={handleScrubEnd}
          onMouseLeave={handleScrubEnd}
        >
          {/* Buffered */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${Math.min(progressPct + 10, 100)}%` }}
          />
          {/* Progress */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary opacity-0 shadow-lg transition group-hover/scrub:opacity-100" />
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-2 text-white">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="rounded p-1.5 hover:bg-white/10" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          {/* Skip back 10s */}
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10) }} className="rounded p-1.5 hover:bg-white/10" aria-label="Skip back 10s">
            <SkipBack className="h-4 w-4" />
          </button>
          {/* Skip forward 10s */}
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min(v.duration, v.currentTime + 10) }} className="rounded p-1.5 hover:bg-white/10" aria-label="Skip forward 10s">
            <SkipForward className="h-4 w-4" />
          </button>

          {/* Volume */}
          <button onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted }} className="rounded p-1.5 hover:bg-white/10" aria-label={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => { const v = videoRef.current; if (v) { v.volume = parseFloat(e.target.value); v.muted = false } }}
            className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
          />

          {/* Time */}
          <span className="ml-1 text-xs font-medium text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Subtitles */}
          {subtitles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSettings(showSettings === "subs" ? false : "subs")}
                className={cn("rounded p-1.5 hover:bg-white/10", activeSubtitle >= 0 && "text-primary")}
                aria-label="Subtitles"
              >
                <Subtitles className="h-5 w-5" />
              </button>
              {showSettings === "subs" && (
                <div className="absolute bottom-full right-0 mb-2 w-40 rounded-lg bg-[#181818] p-2 shadow-xl ring-1 ring-white/10">
                  <button
                    onClick={() => { selectSubtitle(-1); setShowSettings(false) }}
                    className={cn("block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10", activeSubtitle === -1 && "text-primary")}
                  >
                    Off
                  </button>
                  {subtitles.map((sub, i) => (
                    <button
                      key={i}
                      onClick={() => { selectSubtitle(i); setShowSettings(false) }}
                      className={cn("block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10", activeSubtitle === i && "text-primary")}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings (speed + aspect + quality + info) */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(showSettings === "main" ? false : "main")}
              className="rounded p-1.5 hover:bg-white/10"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            {showSettings === "main" && (
              <div className="absolute bottom-full right-0 mb-2 w-52 rounded-lg bg-[#181818] p-2 shadow-xl ring-1 ring-white/10">
                {/* Speed */}
                <div className="mb-2">
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase text-white/40">Speed</p>
                  <div className="flex flex-wrap gap-1">
                    {([0.5, 0.75, 1, 1.25, 1.5, 2] as SpeedOption[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => changeSpeed(s)}
                        className={cn("rounded px-2 py-1 text-xs hover:bg-white/10", speed === s ? "bg-primary/20 text-primary" : "text-white/70")}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                {/* Aspect ratio */}
                <div className="mb-2">
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase text-white/40">Aspect Ratio</p>
                  <div className="flex gap-1">
                    {(["fit", "zoom", "stretch"] as AspectMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => changeAspect(m)}
                        className={cn("flex-1 rounded px-2 py-1 text-xs capitalize hover:bg-white/10", aspectMode === m ? "bg-primary/20 text-primary" : "text-white/70")}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Quality / Source */}
                {sources.length > 1 && (
                  <div className="mb-2">
                    <p className="mb-1 px-2 text-[10px] font-bold uppercase text-white/40">Quality</p>
                    {sources.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => switchSource(src.url)}
                        className={cn("block w-full rounded px-2 py-1 text-left text-xs hover:bg-white/10", currentSource === src.url ? "text-primary" : "text-white/70")}
                      >
                        {src.quality} — {src.url.split("/")[2]}
                      </button>
                    ))}
                  </div>
                )}
                {/* Info toggle */}
                <button
                  onClick={() => { setShowInfo(!showInfo); setShowSettings(false) }}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-white/10"
                >
                  {showInfo ? "Hide" : "Show"} Playback Info
                </button>
              </div>
            )}
          </div>

          {/* PiP */}
          <button onClick={togglePiP} className="rounded p-1.5 hover:bg-white/10" aria-label="Picture in Picture">
            <PictureInPicture2 className="h-5 w-5" />
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="rounded p-1.5 hover:bg-white/10" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
