"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// RowScrollButtons — Netflix-style thin vertical scroll buttons that appear
// only when the cursor is directly over the button area (not the whole row).
//
// When clicked, they scroll to the next/previous CARD boundary using
// getBoundingClientRect for accurate positioning.
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

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
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
    // Use getBoundingClientRect for accurate card position relative to viewport
    const containerRect = container.getBoundingClientRect()
    const containerLeft = containerRect.left
    const containerRight = containerRect.right

    if (direction === 1) {
      // Find first card whose right edge is past the container's right edge
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
      // Find last card whose left edge is before the container's left edge
      const target = [...cards].reverse().find((card) => {
        const cardRect = card.getBoundingClientRect()
        return cardRect.left < containerLeft + 4
      })
      if (target) {
        const targetRect = target.getBoundingClientRect()
        // Align the target's right edge with the container's right edge
        const scrollOffset = targetRect.right - containerRight
        container.scrollBy({ left: scrollOffset, behavior: "smooth" })
      } else {
        container.scrollTo({ left: 0, behavior: "smooth" })
      }
    }
  }, [scrollerRef])

  return (
    <>
      {/* Left scroll button — semi-opaque by default, fully visible on hover */}
      <div
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
        style={{ height: "calc(100% - 12px)", width: "40px", margin: "4px 0" }}
        onMouseEnter={() => setLeftHovered(true)}
        onMouseLeave={() => setLeftHovered(false)}
      >
        {canLeft && (
          <button
            onClick={() => scrollRow(-1)}
            aria-label="Scroll left"
            className={cn(
              "flex h-full w-full items-center justify-center rounded-r-md text-white backdrop-blur-sm transition-all duration-150",
              leftHovered ? "bg-[rgba(20,20,20,0.8)] opacity-100" : "bg-[rgba(20,20,20,0.4)] opacity-50",
              className
            )}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Right scroll button — semi-opaque by default, fully visible on hover */}
      <div
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2"
        style={{ height: "calc(100% - 12px)", width: "40px", margin: "4px 0" }}
        onMouseEnter={() => setRightHovered(true)}
        onMouseLeave={() => setRightHovered(false)}
      >
        {canRight && (
          <button
            onClick={() => scrollRow(1)}
            aria-label="Scroll right"
            className={cn(
              "flex h-full w-full items-center justify-center rounded-l-md text-white backdrop-blur-sm transition-all duration-150",
              rightHovered ? "bg-[rgba(20,20,20,0.8)] opacity-100" : "bg-[rgba(20,20,20,0.4)] opacity-50",
              className
            )}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
