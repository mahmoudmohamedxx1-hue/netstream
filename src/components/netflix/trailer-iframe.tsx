"use client"

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Reusable YouTube trailer iframe — sound-first playback                  │
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
// │    • SOUND FIRST. The visitor asked for trailers with sound, so every  │
// │      trailer tries to start UNMUTED. Browsers only allow autoplay      │
// │      with sound AFTER the visitor has interacted with the page         │
// │      (sticky user activation), so a fresh load (F5 / direct visit)     │
// │      can still be refused — the PAGE-LEVEL MANAGER below handles       │
// │      that refusal honestly instead of silencing the site forever:      │
// │        1. a refused unmuted attempt marks the page "sound blocked";    │
// │        2. while blocked AND un-interacted, later trailers mount       │
// │           MUTED DIRECTLY (instant native start — no stall dance);      │
// │        3. the FIRST pointer press / key press anywhere lifts the      │
// │           block (user activation now permits sound), so every         │
// │           trailer after it starts WITH SOUND;                          │
// │        4. a non-control pointer press (not on a button/link/input)     │
// │           also RESTORES sound to the live trailer we had auto-muted.   │
// │        A press on a control means the visitor is opening something     │
// │        (player, detail, nav) — background audio would collide with     │
// │        it, so those never auto-restore.                                │
// │    • The visitor always sees the truth: while the BROWSER (not the     │
// │      visitor) muted the trailer, a centered "Play with sound" pill     │
// │      sits over the trailer — one tap and sound is on (the tap is a     │
// │      user gesture, which permits unmuted playback). The parent's       │
// │      toggle stays in sync through onMutedChange.                       │
// │    • NO THUMBNAIL FLASH: while the embed loads or fights a blocked     │
// │      autoplay, YouTube paints the video's thumbnail over the hero.     │
// │      The iframe stays opacity-0 until the player actually reports      │
// │      playing/buffering — the parent's clean backdrop shows instead —   │
// │      then it fades in. A confirmed-frozen embed (states received but   │
// │      never playing) stays hidden forever: the backdrop is the honest   │
// │      view. Only total radio silence (widget never answered a single    │
// │      handshake in 8s) reveals the iframe — the video may be playing    │
// │      without telling us, and hiding a playing video is worse than a    │
// │      late reveal.                                                      │
// │    • PLAYBACK SUPERVISOR (per load, 500ms tick): re-sends the YouTube  │
// │      widget handshake until YouTube answers (the widget registers      │
// │      its message listener LONG after the iframe's load event —         │
// │      one-shot handshakes get lost); confirmed stall (~1s,              │
// │      state-confirmed) → SOFT fallback: mute + playVideo via            │
// │      postMessage (no reload) + onMutedChange(true); still stalled      │
// │      1.5s later, or total radio silence 4s after load → HARD           │
// │      fallback: remount with mute=1 baked into the URL (YouTube-native  │
// │      muted autoplay — zero postMessage cooperation needed). One hard   │
// │      reload per trailer — never loops. Muted embeds that still stall   │
// │      get ONE programmatic playVideo kick.                              │
// │    • The URL's mute flag is snapshotted per LOAD — normal mute toggles │
// │      go through postMessage only, so the trailer never reloads on a    │
// │      toggle. (The hard fallback deliberately remounts — nothing was    │
// │      playing anyway, so there is nothing to interrupt.)                │
// │    • Once the visitor touches the mute toggle the supervisor stands    │
// │      down (never auto-mute over a human's choice). The unmute click    │
// │      itself kicks stalled playback — the click grants user activation, │
// │      which permits playback inside embeds.                             │
// │    • FATAL EMBED ERRORS (onError 101/150 — uploader disabled embedding, │
// │      video removed): no autoplay/mute strategy can ever rescue these,  │
// │      so the embed is unmounted (the parent's backdrop shows instead of │
// │      YouTube's error/thumbnail screen) and the parent is told via      │
// │      onUnavailable so it can hide its mute toggle.                     │
// │    • pointer-events-none so background trailers never capture clicks.  │
// │    • Unmount immediately when trailerKey changes or the parent         │
// │      unmounts — no trailer can leak into another title.                │
// └─────────────────────────────────────────────────────────────────────────┘

import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"

