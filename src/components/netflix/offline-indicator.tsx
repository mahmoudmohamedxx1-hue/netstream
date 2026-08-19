"use client"

import { useEffect, useState } from "react"
import { WifiOff, RotateCw } from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// OfflineIndicator — shows a banner when the network is lost.
//
// Listens to window 'online' and 'offline' events. When offline, shows a
// fixed banner at the bottom of the screen with a retry button. When back
// online, the banner disappears automatically.
// ─────────────────────────────────────────────────────────────────────────────

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    // Check initial state (deferred to avoid cascading renders)
    Promise.resolve().then(() => setIsOffline(!navigator.onLine))

    const onOffline = () => setIsOffline(true)
    const onOnline = () => setIsOffline(false)

    window.addEventListener("offline", onOffline)
    window.addEventListener("online", onOnline)

    return () => {
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("online", onOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-500/40 bg-[#1a0a0a] px-4 py-3 shadow-2xl">
      <WifiOff className="h-5 w-5 shrink-0 text-red-400" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-white">You're offline</p>
        <p className="text-xs text-white/50">Check your connection and try again</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="ml-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-red-500/20 px-3 text-xs font-bold text-red-400 transition hover:bg-red-500/30"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  )
}
