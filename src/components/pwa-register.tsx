"use client"

// Registers the NetStream service worker (/public/sw.js → served at /sw.js).
// Mounted once in the root layout. The SW enables:
//   • PWA installability (Chrome/Edge/Android require a fetch-handling SW)
//   • Offline app shell + branded offline page
//   • Icon/manifest precaching
//
// Registration failures (private browsing, unsupported engines) are silent —
// the app works fine as a normal website without it.

import { useEffect } from "react"

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* no-op: SW is a progressive enhancement */
      })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
