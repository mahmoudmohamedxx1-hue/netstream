"use client"

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Reusable muted YouTube trailer iframe                                  │
// │                                                                         │
// │  This is the ONE trailer implementation used across the app:            │
// │    • home hero (tmdb-home.tsx)                                          │
// │    • hover preview card (hover-preview-card.tsx)                        │
// │    • title detail hero (title-detail.tsx)                               │
// │                                                                         │
// │  Rules (per project trailer brief):                                     │
// │    • Render NOTHING when trailerKey is null — the parent's backdrop     │
// │      stays visible underneath. Never show a black replacement layer.   │
// │    • Wait `delay` ms before mounting the iframe (lets the backdrop     │
// │      paint first, and matches Netflix's hover/hero delay).              │
// │    • Always start MUTED (browser autoplay policy requires muted media). │
// │    • Use youtube-nocookie.com embed (privacy-enhanced, fewer bot checks).│
// │    • pointer-events-none so background trailers never capture clicks.   │
// │    • Unmount immediately when trailerKey changes or the parent         │
// │      unmounts — no trailer can leak into another title.                │
// │    • Mute/unmute is handled via postMessage (no iframe reload) so      │
// │      toggling mute does NOT restart the trailer.                        │
// └─────────────────────────────────────────────────────────────────────────┘

import { useEffect, useRef, useState } from "react"

type Props = {
  /** YouTube video id. When null, the component renders nothing. */
  trailerKey: string | null
  /** Title used for the iframe's title attribute (a11y). */
  title: string
  /** Delay (ms) before the iframe mounts. Default 800ms. */
  delay?: number
  /** Extra className for the iframe wrapper. */
  className?: string
  /** Mute state — defaults to true (autoplay requires muted). When the caller
   *  toggles this, the iframe stays mounted and we send a postMessage to
   *  YouTube to mute/unmute without reloading the video. */
  muted?: boolean
  /** Whether to disable pointer events (background trailers). Default true. */
  background?: boolean
  /** Optional inline style overrides for the wrapper. */
  style?: React.CSSProperties
}

export function TrailerIframe({
  trailerKey,
  title,
  delay = 800,
  className,
  muted = true,
  background = true,
  style,
}: Props) {
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Mount the iframe after the delay (lets backdrop paint first)
  useEffect(() => {
    if (!trailerKey) return
    const timer = setTimeout(() => setReadyKey(trailerKey), delay)
    return () => clearTimeout(timer)
  }, [trailerKey, delay])

  // Mute/unmute via postMessage — does NOT reload the iframe.
  // YouTube's iframe API listens for these commands on the iframe's contentWindow.
  // This avoids restarting the trailer when the user toggles mute.
  useEffect(() => {
    if (!readyKey) return
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return
    // Send the mute/unmute command to the YouTube player
    const command = muted
      ? '{"event":"command","func":"mute","args":""}'
      : '{"event":"command","func":"unMute","args":""}'
    iframe.contentWindow.postMessage(command, "*")
  }, [muted, readyKey])

  // Render nothing when there's no key, or when the current key hasn't
  // finished its delay yet. The backdrop underneath stays visible.
  if (!trailerKey || readyKey !== trailerKey) return null

  // The src always starts muted (autoplay requires it). postMessage handles
  // unmute after the iframe loads, so we don't need to change the src.
  const src = `https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: background ? "none" : "auto",
        ...style,
      }}
    >
      <iframe
        // Key is ONLY the trailerKey — NOT the muted state. This ensures
        // toggling mute does NOT remount/restart the iframe. The postMessage
        // effect above handles the actual mute/unmute.
        key={trailerKey}
        ref={iframeRef}
        src={src}
        title={`${title} trailer`}
        allow="autoplay; encrypted-media; picture-in-picture"
        className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2"
        style={{ border: 0 }}
        frameBorder={0}
        scrolling="no"
        allowFullScreen={false}
      />
    </div>
  )
}
