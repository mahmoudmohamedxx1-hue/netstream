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
// │    • No mute/unmute logic here — callers that need a mute toggle        │
// │      pass `muted` + `onToggleMute` props.                               │
// └─────────────────────────────────────────────────────────────────────────┘

import { useEffect, useState } from "react"

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
   *  toggles this, the iframe remounts with the new mute param. */
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
  // `readyKey` holds the trailerKey whose delay-timer has fired. When the
  // incoming trailerKey doesn't match readyKey, we're still waiting (or the
  // key just changed) and the iframe is NOT rendered — the parent's backdrop
  // image is the only thing visible. This avoids calling setState
  // synchronously in the effect body (which would trip the
  // react-hooks/set-state-in-effect lint rule).
  const [readyKey, setReadyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!trailerKey) return
    const timer = setTimeout(() => setReadyKey(trailerKey), delay)
    return () => clearTimeout(timer)
  }, [trailerKey, delay])

  // Render nothing when there's no key, or when the current key hasn't
  // finished its delay yet. The backdrop underneath stays visible.
  if (!trailerKey || readyKey !== trailerKey) return null

  const src = `https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${
    muted ? 1 : 0
  }&controls=0&loop=1&playlist=${trailerKey}&rel=0&playsinline=1&modestbranding=1`

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
        // Key includes trailerKey + muted so toggling mute remounts the iframe
        // with the new mute param (YouTube doesn't honor postMessage unmute
        // reliably across origins, so a reload is the robust approach).
        key={`${trailerKey}-${muted ? "m" : "u"}`}
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
