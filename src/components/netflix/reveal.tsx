"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Reveal — scroll-in entrance choreography.
//
// A tiny wrapper that fades + rises its children into view the FIRST time the
// element enters the viewport (IntersectionObserver via framer-motion's
// whileInView, once: true). Uses the app's signature "rise-in" curve — the
// same cubic-bezier(0.2, 0.7, 0.3, 1) as the hero text cascade and the My
// List stagger — so every entrance across the site reads as one motion
// language instead of a pile of unrelated effects.
//
//   • Rows/sections use <Reveal as="section"> (keeps landmark semantics).
//   • Grids use <RevealCard index={i}> for the left→right stagger.
//   • Reduced-motion users automatically get plain opacity fades via the
//     app-level <MotionConfig reducedMotion="user"> wrapper, which strips
//     transform animations but keeps opacity.
//   • `once: true` — the reveal plays a single time per mount; scrolling
//     back up never re-animates (Netflix idiom — re-triggering feels janky
//     and wastes battery). Re-entering a view replays it naturally.
//
// NOTE: variants + variant LABELS (hidden/visible) are deliberately used
// instead of plain-object `initial`/`whileInView` targets. In this app the
// views render inside <AnimatePresence initial={false}>, and with plain
// object targets framer-motion never applies the initial hidden state to
// whileInView elements in that tree (verified empirically — the hero's
// variant-driven cascade works, plain targets don't). The variant-label
// path is the same one the hero text cascade uses, proven to animate here.
// ═══════════════════════════════════════════════════════════════════════════

import { motion, type Variants } from "framer-motion"
import type { ReactNode } from "react"

// The app's signature rise-in easing (hero cascade, My List stagger).
export const REVEAL_EASE: [number, number, number, number] = [0.2, 0.7, 0.3, 1]

type RevealProps = {
  children: ReactNode
  className?: string
  /** Render as <section> instead of <div> (row landmarks). Default "div". */
  as?: "div" | "section"
  /** Rise distance in px. Default 24. */
  y?: number
  id?: string
}

export function Reveal({ children, className, as = "div", y = 24, id }: RevealProps) {
  const Comp = as === "section" ? motion.section : motion.div
  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: REVEAL_EASE } },
  }
  return (
    <Comp
      id={id}
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      // The negative bottom margin shrinks the observation viewport so the
      // element must be meaningfully inside it before the reveal plays — a
      // one-pixel sliver peeking over the fold doesn't fire.
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </Comp>
  )
}

type RevealCardProps = {
  children: ReactNode
  className?: string
  /** Position of this card within its grid/row — drives the stagger delay. */
  index: number
  /** Stagger step per card (seconds). Default 0.04 (40ms). */
  step?: number
  /** Maximum total stagger delay (seconds). Default 0.32 (8 cards). */
  maxDelay?: number
}

// Staggered card entrance for grids (browse grid, search results). The delay
// is computed from the index so cards cascade left→right / top→bottom. In
// infinite-scroll grids the list keeps growing — pass the index WITHIN the
// current page (i % pageSize) so each appended page staggers as a fresh
// group instead of the delay growing without bound.
export function RevealCard({ children, className, index, step = 0.04, maxDelay = 0.32 }: RevealCardProps) {
  const variants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, delay: Math.min(index * step, maxDelay), ease: REVEAL_EASE },
    },
  }
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -5% 0px" }}
    >
      {children}
    </motion.div>
  )
}
