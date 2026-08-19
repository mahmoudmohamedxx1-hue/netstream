"use client"

// Tracks playback "progress" for a title by measuring elapsed wall-clock time
// the player is open. We can't read the iframe's video.currentTime (cross-origin),
// so we use elapsed-time-vs-runtime as a proxy.
//
// Stores position (seconds), duration (seconds), and progress (0-100) separately.
// Progress is always calculated as: (position / duration) * 100

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

  // Duration in seconds — from runtimeMinutes, or default 90 min
  const duration = (runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : 90) * 60

  // Calculate progress from position and duration
  const calcProgress = (pos: number, dur: number): number => {
    if (!dur || dur <= 0 || !pos || pos <= 0) return 0
    const clampedPos = Math.min(pos, dur) // clamp position to duration
    return Math.min(100, Math.max(0, Math.round((clampedPos / dur) * 100)))
  }

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

  // Stop the timer and report final progress.
  // Returns the FINAL position (not the last interval position).
  const stop = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    // Calculate the FINAL position at the moment of stopping
    const finalPosition = Math.floor((Date.now() - startRef.current) / 1000)
    const finalProgress = calcProgress(finalPosition, duration)
    onProgressRef.current?.({ position: finalPosition, progress: finalProgress, duration })
    return { position: finalPosition, progress: finalProgress, duration }
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

  // Progress is always calculated from position / duration
  const progress = calcProgress(position, duration)

  return {
    position,
    progress,
    duration,
    stop: stop as () => { position: number; progress: number; duration: number }
  }
}
