"use client"

import { useEffect, useRef, useState } from "react"
import { RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// PullToRefresh — mobile-only pull-to-refresh indicator.
//
// When the user is at the top of the page and pulls down (touch), a spinner
// appears at the top. If they pull past 70px and release, the page reloads.
// Uses touch events (not scroll) so it works even with overscroll-behavior.
//
// Only active on touch devices (hasTouch). Desktop mice don't trigger it.
// ─────────────────────────────────────────────────────────────────────────────

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  useEffect(() => {
    // Only enable on touch devices
    if (!("ontouchstart" in window)) return

    const onTouchStart = (e: TouchEvent) => {
      // Only start pulling if at the top of the page
      if (window.scrollY > 0 || isRefreshing) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return
      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current
      // Only track downward pulls (positive diff)
      if (diff > 0) {
        // Dampen the pull (resistance increases as you pull more)
        const dampened = Math.min(diff * 0.4, 100)
        setPullDistance(dampened)
      }
    }

    const onTouchEnd = () => {
      pulling.current = false
      if (pullDistance > 70) {
        // Trigger refresh
        setIsRefreshing(true)
        setPullDistance(70)
        // Reload after a brief animation
        setTimeout(() => {
          window.location.reload()
        }, 500)
      } else {
        // Snap back
        setPullDistance(0)
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [pullDistance, isRefreshing])

  // Don't render if no pull is happening and not refreshing
  if (pullDistance === 0 && !isRefreshing) return null

  const progress = Math.min(pullDistance / 70, 1)
  const shouldRelease = pullDistance >= 70

  return (
    <div
      className="fixed left-1/2 top-0 z-[60] flex -translate-x-1/2 flex-col items-center justify-center transition-transform"
      style={{ transform: `translate(-50%, ${pullDistance - 40}px)` }}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1a1a] shadow-lg transition-colors",
          shouldRelease && "bg-primary"
        )}
      >
        <RotateCw
          className={cn(
            "h-5 w-5 transition-transform",
            isRefreshing ? "animate-spin text-primary" : "text-white/60"
          )}
          style={{
            transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
      </div>
    </div>
  )
}
