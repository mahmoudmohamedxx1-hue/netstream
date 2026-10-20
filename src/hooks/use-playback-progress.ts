"use client"

// ═══════════════════════════════════════════════════════════════════════════
// usePlaybackProgress — tracks elapsed playback time as a proxy for
// video.currentTime.
//
// LIMITATION: The player uses a cross-origin iframe (vidsrc, 2embed, etc.).
// We CANNOT read iframe.contentWindow.video.currentTime due to same-origin
// policy. There is no postMessage API on these providers.
//
// Therefore, we measure WALL-CLOCK elapsed time (Date.now() delta) as a
// proxy for playback position. This is accurate when:
//   - The video is actually playing (not paused/buffering)
//   - The tab is visible (we pause the timer when hidden)
//
// The position (seconds), duration (seconds), and progress (0-100) are
// stored separately. Progress is always calculated as:
//   progress = (position / duration) * 100
//
// Saves happen via the onProgress callback:
//   - Every 15 seconds while playing
//   - On stop() (when the player closes)
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"

type Opts = {
  imdbId: string
  runtimeMinutes?: number | null
  /** Saved playback position (seconds) to RESUME from — the wall-clock timer
   *  starts pre-seeded at this value so the reported position (and the
   *  IndexedDB record) continues from where the user left off instead of
   *  restarting at 0 and overwriting their saved progress. */
  initialPosition?: number | null
  onProgress?: (info: { position: number; progress: number; duration: number }) => void
}

export function usePlaybackProgress({ imdbId, runtimeMinutes, initialPosition, onProgress }: Opts) {
  const [position, setPosition] = useState(0)
  const startRef = useRef<number>(Date.now())
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const saveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Latest resume seed — read inside the timer (re)start effect without
  // being a dep (it must NOT restart the timer when a parent re-renders).
  const initialPositionRef = useRef(initialPosition)
  initialPositionRef.current = initialPosition
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  // Duration in seconds — from runtimeMinutes, or default 90 min
  const duration = (runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : 90) * 60

  // Calculate progress: always (position / duration) * 100
  const calcProgress = useCallback((pos: number, dur: number): number => {
    const d = Math.max(0, Number(dur) || 0)
    const p = Math.min(d, Math.max(0, Number(pos) || 0))
    return d > 0 ? Math.min(100, Math.max(0, (p / d) * 100)) : 0
  }, [])

  // (Re)start the timer whenever the title changes. When resuming, the
  // start timestamp is back-dated so `elapsed` already equals the saved
  // position — the red progress bar, the IndexedDB record, and the
  // "Resuming from…" banner all stay in sync.
  useEffect(() => {
    const seed = Math.max(0, Math.floor(Number(initialPositionRef.current) || 0))
    setPosition(seed)
    startRef.current = Date.now() - seed * 1000

    // Tick every 1s to update the UI position display
    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
      setPosition(elapsed)
    }, 1000)

    // Save every 15 seconds
    saveRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
      const prog = calcProgress(elapsed, duration)
      onProgressRef.current?.({ position: elapsed, progress: prog, duration })
    }, 15000)

    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (saveRef.current) clearInterval(saveRef.current)
      tickRef.current = null
      saveRef.current = null
    }
    // initialPosition is read via ref at (re)start time only — deliberately
    // NOT a dep so it can't restart the timer.
  }, [imdbId, duration, calcProgress])

  // Stop the timer and report FINAL position.
  // Returns the final values so callers can persist them.
  const stop = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (saveRef.current) { clearInterval(saveRef.current); saveRef.current = null }
    const finalPosition = Math.floor((Date.now() - startRef.current) / 1000)
    const finalProgress = calcProgress(finalPosition, duration)
    onProgressRef.current?.({ position: finalPosition, progress: finalProgress, duration })
    return { position: finalPosition, progress: finalProgress, duration }
  }, [duration, calcProgress])

  // Pause when tab is hidden, resume when visible
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
        if (saveRef.current) { clearInterval(saveRef.current); saveRef.current = null }
        // Save on hide
        const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
        const prog = calcProgress(elapsed, duration)
        onProgressRef.current?.({ position: elapsed, progress: prog, duration })
      } else if (!tickRef.current) {
        startRef.current = Date.now() - position * 1000
        tickRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
          setPosition(elapsed)
        }, 1000)
        saveRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
          const prog = calcProgress(elapsed, duration)
          onProgressRef.current?.({ position: elapsed, progress: prog, duration })
        }, 15000)
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [position, duration, calcProgress])

  const progress = calcProgress(position, duration)

  return {
    position,
    progress,
    duration,
    stop: stop as () => { position: number; progress: number; duration: number },
  }
}