type Props = {
  /** YouTube video id. When null, the component renders nothing. */
  trailerKey: string | null
  /** Title used for the iframe's title attribute (a11y). */
  title: string
  /** Delay (ms) before the iframe mounts. Default 800ms. */
  delay?: number
  /** Extra className for the iframe wrapper. */
  className?: string
  /** Initial mute preference — defaults to FALSE (sound). The visitor's
   *  later toggles flow back into this prop; our automatic changes are
   *  reported through onMutedChange so this prop always mirrors the real
   *  player state. */
  muted?: boolean
  /** The HUMAN's mute preference — changes ONLY when the visitor clicks
   *  the surface's mute toggle, NEVER from our automatic fallbacks or
   *  restores. This is what each trailer's mount decision is seeded with,
   * so a browser-forced mute on one trailer can never silence the next
   * one (the hero's slide children REMOUNT every rotation — the live
   * `muted` prop carries the auto-mute with it, this prop does not).
   *  Defaults to the initial value of `muted`. */
  userMuted?: boolean
  /** Fired on every AUTOMATIC mute-state change — the browser-forced
   *  muted fallback, the interaction restore, and the mount-time
   *  alignment. Parents use it to keep their toggle UI truthful
   *  (icon + aria-label). Human toggles are the parent's own state
   *  change and are NOT reported back. */
  onMutedChange?: (muted: boolean) => void
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

// ── Page-level autoplay-with-sound manager (shared by every instance) ──────
// Chrome/WebKit/Safari allow autoplay WITH sound only once the visitor has
// interacted with the page (sticky user activation). On a fresh load that
// permission does not exist yet, so the FIRST unmuted attempt is refused —
// falling back to muted playback is correct for that one trailer, but the
// old implementation then left every LATER trailer muted too (the parent's
// muted state had flipped and every subsequent embed URL was baked with
// mute=1). This manager remembers the refusal and watches for the
// visitor's first interaction, after which sound is allowed again:
//   • future trailers mount UNMUTED (the browser now permits it);
//   • a live trailer that we auto-muted is RESTORED to sound — but only
//     for a NON-CONTROL press (a press on a button/link/input means the
//     visitor is opening something; background audio would collide with
//     it, e.g. the player's own audio).
// Keyboard activation lifts the block for future mounts but never changes
// currently-playing audio (sound bursting on from a keypress that opens
// search would be jarring).
let pageActivated = false // visitor has clicked/tapped/pressed a key
let unmutedBlocked = false // an unmuted autoplay attempt was refused on this page
let activationBound = false // window listeners attached (once, client-only)

type RestoreCallback = () => void
const restoreCallbacks = new Set<RestoreCallback>()

/** Was the activating press on an interactive control? (Cards' clickable
 *  cores, nav links, buttons, inputs are all real elements — a press there
 *  is the visitor DOING something, not idling on the page.) */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest("button, a, input, select, textarea, label, [role='button']")
}

/** Restore sound to every live auto-muted trailer (first non-control press). */
function fireRestores() {
  if (restoreCallbacks.size === 0) return
  const cbs = Array.from(restoreCallbacks)
  restoreCallbacks.clear()
  cbs.forEach((cb) => cb())
}

/** Attach the one-time window listeners (called from the first instance's
 *  mount effect — never at module scope, this module also renders on the
 *  server for SSR). */
function bindActivationTracker() {
  if (activationBound || typeof window === "undefined") return
  activationBound = true
  const lift = () => {
    pageActivated = true
    unmutedBlocked = false
  }
  window.addEventListener(
    "pointerdown",
    (e) => {
      lift()
      if (!isInteractiveTarget(e.target)) fireRestores()
    },
    true
  )
  window.addEventListener("keydown", () => lift(), true)
  // Seed from the browser's own sticky-activation flag — covers interaction
  // that happened BEFORE the first trailer mounted (these listeners bind
  // when the first instance mounts, so early presses would be missed).
  if (typeof navigator !== "undefined") {
    const ua = (
      navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }
    ).userActivation
    if (ua?.hasBeenActive) lift()
  }
}

