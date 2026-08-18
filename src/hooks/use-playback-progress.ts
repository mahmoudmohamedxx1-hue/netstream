"use client"

// Tracks playback "progress" for a title by measuring elapsed wall-clock time
// the player is open. We can't read the iframe's video.currentTime (cross-origin),
// so we use elapsed-time-vs-runtime as a proxy. The `progress` (0-100) and
// `position` (seconds) are written to WatchHistory on close, and a Netflix-style
// red progress bar is rendered on Continue Watching cards.
//
// If `runtimeMinutes` is provided, progress is capped at 100% and scaled to
// runtime. If not, we treat 90 minutes as the default and show a softer bar.

import { useCallback, useEffect, useRef, useState } from "react"

type Opts = {
  imdbId: string
  runtimeMinutes?: number | null
  onProgress?: (info: { position: number; progress: number; duration: number }) => void
}

export function usePlaybackProgress({ imdbId, runtimeMinutes, onProgress }: Opts) {
  const [position, setPosition] = useState(0)
  const startRef = useRef<number>(Date.now())
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const duration = (runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : 90) * 60

  // (Re)start the timer whenever the title changes
  useEffect(() => {
    setPosition(0)
    startRef.current = Date.now()
    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
      setPosition(elapsed)
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [imdbId])

  // Stop the timer (e.g. when the player closes) and report final progress.
  // Returns the final position/progress/duration so callers can persist them.
  const stop = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
    const progress = Math.min(100, Math.round((elapsed / duration) * 100))
    onProgressRef.current?.({ position: elapsed, progress, duration })
    return { position: elapsed, progress, duration }
  }, [duration])

  // Pause/resume when the tab is hidden/visible — avoids over-counting
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      } else if (!document.hidden && !tickRef.current) {
        // Resume: shift startRef so elapsed doesn't include the hidden time
        startRef.current = Date.now() - position * 1000
        tickRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
          setPosition(elapsed)
        }, 1000)
      }
    }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [position])

  const progress = Math.min(100, Math.round((position / duration) * 100))

  return { position, progress, duration, stop: stop as () => { position: number; progress: number; duration: number } }
}
