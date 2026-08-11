"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// Deterministic gradient based on title hash, used when no poster / poster fails.
function gradientFor(title: string): string {
  let h = 0
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) >>> 0
  }
  const palettes = [
    ["#7f1d1d", "#b91c1c"],
    ["#1e3a8a", "#1e40af"],
    ["#14532d", "#166534"],
    ["#581c87", "#6b21a8"],
    ["#9a3412", "#c2410c"],
    ["#0f766e", "#0d9488"],
    ["#831843", "#9d174d"],
    ["#312e81", "#3730a3"],
    ["#713f12", "#854d0e"],
    ["#134e4a", "#115e59"],
  ]
  const [a, b] = palettes[h % palettes.length]
  const ang = h % 360
  return `linear-gradient(${ang}deg, ${a} 0%, ${b} 100%)`
}

type Props = {
  title: string
  src?: string | null
  alt?: string
  className?: string
  year?: string | null
}

export function Poster({ title, src, alt, className, year }: Props) {
  const [failed, setFailed] = useState(false)
  const showImg = src && !failed

  return (
    <div
      className={cn("relative overflow-hidden bg-neutral-900", className)}
      style={!showImg ? { background: gradientFor(title) } : undefined}
    >
      {showImg ? (
        <img
          src={src}
          alt={alt ?? title}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <span className="text-base font-bold leading-tight text-white drop-shadow-md sm:text-lg">
            {title}
          </span>
          {year ? (
            <span className="mt-1 text-xs text-white/70">{year}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
