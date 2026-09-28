"use client"

import { cn } from "@/lib/utils"

// ──────────────────────────────────────────────────────────────────────────
// AIOrbAvatar — Animated AI-style orb avatar with blinking eyes.
// Inspired by the OdysseyUI avatar component on 21st.dev.
//
// Features:
// - Glowing gradient orb body (dark red → crimson)
// - Two animated "eyes" that blink periodically
// - Subtle breathing/pulse animation
// - Outer glow ring
// - 3 sizes: sm (32px), md (40px), lg (56px)
// - Used as the floating button for the AI chat sidebar
// ──────────────────────────────────────────────────────────────────────────

const SIZES = {
  sm: {
    container: "size-8",
    eye: "size-1.5",
    eyeGap: "gap-1.5",
    glow: "size-10",
  },
  md: {
    container: "size-10",
    eye: "size-2",
    eyeGap: "gap-2",
    glow: "size-12",
  },
  lg: {
    container: "size-14",
    eye: "size-2.5",
    eyeGap: "gap-2.5",
    glow: "size-16",
  },
} as const

type OrbSize = keyof typeof SIZES

export function AIOrbAvatar({
  size = "md",
  className,
}: {
  size?: OrbSize
  className?: string
}) {
  const s = SIZES[size]

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Outer glow — pulsing ring */}
      <div
        className={cn(
          "absolute rounded-full bg-gradient-to-br from-red-700 to-red-900 opacity-40 blur-md",
          s.glow
        )}
        style={{
          animation: "ai-orb-pulse 2s ease-in-out infinite",
        }}
      />

      {/* Orb body — gradient sphere with inner shadow */}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full",
          "bg-gradient-to-br from-red-600 via-red-800 to-red-950",
          s.container
        )}
        style={{
          animation: "ai-orb-breathe 3s ease-in-out infinite",
          boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2)",
        }}
      >
        {/* Shine highlight — top-left light reflection */}
        <div
          className="absolute left-[15%] top-[10%] h-[35%] w-[35%] rounded-full bg-white/30 blur-sm"
          style={{ animation: "ai-orb-shine 4s ease-in-out infinite" }}
        />

        {/* Eyes — two white dots that blink */}
        <div className={cn("relative flex items-center", s.eyeGap)}>
          <div
            className={cn("rounded-full bg-white", s.eye)}
            style={{
              animation: "ai-orb-blink 4s ease-in-out infinite",
              boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            }}
          />
          <div
            className={cn("rounded-full bg-white", s.eye)}
            style={{
              animation: "ai-orb-blink 4s ease-in-out infinite",
              boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            }}
          />
        </div>

        {/* Inner gradient overlay for depth */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-transparent to-white/5" />
      </div>
    </div>
  )
}

export default AIOrbAvatar
