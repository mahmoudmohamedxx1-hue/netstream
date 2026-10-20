"use client"

// ScrollToTop — floating "back to top" button for the long browse pages.
//
// Appears (scale+fade) once the user has scrolled past 600px, disappears when
// they return near the top. Positioned bottom-right, ABOVE the mobile tab bar
// (56px bar + safe-area inset) and clear of the desktop floating dock (the
// dock is centered, so bottom-24/right-6 never collides with it).
//
// Mount it INSIDE <main> so it auto-hides whenever the player or title-detail
// overlay takes over the page (main gets display:none in that state).
//
// The scroll listener is passive + requestAnimationFrame-throttled — one
// state update per frame max, zero jank on 120Hz displays. Reduced-motion
// users get an instant appear/disappear via the global MotionConfig.

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp } from "lucide-react"

const SHOW_AFTER_PX = 600

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setVisible(window.scrollY > SHOW_AFTER_PX)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={toTop}
          aria-label="Back to top"
          className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-[#181818]/85 text-white shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md transition-colors hover:bg-[#232323]/90 active:scale-90 lg:bottom-24 lg:right-6"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
