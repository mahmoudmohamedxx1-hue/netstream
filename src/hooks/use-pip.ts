"use client"

import { useCallback, useEffect, useState } from "react"

type PiPState = "unsupported" | "closed" | "open"

/**
 * Picture-in-Picture for a cross-origin embed (vidsrc / 2embed / etc.).
 *
 * Because the player is an iframe pointing at a third-party domain, we cannot
 * reach into it to call `video.requestPictureInPicture()`. Instead we use the
 * **Document Picture-in-Picture API** (Chrome 116+, Edge, other Chromium
 * browsers): it opens a floating always-on-top window and we mount a fresh
 * iframe pointing at the same stream URL inside it. The floating window stays
 * visible across all browser tabs.
 *
 * For browsers without Document PiP we fall back to a small popup window,
 * which still stays open across tabs (though not always-on-top).
 */
export function usePictureInPicture() {
  // Compute initial support once (client-only; SSR yields "closed" then
  // resolves after mount via the subscription effect below).
  const [state, setState] = useState<PiPState>(() => {
    if (typeof window === "undefined") return "closed"
    return "documentPictureInPicture" in window ? "closed" : "unsupported"
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("documentPictureInPicture" in window)) return
    const dPiP = (
      window as unknown as {
        documentPictureInPicture: {
          addEventListener: (t: string, cb: () => void) => void
          removeEventListener: (t: string, cb: () => void) => void
          window: Window | null
        }
      }
    ).documentPictureInPicture
    const onEnter = () => setState("open")
    const onLeave = () => setState("closed")
    dPiP.addEventListener("enter", onEnter)
    dPiP.addEventListener("leave", onLeave)
    return () => {
      dPiP.removeEventListener("enter", onEnter)
      dPiP.removeEventListener("leave", onLeave)
    }
  }, [])

  const close = useCallback(() => {
    const dPiP = (
      window as unknown as {
        documentPictureInPicture?: { window: Window | null; requestWindow?: () => Promise<Window> }
      }
    ).documentPictureInPicture
    dPiP?.window?.close()
  }, [])

  const open = useCallback(
    async (streamUrl: string, label: string) => {
      if (!streamUrl) return

      // --- Native Document PiP (preferred) ---
      if ("documentPictureInPicture" in window) {
        try {
          const dPiP = (
            window as unknown as {
              documentPictureInPicture: {
                requestWindow: (opts?: {
                  width?: number
                  height?: number
                }) => Promise<Window>
                window: Window | null
              }
            }
          ).documentPictureInPicture
          // Reuse existing window if present
          let pipWindow: Window | null = dPiP.window
          if (!pipWindow) {
            pipWindow = await dPiP.requestWindow({
              width: 480,
              height: 288,
            })
          }
          const doc = pipWindow.document
          doc.head.innerHTML = `<title>${label} — NetStream PiP</title>
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
  iframe{border:0;width:100%;height:100%}
  .bar{position:fixed;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);color:#fff;font:600 11px/1 system-ui;padding:6px 10px;display:flex;justify-content:space-between;align-items:center}
  .x{cursor:pointer;background:#e50914;border:0;color:#fff;border-radius:4px;padding:3px 8px;font-size:11px}
</style>`
          doc.body.innerHTML = `<iframe id="v" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; web-share; clipboard-write; same-origin; popups; popups-to-escape-sandbox; storage-access-by-user-activation" allowfullscreen referrerpolicy="no-referrer" src="${streamUrl}"></iframe>
<div class="bar"><span>NetStream · ${label}</span><button class="x" id="x">Close</button></div>`
          doc.getElementById("x")?.addEventListener("click", () => pipWindow?.close())
          setState("open")
          return
        } catch {
          // fall through to popup fallback
        }
      }

      // --- Popup fallback (Firefox / Safari) ---
      const w = window.open(
        streamUrl,
        "netstream_pip",
        "width=480,height=300,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
      )
      if (w) {
        setState("open")
        const timer = setInterval(() => {
          if (w.closed) {
            setState("closed")
            clearInterval(timer)
          }
        }, 1000)
      }
    },
    []
  )

  return { state, open, close }
}
