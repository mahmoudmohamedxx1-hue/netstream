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
// │    • Start UNMUTED (user preference). Browsers allow autoplay WITH     │
// │      sound once the visitor has interacted with the page, which        │
// │      covers every real navigation path into the app.                    │
// │    • PLAYBACK SUPERVISOR (fixes the frozen-thumbnail regression):      │
// │      a browser that BLOCKS unmuted autoplay (fresh direct visit,       │
// │      zero interaction) leaves the YouTube embed frozen on the          │
// │      video's thumbnail — nothing plays. A watchdog keeps working       │
// │      the problem until something actually plays:                       │
// │        1. it re-sends the YouTube widget handshake every tick until    │
// │           YouTube answers — the widget registers its message listener  │
// │           LONG after the iframe's load event, so a one-shot handshake  │
// │           was routinely lost → no player state → no fallback →         │
// │           frozen thumbnail forever (the exact reported bug);           │
// │        2. CONFIRMED stall (~1s of unstarted/cued/paused state) →       │
// │           soft fallback: mute + playVideo via postMessage (no          │
// │           reload), reporting onAutoMuted so the parent's toggle        │
// │           stays truthful;                                              │
// │        3. still stalled 1.5s later, OR total radio silence 4s after    │
// │           load → hard fallback: reload the embed with mute=1 baked     │
// │           into the URL — YouTube-native muted autoplay, the            │
// │           universally-allowed path that needs zero postMessage         │
// │           cooperation. One hard reload per trailer — never loops.      │
// │      Muted embeds that somehow still stall (rare strict environments)  │
// │      get ONE programmatic playVideo kick — the same start the soft     │
// │      fallback uses, which works even where the autoplay attribute is   │
// │      refused.                                                          │
// │    • The URL's mute flag is snapshotted per LOAD — normal mute toggles │
// │      go through postMessage only, so the trailer never reloads on a    │
// │      toggle. (The hard fallback deliberately remounts — nothing was    │
// │      playing anyway, so there is nothing to interrupt.)                │
// │    • Once the user touches the mute toggle the supervisor stands down  │
// │      (never auto-mute over a human's choice). The unmute click itself  │
// │      kicks stalled playback — the click grants user activation, which  │
// │      permits playback inside embeds.                                   │
// │    • FATAL EMBED ERRORS (onError 101/150 — uploader disabled embedding,
// │      video removed): no autoplay/mute strategy can ever rescue these,
// │      so the embed is unmounted (the parent's backdrop shows instead of
// │      YouTube's error/thumbnail screen) and the parent is told via
// │      onUnavailable so it can hide its mute toggle.
// │    • pointer-events-none so background trailers never capture clicks.  │
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
  /** Fired when YouTube reported a fatal embed error (101/150 — the uploader
   *  disabled embedding, video removed, …). No mute/autoplay strategy can
   *  ever make such a video play, so we unmount the iframe (the parent's
   *  backdrop shows instead of YouTube's error screen) and parents should
   *  hide their mute toggle / stop passing the key. */
  onUnavailable?: () => void
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
  onUnavailable,
  background = true,
  style,
}: Props) {
  // The mount record is created ONCE per trailerKey (after the delay) and
  // snapshots the mute preference AT MOUNT TIME. The embed URL derives from
  // this record, so later `muted` toggles never change the src and never
  // reload the iframe. The ONE deliberate exception: the supervisor's hard
  // fallback swaps the record to muted:true and remounts the embed muted —
  // which only ever happens while nothing is playing.
  const [mount, setMount] = useState<{ key: string; muted: boolean } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Mirrors of the latest props — read inside timers/handlers without
  // re-firing effects (kept fresh after every commit; all consumers are
  // asynchronous, so they always see the latest committed value).
  const mutedRef = useRef(muted)
  const onAutoMutedRef = useRef(onAutoMuted)
  const onUnavailableRef = useRef(onUnavailable)
  useEffect(() => {
    mutedRef.current = muted
    onAutoMutedRef.current = onAutoMuted
    onUnavailableRef.current = onUnavailable
  })

  // ── Per-TRAILER tracking (reset when trailerKey changes) ────────────────
  const softFellBackRef = useRef(false)      // sent the postMessage mute+play fallback
  const hardFellBackRef = useRef(false)      // already remounted with mute=1 (max ONE per trailer)
  const userTouchedRef = useRef(false)       // user manually toggled mute → supervisor stands down
  const expectingAutoMuteRef = useRef(false) // our onAutoMuted fired; the next muted=true prop is ours
  const prevMutedRef = useRef(muted)         // to detect mute-prop CHANGES (not the initial value)
  const errorRef = useRef(false)             // YouTube reported a fatal embed error (101/150/…)

  // ── Per-LOAD tracking (reset on every iframe load / mount-record change) ─
  const loadedRef = useRef(false)            // iframe onLoad fired → commands deliverable
  const loadedAtRef = useRef(0)              // when onLoad fired (supervisor clock)
  const receivedStateRef = useRef(false)     // YouTube has told us a playerState
  const playerStateRef = useRef(-1)          // latest playerState (-1 = unstarted)
  const mutedKickRef = useRef(false)         // already sent the stalled-muted playVideo kick

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

  // (Re)start per-trailer tracking + mount the iframe after the delay (lets
  // the backdrop paint first). When the key changes, the render guard below
  // unmounts the old iframe immediately — no trailer leaks across titles.
  useEffect(() => {
    softFellBackRef.current = false
    hardFellBackRef.current = false
    userTouchedRef.current = false
    expectingAutoMuteRef.current = false
    errorRef.current = false
    if (!trailerKey) return
    const timer = setTimeout(() => setMount({ key: trailerKey, muted: mutedRef.current }), delay)
    return () => clearTimeout(timer)
  }, [trailerKey, delay])

  // Listen for YouTube widget messages (initialDelivery / infoDelivery /
  // onStateChange). Filtered by e.source so two simultaneous trailers (hero
  // behind a hover-preview popup) can never mix their states up. This
  // listener lives for the whole mount — it feeds both the supervisor and
  // the unmute self-heal below.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      let data: YtWidgetMessage | null = null
      try {
        const parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        if (parsed && typeof parsed === "object") data = parsed as YtWidgetMessage
      } catch { return }
      if (!data) return
      // Fatal embed error (101/150 = uploader disabled embedding, video
      // removed, …). No autoplay/mute strategy can ever rescue it — the
      // supervisor unmounts the embed as soon as it sees the flag. Checked
      // BEFORE the numeric-info branch so an error code (e.g. 150) is never
      // mistaken for a playerState.
      if (data.event === "onError") {
        errorRef.current = true
        return
      }
      let state: number | undefined
      if (typeof data.info === "number") state = data.info
      else if (data.info && typeof data.info.playerState === "number") state = data.info.playerState
      if (typeof state !== "number") return
      playerStateRef.current = state
      receivedStateRef.current = true
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Distinguish OUR automatic mute callback from a HUMAN clicking the mute
  // toggle: both arrive as a `muted` prop change. When we fire onAutoMuted we
  // arm expectingAutoMuteRef; the next muted=true is ours (supervisor keeps
  // running). Any other change is the user taking control → the supervisor
  // stands down permanently for this trailer.
  useEffect(() => {
    if (prevMutedRef.current === muted) return
    prevMutedRef.current = muted
    if (expectingAutoMuteRef.current && muted) {
      expectingAutoMuteRef.current = false
      return
    }
    userTouchedRef.current = true
  }, [muted])

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
      // Self-heal: if the trailer never started (autoplay was blocked — even
      // the muted reload was refused), the user's click on the unmute toggle
      // just granted the page user activation, which permits playback inside
      // embeds — so kick it.
      const stalled =
        receivedStateRef.current &&
        playerStateRef.current !== STATE_PLAYING &&
        playerStateRef.current !== STATE_BUFFERING
      if (stalled) sendCommand("playVideo")
    }
  }, [muted, mount, sendCommand])

  // ── Playback supervisor ─────────────────────────────────────────────────
  // Runs while this trailer's embed is live. The tick (every 500ms):
  //   • re-sends the handshake until YouTube answers (the widget registers
  //     its listener long after the load event — one-shots get lost);
  //   • stands down the moment playing/buffering is observed;
  //   • for UNMUTED embeds (until the user touches the toggle or the single
  //     hard fallback is spent) escalates:
  //       stall (2 ticks ≈ 1s, state-confirmed)  → mute + playVideo  (soft)
  //       still stalled 1.5s after the soft one  → remount with mute=1 (hard)
  //       no state at all 4s after load          → remount with mute=1 (hard)
  // The hard fallback swaps the mount record to muted:true, which remounts
  // the iframe (key change) with mute=1 in the URL — YouTube then starts
  // muted autoplay by itself. That reload mounts with mount.muted=true, so
  // this effect's ladder is skipped for it → no reload loop, even on
  // browsers that refuse every programmatic play.
  useEffect(() => {
    // Stale record (trailerKey changed during the mount delay) — nothing is
    // rendered, nothing to supervise.
    if (!mount || mount.key !== trailerKey) return

    // Per-load reset (also runs after the hard-fallback remount).
    loadedRef.current = false
    loadedAtRef.current = 0
    receivedStateRef.current = false
    playerStateRef.current = -1
    mutedKickRef.current = false

    const startedAt = Date.now()
    let stallStreak = 0
    let softAt = 0

    const playing = () =>
      receivedStateRef.current &&
      (playerStateRef.current === STATE_PLAYING ||
        playerStateRef.current === STATE_BUFFERING)
    const stalled = () => receivedStateRef.current && !playing()

    const hardFallback = () => {
      clearInterval(interval)
      hardFellBackRef.current = true
      expectingAutoMuteRef.current = true
      onAutoMutedRef.current?.()
      setMount({ key: mount.key, muted: true })
    }

    const interval = setInterval(() => {
      // 0) Fatal embed error (uploader disabled embedding / video gone):
      //    the video can NEVER play here — mute/reload strategies are
      //    pointless. Unmount the embed (parent's backdrop shows instead of
      //    YouTube's error screen) and tell the parent so it can hide its
      //    mute toggle.
      if (errorRef.current) {
        clearInterval(interval)
        onUnavailableRef.current?.()
        setMount(null)
        return
      }

      // 1) Handshake until answered. The widget is what plays the video —
      //    if it is not answering yet, nothing is playing yet either.
      if (!receivedStateRef.current) sendListening()

      // 2) Playback confirmed → stand down for good.
      if (playing()) {
        clearInterval(interval)
        return
      }

      // 3) Never supervise forever (the unmute self-heal in the toggle
      //    effect keeps working regardless — its listener never stops).
      if (Date.now() - startedAt > 10000) {
        clearInterval(interval)
        return
      }

      // 4) Escalation ladder — unmuted embeds only, until the user takes
      //    over or the single hard fallback is spent. (Before the guard:
      //    streak counting + the muted kick below apply to every embed.)
      if (stalled()) stallStreak += 1
      else stallStreak = 0

      // 4a-pre) MUTED embed confirmed stalled → one programmatic playVideo
      //    kick. Native muted autoplay is allowed in every real browser, so
      //    this is belt-and-braces for environments that refuse even that
      //    (verified: the programmatic start works in places where the
      //    autoplay ATTRIBUTE is blocked). Idempotent, once per load.
      if (mount.muted && !mutedKickRef.current && stallStreak >= 2) {
        mutedKickRef.current = true
        sendCommand("playVideo")
        return
      }

      if (mount.muted || userTouchedRef.current || hardFellBackRef.current) return

      // 4a) CONFIRMED stall — the browser refused unmuted autoplay. Recover
      //     WITHOUT a reload first: mute + kick via postMessage.
      if (stallStreak >= 2 && !softFellBackRef.current) {
        softFellBackRef.current = true
        softAt = Date.now()
        sendCommand("mute")
        sendCommand("playVideo")
        expectingAutoMuteRef.current = true
        onAutoMutedRef.current?.()
        return
      }

      // 4b) The soft attempt was ignored too (command lost / refused) →
      //     the guaranteed path: remount the embed with mute=1 in the URL.
      if (
        softFellBackRef.current &&
        softAt !== 0 &&
        stalled() &&
        Date.now() - softAt >= 1500
      ) {
        hardFallback()
        return
      }

      // 4c) Radio silence — YouTube never answered a single handshake in the
      //     4s after the iframe loaded. If the trailer were actually playing
      //     it would have answered long before now → remount muted.
      if (
        !softFellBackRef.current &&
        !receivedStateRef.current &&
        loadedAtRef.current !== 0 &&
        Date.now() - loadedAtRef.current >= 4000
      ) {
        hardFallback()
      }
    }, 500)

    return () => clearInterval(interval)
  }, [mount, trailerKey, sendCommand, sendListening])

  // When the embed finishes loading: handshake for state updates and sync
  // the mute preference. (The supervisor keeps re-sending the handshake —
  // this is just the earliest attempt.)
  const handleIframeLoad = () => {
    loadedRef.current = true
    loadedAtRef.current = Date.now()
    sendListening()
    sendCommand(mutedRef.current ? "mute" : "unMute")
    // Belt & braces: the widget may register its listener a beat after the
    // load event. (The supervisor retries every 500ms as well.)
    setTimeout(() => {
      if (!receivedStateRef.current) sendListening()
      sendCommand(mutedRef.current ? "mute" : "unMute")
    }, 400)
  }

  // Render nothing when there's no key, or when the current key hasn't
  // finished its delay yet. The backdrop underneath stays visible.
  if (!trailerKey || !mount || mount.key !== trailerKey) return null

  // The mute flag is baked in per LOAD from the mount record — toggling the
  // `muted` prop afterwards must NOT change the src (that would reload and
  // restart the trailer). postMessage handles all later changes. Only the
  // supervisor's hard fallback ever swaps the record (and remounts).
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
        // Key includes the load's mute MODE: identical for normal mute
        // toggles (postMessage path — no remount), and changes ONLY when
        // the supervisor hard-falls-back to a muted reload — forcing a
        // clean remount that no browser can ignore.
        key={`${mount.key}:${mount.muted ? "m" : "u"}`}
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