export function TrailerIframe({
  trailerKey,
  title,
  delay = 800,
  className,
  muted = false,
  userMuted,
  onMutedChange,
  onUnavailable,
  background = true,
  style,
}: Props) {
  const { isArabic } = useLang()

  // The mount record is created ONCE per trailerKey (after the delay) and
  // snapshots the mute MODE for this load. The embed URL derives from this
  // record, so later `muted` toggles never change the src and never reload
  // the iframe. The ONE deliberate exception: the supervisor's hard
  // fallback swaps the record to muted:true and remounts the embed muted —
  // which only ever happens while nothing is playing.
  const [mount, setMount] = useState<{ key: string; muted: boolean } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Mirrors of the latest props/state — read inside timers/handlers without
  // re-firing effects (kept fresh after every commit; all consumers are
  // asynchronous, so they always see the latest committed value).
  const mutedRef = useRef(muted)
  const mountRef = useRef<typeof mount>(null)
  const onMutedChangeRef = useRef(onMutedChange)
  const onUnavailableRef = useRef(onUnavailable)
  useEffect(() => {
    mutedRef.current = muted
    mountRef.current = mount
    onMutedChangeRef.current = onMutedChange
    onUnavailableRef.current = onUnavailable
    // The preference only flows through the prop when the caller tracks it.
    if (userMuted !== undefined) userMutedRef.current = userMuted
  })

  // ── Per-TRAILER tracking (reset when trailerKey changes) ────────────────
  const softFellBackRef = useRef(false) // sent the postMessage mute+play fallback
  const hardFellBackRef = useRef(false) // already remounted with mute=1 (max ONE per trailer)
  const userTouchedRef = useRef(false) // user manually toggled mute → supervisor stands down
  const errorRef = useRef(false) // YouTube reported a fatal embed error (101/150/…)

  // ── Cross-mount tracking ────────────────────────────────────────────────
  // The visitor's actual mute preference — ONLY what the human chose via
  // the surface's toggle (the `userMuted` prop). Automatic changes
  // (mount alignment, browser-forced fallback, interaction restore) land
  // in the LIVE `muted` prop and are reported via onMutedChange, but they
  // must never pollute this: the hero's slide children remount every
  // rotation, and a fresh instance seeds its mount decision from here —
  // "the browser muted the last trailer" must not become "the visitor
  // wants silence". Seeded with the initial `muted` prop for callers that
  // don't track the preference separately.
  const userMutedRef = useRef(userMuted ?? muted)
  // The muted-prop change we are ABOUT to cause ourselves via onMutedChange
  // (boomerang filter: our own reports must not be mistaken for a human
  // toggle). null = nothing pending.
  const expectingAutoChangeRef = useRef<boolean | null>(null)
  const prevMutedRef = useRef(muted) // to detect mute-prop CHANGES (not the initial value)

  // ── Per-LOAD tracking (reset on every iframe load / mount-record change) ─
  const loadedRef = useRef(false) // iframe onLoad fired → commands deliverable
  const loadedAtRef = useRef(0) // when onLoad fired (supervisor clock)
  const receivedStateRef = useRef(false) // YouTube has told us a playerState
  const playerStateRef = useRef(-1) // latest playerState (-1 = unstarted)
  const mutedKickRef = useRef(false) // already sent the stalled-muted playVideo kick

  // ── UI state ─────────────────────────────────────────────────────────────
  // The iframe stays opacity-0 until playback actually starts (no YouTube
  // thumbnail flash while loading / fighting blocked autoplay), then fades
  // in. One-way per load — a mid-loop state blip never re-hides the video.
  const [revealed, setRevealed] = useState(false)
  const revealedRef = useRef(false)
  // TRUE while the trailer is muted because the BROWSER refused sound (not
  // because the visitor chose silence) → the "Play with sound" pill shows.
  const [autoMuted, setAutoMuted] = useState(false)
  const autoMutedRef = useRef(false)

  const revealOnce = useCallback(() => {
    if (revealedRef.current) return
    revealedRef.current = true
    setRevealed(true)
  }, [])

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

  // Report an automatic mute-state change to the parent (keeps its toggle
  // truthful). Arms the boomerang filter only when the parent's state will
  // actually change — a same-value setState bails out without re-rendering,
  // which would leave a stale arm behind.
  const reportAutoMuteChange = useCallback((m: boolean) => {
    if (mutedRef.current !== m) expectingAutoChangeRef.current = m
    onMutedChangeRef.current?.(m)
  }, [])

  // (Re)start per-trailer tracking + mount the iframe after the delay (lets
  // the backdrop paint first). When the key changes, the render guard below
  // unmounts the old iframe immediately — no trailer leaks across titles.
  // The mount decision implements the sound-first strategy:
  //   • the visitor wants sound (unless they toggled mute themselves), so
  //     try UNMUTED whenever the page has user activation — the browser
  //     allows autoplay with sound from the first interaction on;
  //   • if an unmuted attempt was already refused on this page AND the
  //     visitor still hasn't interacted, mount MUTED DIRECTLY (mute=1 in
  //     the URL — instant native muted start, no stall dance, no thumbnail
  //     window). The moment the visitor interacts, sound resumes.
  useEffect(() => {
    softFellBackRef.current = false
    hardFellBackRef.current = false
    userTouchedRef.current = false
    expectingAutoChangeRef.current = null
    errorRef.current = false
    if (!trailerKey) return
    const timer = setTimeout(() => {
      bindActivationTracker()
      const wantsSound = !userMutedRef.current
      const tryUnmuted = wantsSound && (!unmutedBlocked || pageActivated)
      const mountMuted = !tryUnmuted
      setMount({ key: trailerKey, muted: mountMuted })
      revealedRef.current = false
      setRevealed(false)
      const autoM = wantsSound && mountMuted
      autoMutedRef.current = autoM
      setAutoMuted(autoM)
      // Align the parent's toggle to this load's mode (arms the boomerang
      // filter when the parent's state actually changes).
      reportAutoMuteChange(mountMuted)
    }, delay)
    return () => clearTimeout(timer)
  }, [trailerKey, delay, reportAutoMuteChange])

  // Listen for YouTube widget messages (initialDelivery / infoDelivery /
  // onStateChange). Filtered by e.source so two simultaneous trailers (hero
  // behind a hover-preview popup) can never mix their states up. This
  // listener lives for the whole mount — it feeds the supervisor, the
  // reveal, and the unmute self-heal below.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      let data: YtWidgetMessage | null = null
      try {
        const parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        if (parsed && typeof parsed === "object") data = parsed as YtWidgetMessage
      } catch {
        return
      }
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
      // Playback actually started → reveal the iframe (fade in over the
      // backdrop — this is the moment the thumbnail window ends).
      if (state === STATE_PLAYING || state === STATE_BUFFERING) revealOnce()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [revealOnce])

  // Distinguish OUR automatic reports from a HUMAN clicking the mute
  // toggle: both arrive as a `muted` prop change. Our reports arm
  // expectingAutoChangeRef with the value we are about to cause; when that
  // exact value lands it is ours (supervisor keeps running). Anything else
  // is the visitor taking control → they own the preference from now on
  // (supervisor stands down, their choice seeds the next trailer's mount).
  useEffect(() => {
    if (prevMutedRef.current === muted) return
    prevMutedRef.current = muted
    if (expectingAutoChangeRef.current === muted) {
      expectingAutoChangeRef.current = null
      return
    }
    userTouchedRef.current = true
    // The preference itself arrives through the `userMuted` prop (the
    // parent's toggle handler updates it) — nothing to record here.
  }, [muted])

  // Mute/unmute via postMessage — does NOT reload the iframe. Commands are
  // only deliverable once the iframe has loaded (before that, onLoad below
  // syncs the player to the state that belongs to this load, covering
  // toggles that happened mid-load).
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
  //   • reveals the iframe after 8s of TOTAL radio silence (the video may
  //     be playing without telling us — hiding a playing video is worse
  //     than a late reveal; a confirmed-frozen embed stays hidden);
  //   • stands down the moment playing/buffering is observed;
  //   • for UNMUTED embeds (until the user touches the toggle or the single
  //     hard fallback is spent) escalates:
  //       stall (2 ticks ≈ 1s, state-confirmed)  → mute + playVideo  (soft)
  //       still stalled 1.5s after the soft one  → remount with mute=1 (hard)
  //       no state at all 4s after load          → remount with mute=1 (hard)
  // Both fallbacks mark the page "sound blocked" (unmutedBlocked) so later
  // trailers on an un-interacted page mount muted DIRECTLY instead of
  // repeating this stall dance — and they flag autoMuted so the "Play with
  // sound" pill explains the silence. The block lifts automatically at the
  // visitor's first interaction (see the activation manager above).
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
      unmutedBlocked = true
      autoMutedRef.current = true
      setAutoMuted(true)
      revealedRef.current = false
      setRevealed(false)
      reportAutoMuteChange(true)
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

      // 1b) Radio-silence safety reveal: the widget never answered a
      //     single handshake in 8s. It may genuinely be playing without
      //     reporting (aggressive ad blockers strip postMessages) — prefer
      //     showing a late video over hiding a playing one. When states DO
      //     arrive we always know the truth, so a confirmed-frozen embed
      //     stays hidden behind the parent's clean backdrop.
      if (!receivedStateRef.current && Date.now() - startedAt >= 8000) revealOnce()

      // 2) Playback confirmed → stand down for good.
      if (playing()) {
        clearInterval(interval)
        revealOnce()
        // This embed genuinely started WITH SOUND (no soft fallback was
        // needed) → unmuted autoplay works on this page (media engagement
        // index) — let future trailers try sound too.
        if (!mount.muted && !softFellBackRef.current) unmutedBlocked = false
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
        unmutedBlocked = true
        autoMutedRef.current = true
        setAutoMuted(true)
        reportAutoMuteChange(true)
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
  }, [mount, trailerKey, sendCommand, sendListening, revealOnce, reportAutoMuteChange])

  // ── Interaction restore ─────────────────────────────────────────────────
  // The browser muted this trailer (autoMuted) because the visitor had not
  // interacted yet. Their first NON-CONTROL press (see the activation
  // manager) grants the page user activation — unmuted playback is allowed
  // from that moment, so restore the sound they asked for. Never fires for
  // a trailer the visitor muted themselves (userTouched).
  useEffect(() => {
    if (!mount) return
    const restore = () => {
      if (userTouchedRef.current || !autoMutedRef.current) return
      // The visitor just interacted with the page and we are granting their
      // standing request for sound — they own the audio from now on. This
      // also STANDS DOWN the supervisor: without it, a restore that lands
      // between the soft and hard fallback would be stomped seconds later
      // by the hard muted remount (the supervisor was still watching the
      // pre-restore stalled state and would "recover" playback right back
      // to muted).
      userTouchedRef.current = true
      autoMutedRef.current = false
      setAutoMuted(false)
      sendCommand("unMute")
      const stalled =
        receivedStateRef.current &&
        playerStateRef.current !== STATE_PLAYING &&
        playerStateRef.current !== STATE_BUFFERING
      if (stalled) sendCommand("playVideo")
      reportAutoMuteChange(false)
    }
    restoreCallbacks.add(restore)
    return () => {
      restoreCallbacks.delete(restore)
    }
  }, [mount, sendCommand, reportAutoMuteChange])

  // When the embed finishes loading: handshake for state updates and sync
  // the mute state that belongs to THIS load — the mount snapshot — unless
  // the visitor already toggled mid-load (their live choice wins over the
  // snapshot). (The supervisor keeps re-sending the handshake — this is
  // just the earliest attempt.)
  const handleIframeLoad = () => {
    loadedRef.current = true
    loadedAtRef.current = Date.now()
    sendListening()
    const target = userTouchedRef.current
      ? mutedRef.current
      : (mountRef.current?.muted ?? false)
    sendCommand(target ? "mute" : "unMute")
    // Belt & braces: the widget may register its listener a beat after the
    // load event. (The supervisor retries every 500ms as well.)
    setTimeout(() => {
      if (!receivedStateRef.current) sendListening()
      sendCommand(target ? "mute" : "unMute")
    }, 400)
  }

  // The pill's own tap: this IS a user gesture — it grants user activation,
  // so unmuted playback is permitted from this exact moment. Restore sound
  // directly and hand the visitor control (supervisor stands down).
  const handleSoundCueClick = () => {
    userTouchedRef.current = true
    autoMutedRef.current = false
    setAutoMuted(false)
    sendCommand("unMute")
    const stalled =
      receivedStateRef.current &&
      playerStateRef.current !== STATE_PLAYING &&
      playerStateRef.current !== STATE_BUFFERING
    if (stalled) sendCommand("playVideo")
    reportAutoMuteChange(false)
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
        // Hidden (opacity-0) until the player actually reports
        // playing/buffering — YouTube's loading screen is a static video
        // thumbnail, which flashed over the hero before playback started.
        // The parent's backdrop shows during the load/stall window, then
        // the trailer fades in.
        className={`absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
        style={{ border: 0 }}
        frameBorder={0}
        scrolling="no"
        allowFullScreen={false}
        onLoad={handleIframeLoad}
      />
      {/* Sound cue — shown ONLY while the BROWSER (not the visitor) muted
          the trailer: the embed is playing silently because autoplay with
          sound needs a user gesture first. One tap and sound is on (the
          tap is that gesture). Centered over the trailer where every
          surface (hero, detail, hover popup) has empty space; z-10 keeps
          it above the parent's gradient overlays. */}
      {autoMuted && muted && (
        <button
          type="button"
          onClick={handleSoundCueClick}
          aria-label={isArabic ? "تشغيل الصوت" : "Play trailer with sound"}
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/70 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:border-white/50 hover:bg-black/85 active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm"
          style={{ pointerEvents: "auto" }}
        >
          <Volume2 className="h-4 w-4 animate-pulse sm:h-5 sm:w-5" />
          {isArabic ? "تشغيل الصوت" : "Play with sound"}
        </button>
      )}
    </div>
  )
}
