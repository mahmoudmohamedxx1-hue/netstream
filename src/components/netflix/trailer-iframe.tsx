"use client"

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Reusable YouTube trailer iframe — UNMUTED by default                   │
// │                                                                         │
// │  This is the ONE trailer implementation used across the app:            │
// │    • home hero (tmdb-home.tsx)                                          │
// │    • browse hero (hero-carousel.tsx)                                    │
// │    • hover preview card (hover-preview-card.tsx)                        │
// │    • title detail hero (title-detail.tsx)                               │
// │                                                                         │
// │  Rules:                                                                 │
// │    • Render NOTHING when trailerKey is null — the parent's backdrop     │
// │      stays visible underneath. Never show a black replacement layer.   │
// │    • Wait `delay` ms before mounting the iframe (lets the backdrop     │
// │      paint first, and matches Netflix's hover/hero delay).              │
// │    • Start UNMUTED (user preference). Chrome/WebKit allow autoplay      │
// │      with sound once the visitor has interacted with the page (any     │
// │      click/tap), which covers every real navigation path into the      │
// │      app. If the browser BLOCKS unmuted autoplay (fresh direct load,   │
// │      zero interaction) we detect the stalled player via the YouTube    │
// │      widget handshake and fall back to muted autoplay (always          │
// │      allowed), telling the parent through onAutoMuted so its mute      │
// │      toggle UI stays truthful.                                          │
// │    • The embed URL's mute flag is snapshotted ONCE at mount time —     │
// │      toggling mute afterwards goes through postMessage only, so the    │
// │      trailer NEVER reloads/restarts on a mute toggle.                   │
// │    • pointer-events-none so background trailers never capture clicks.   │
// │    • Unmount immediately when trailerKey changes or the parent         │
// │      unmounts — no trailer can leak into another title.                │
// └─────────────────────────────────────────────────────────────────────────┘

import { useCallback, useEffect, useRef, useState } from "react"

type Props = {
  /** YouTube video id. When null, the component renders nothing. */
  trailerKey: string | null
  /** Title used for the iframe's title attribute (a11y). */
  title: string
  /** Delay (ms) before the iframe mounts. Default 800ms. */
  delay?: number
  /** Extra className for the iframe wrapper. */
  className?: string
  /** Mute state — defaults to FALSE (trailers play WITH sound). When the
   *  caller toggles this, the iframe stays mounted and we send a postMessage
   *  to YouTube to mute/unmute without reloading the video. */
  muted?: boolean
  /** Fired when the browser blocked unmuted autoplay and we automatically
   *  fell back to muted playback — parents use it to sync their mute-toggle
   *  UI (icon + aria-label) so it never lies about the real state. */
  onAutoMuted?: () => void
  /** Whether to disable pointer events (background trailers). Default true. */
  background?: boolean
  /** Optional inline style overrides for the wrapper. */
  style?: React.CSSProperties
}

// YouTube iframe player states we treat as "autoplay succeeded".
const STATE_PLAYING = 1
const STATE_BUFFERING = 3

/** Best-effort shape of the YouTube widget protocol messages. */
type YtWidgetMessage = {
  event?: string
  info?: { playerState?: number } | number
}

