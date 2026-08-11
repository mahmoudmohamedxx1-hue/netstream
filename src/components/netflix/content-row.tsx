"use client"

import { useRef, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ContentCard, type CardTitle } from "./content-card"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  titles: CardTitle[]
  onPlay: (t: CardTitle) => void
  numbered?: boolean
}

export function ContentRow({ title, titles, onPlay, numbered }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

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
  }, [titles.length])

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" })
  }

  if (titles.length === 0) return null

  return (
    <section className="group/row relative py-3">
      <h3 className="mb-2 px-4 text-base font-semibold text-white/90 sm:px-8 md:text-lg">
        {title}
      </h3>
      <div className="relative">
        {/* Left arrow */}
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className={cn(
            "absolute left-0 top-0 z-30 hidden h-full w-10 items-center justify-center bg-black/60 text-white opacity-0 transition group-hover/row:opacity-100 md:flex",
            !canLeft && "pointer-events-none !opacity-0"
          )}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>

        <div
          ref={scrollerRef}
          className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 pb-6 pt-1 sm:gap-3 sm:px-8"
        >
          {titles.map((t, i) => (
            <ContentCard
              key={t.imdbId}
              title={t}
              index={i}
              rank={numbered ? i + 1 : undefined}
              onPlay={onPlay}
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className={cn(
            "absolute right-0 top-0 z-30 hidden h-full w-10 items-center justify-center bg-black/60 text-white opacity-0 transition group-hover/row:opacity-100 md:flex",
            !canRight && "pointer-events-none !opacity-0"
          )}
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      </div>
    </section>
  )
}
