"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

// ─────────────────────────────────────────────────────────────────────────────
// RowScrollButtons — Netflix-style vertical scroll buttons for content rows.
//
// Behavior:
//   • The LEFT arrow only appears when the row is scrolled past the start
//     (canLeft = scrollLeft > 8). This means on initial load, only the RIGHT
//     arrow is visible — the LEFT arrow fades in once the user scrolls right.
//   • The RIGHT arrow only appears when there's more content to the right
//     (canRight = scrollLeft + clientWidth < scrollWidth - 8).
//
// Mobile (touch):
//   • Arrows are fully visible (opacity-80) — no hover needed.
//   • Wider touch targets (48px) for easy tapping.
//   • active:scale-95 gives tactile press feedback.
//
// Desktop (mouse):
//   • Arrows are semi-opaque (opacity-50) by default.
//   • Fully visible (opacity-100) on hover with darker background.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  scrollerRef: React.RefObject<HTMLDivElement | null>
  className?: string
}

export function RowScrollButtons({ scrollerRef, className }: Props) {
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [leftHovered, setLeftHovered] = useState(false)
  const [rightHovered, setRightHovered] = useState(false)
  const isMobile = useIsMobile()

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    // Threshold accounts for the scroller's horizontal padding (px-4 = 16px on
    // mobile, sm:px-8 = 32px on desktop). scrollLeft reads the padding as an
    // offset, so we use 40px as the threshold to avoid showing the left arrow
    // on initial load. Once the user actually scrolls content, scrollLeft
    // exceeds 40 and the arrow appears.
    setCanLeft(el.scrollLeft > 40)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [scrollerRef])

  useEffect(() => {
    update()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [update, scrollerRef])

  const scrollRow = useCallback((direction: 1 | -1) => {
    const container = scrollerRef.current
    if (!container) return
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-row-card]")
    )
    if (cards.length === 0) {
      container.scrollBy({
        left: direction * Math.round(container.clientWidth * 0.85),
        behavior: "smooth",
      })
      return
    }
    const containerRect = container.getBoundingClientRect()
    const containerLeft = containerRect.left
    const containerRight = containerRect.right

    if (direction === 1) {
      const target = cards.find((card) => {
        const cardRect = card.getBoundingClientRect()
        return cardRect.right > containerRight - 4
      })
      if (target) {
        const targetRect = target.getBoundingClientRect()
        const scrollOffset = targetRect.left - containerLeft
        container.scrollBy({ left: scrollOffset, behavior: "smooth" })
      } else {
        container.scrollTo({ left: container.scrollWidth, behavior: "smooth" })
      }
    } else {
      const target = [...cards].reverse().find((card) => {
        const cardRect = card.getBoundingClientRect()
        return cardRect.left < containerLeft + 4
      })
      if (target) {
        const targetRect = target.getBoundingClientRect()
        const scrollOffset = targetRect.right - containerRight
        container.scrollBy({ left: scrollOffset, behavior: "smooth" })
      } else {
        container.scrollTo({ left: 0, behavior: "smooth" })
      }
    }
  }, [scrollerRef])

  // ── Compute button classes based on device type ──────────────────────────
  // Mobile: always visible (no hover), wider, with press feedback
  // Desktop: semi-opaque → fully visible on hover
  const getButtonClass = (hovered: boolean) => {
    if (isMobile) {
      return "bg-[rgba(20,20,20,0.6)] opacity-80 active:scale-95 active:bg-[rgba(20,20,20,0.9)]"
    }
    return hovered
      ? "bg-[rgba(20,20,20,0.8)] opacity-100"
      : "bg-[rgba(20,20,20,0.4)] opacity-50"
  }

  // Mobile: wider touch target (48px); Desktop: 40px
  const buttonWidth = isMobile ? "48px" : "40px"

  return (
    <>
      {/* Left scroll button — only appears when scrolled past the start */}
      <div
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
        style={{ height: "calc(100% - 12px)", width: buttonWidth, margin: "4px 0" }}
        onMouseEnter={() => setLeftHovered(true)}
        onMouseLeave={() => setLeftHovered(false)}
      >
        {canLeft && (
          <button
            onClick={() => scrollRow(-1)}
            aria-label="Scroll left"
            className={cn(
              "flex h-full w-full items-center justify-center rounded-r-md text-white transition-all duration-150",
              getButtonClass(leftHovered),
              className
            )}
          >
            <svg className={cn("fill-none stroke-current", isMobile ? "h-7 w-7" : "h-6 w-6")} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Right scroll button — only appears when more content exists to the right */}
      <div
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2"
        style={{ height: "calc(100% - 12px)", width: buttonWidth, margin: "4px 0" }}
        onMouseEnter={() => setRightHovered(true)}
        onMouseLeave={() => setRightHovered(false)}
      >
        {canRight && (
          <button
            onClick={() => scrollRow(1)}
            aria-label="Scroll right"
            className={cn(
              "flex h-full w-full items-center justify-center rounded-l-md text-white transition-all duration-150",
              getButtonClass(rightHovered),
              className
            )}
          >
            <svg className={cn("fill-none stroke-current", isMobile ? "h-7 w-7" : "h-6 w-6")} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
