"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

// GooeyNav — navigation with morphing active pill.
// Based on reactbits.dev/components/gooey-nav
// The active pill slides between items using framer-motion's layoutId.
// The gooey SVG filter creates a subtle "melting" effect on the pill edges.

type NavItem = {
  key: string
  label: string
  icon?: React.ReactNode
}

type GooeyNavProps = {
  items: NavItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function GooeyNav({ items, active, onChange, className }: GooeyNavProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === active))

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-1 rounded-full bg-white/5 p-1",
        className
      )}
    >
      {items.map((item, index) => {
        const isActive = index === activeIndex
        const isHovered = item.key === hoveredKey
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            onMouseEnter={() => setHoveredKey(item.key)}
            onMouseLeave={() => setHoveredKey(null)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-300 sm:text-sm",
              isActive ? "text-white" : "text-white/60 hover:text-white/90"
            )}
          >
            {/* Active pill — slides between buttons using layoutId */}
            {isActive && (
              <motion.div
                layoutId="gooey-active-pill"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{
                  type: "spring",
                  damping: 22,
                  stiffness: 320,
                  mass: 0.8,
                }}
              />
            )}
            {/* Hover glow */}
            {isHovered && !isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-white/10"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
              />
            )}
            {/* Content (always sharp, above the pill) */}
            <span className="relative z-10 flex items-center gap-1.5">
              {item.icon}
              {item.label && <span className="hidden sm:inline">{item.label}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