export function TrailerIframe({
  trailerKey,
  title,
  delay = 800,
  className,
  muted = false,
  onAutoMuted,
  background = true,
  style,
}: Props) {
  // The mount record is created ONCE per trailerKey (after the delay) and
  // snapshots the mute preference AT MOUNT TIME. The embed URL derives from
  // this snapshot, so later `muted` toggles never change the src and never
  // reload the iframe (whose React key is only the trailerKey).
  const [mount, setMount] = useState<{ key: string; muted: boolean } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Mirrors of the latest props — read inside timers/handlers without
  // re-firing effects (kept fresh after every commit; all consumers are
  // asynchronous, so they always see the latest committed value).
  const mutedRef = useRef(muted)
  const onAutoMutedRef = useRef(onAutoMuted)
  useEffect(() => {
    mutedRef.current = muted
    onAutoMutedRef.current = onAutoMuted
  })

  // Per-mount handshake / playback tracking.
  const loadedRef = useRef(false)        // iframe onLoad fired → commands deliverable
  const receivedStateRef = useRef(false) // YouTube has told us a playerState
  const playerStateRef = useRef(-1)      // latest playerState (-1 = unstarted)
  const autoFellBackRef = useRef(false)  // already fell back to muted this mount
  const probeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send a YouTube widget command (mute / unMute / playVideo …).
  const sendCommand = useCallback((func: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      `{"event":"command","func":"${func}","args":""}`,
      "*"
    )
  }, [])

  // Send the widget handshake that makes YouTube stream player-state
  // updates to this window.
  const sendListening = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      '{"event":"listening","id":1,"channel":"widget"}',
      "*"
    )
  }, [])

  // (Re)start per-key tracking + mount the iframe after the delay (lets the
  // backdrop paint first). When the key changes, the render guard below
  // unmounts the old iframe immediately — no trailer leaks across titles.
  useEffect(() => {
    loadedRef.current = false
    receivedStateRef.current = false
    playerStateRef.current = -1
    autoFellBackRef.current = false
    if (probeRef.current) { clearTimeout(probeRef.current); probeRef.current = null }
    // When the key is null the render guard below already renders nothing
    // (and unmounts any previous iframe) — no state reset needed here.
    if (!trailerKey) return
    const timer = setTimeout(() => setMount({ key: trailerKey, muted: mutedRef.current }), delay)
    return () => {
      clearTimeout(timer)
      if (probeRef.current) { clearTimeout(probeRef.current); probeRef.current = null }
    }
  }, [trailerKey, delay])

  // Listen for YouTube widget messages (initialDelivery / infoDelivery /
  // onStateChange). Filtered by e.source so two simultaneous trailers (hero
  // behind a hover-preview popup) can never mix their states up.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      let data: YtWidgetMessage | null = null
      try {
        const parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        if (parsed && typeof parsed === "object") data = parsed as YtWidgetMessage
      } catch { return }
      if (!data) return
      let state: number | undefined
      if (typeof data.info === "number") state = data.info
      else if (data.info && typeof data.info.playerState === "number") state = data.info.playerState
      if (typeof state !== "number") return
      playerStateRef.current = state
      receivedStateRef.current = true
      // Autoplay confirmed — cancel any pending blocked-autoplay probe so a
      // slow-starting trailer is never wrongly muted.
      if ((state === STATE_PLAYING || state === STATE_BUFFERING) && probeRef.current) {
        clearTimeout(probeRef.current)
        probeRef.current = null
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Mute/unmute via postMessage — does NOT reload the iframe. Commands are
  // only deliverable once the iframe has loaded (before that, onLoad below
  // syncs the player to the current preference, covering toggles that
  // happened mid-load).
  useEffect(() => {
    if (!mount || !loadedRef.current) return
    if (muted) {
      sendCommand("mute")
    } else {
      sendCommand("unMute")
      // Self-heal: if the trailer never started (autoplay was blocked — e.g.
      // the browser even refused the muted fallback), the user's click on the
      // unmute toggle just granted the page user activation, which permits
      // playback inside embeds — so kick it.
      const stalled =
        receivedStateRef.current &&
        playerStateRef.current !== STATE_PLAYING &&
        playerStateRef.current !== STATE_BUFFERING
      if (stalled) sendCommand("playVideo")
    }
  }, [muted, mount, sendCommand])

  // When the embed finishes loading: handshake for state updates, sync the
  // mute preference, and — when we mounted UNMUTED — arm the blocked-
  // autoplay probe.
  const handleIframeLoad = () => {
    loadedRef.current = true
    sendListening()
    // Sync the player to the CURRENT preference (covers a toggle that
    // happened while the iframe was still loading).
    sendCommand(mutedRef.current ? "mute" : "unMute")

    // If the player hasn't reached playing/buffering shortly after load AND
    // YouTube told us its (stalled) state, the browser blocked unmuted
    // autoplay → fall back to muted playback, which is always allowed.
    // (When we never received a state we do NOT guess — a protocol hiccup
    // must not mute a trailer that is actually playing with sound.)
    if (mount && !mount.muted) {
      if (probeRef.current) clearTimeout(probeRef.current)
      probeRef.current = setTimeout(() => {
        probeRef.current = null
        if (autoFellBackRef.current) return
        const stalled =
          receivedStateRef.current &&
          playerStateRef.current !== STATE_PLAYING &&
          playerStateRef.current !== STATE_BUFFERING
        if (!stalled) return
        autoFellBackRef.current = true
        sendCommand("mute")
        sendCommand("playVideo")
        onAutoMutedRef.current?.()
      }, 1800)
      // Belt & braces: re-send the handshake (and the mute sync, which also
      // covers a toggle that happened mid-load) in case the widget registered
      // its listener a beat after the load event. Both commands are
      // idempotent for the current preference.
      setTimeout(() => {
        sendListening()
        sendCommand(mutedRef.current ? "mute" : "unMute")
      }, 400)
    }
  }

  // Render nothing when there's no key, or when the current key hasn't
  // finished its delay yet. The backdrop underneath stays visible.
  if (!trailerKey || !mount || mount.key !== trailerKey) return null

  // The mute flag is baked in at mount time from the snapshot — toggling the
  // `muted` prop afterwards must NOT change the src (that would reload and
  // restart the trailer). postMessage handles all later changes.
  const src = `https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${mount.muted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`

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
        key={mount.key}
        ref={iframeRef}
        src={src}
        title={`${title} trailer`}
        allow="autoplay; encrypted-media; picture-in-picture"
        className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2"
        style={{ border: 0 }}
        frameBorder={0}
        scrolling="no"
        allowFullScreen={false}
        onLoad={handleIframeLoad}
      />
    </div>
  )
}
