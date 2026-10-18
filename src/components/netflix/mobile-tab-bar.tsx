"use client"

import { motion } from "framer-motion"
import { Home, Film, Tv, Bookmark, type LucideIcon } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// MobileTabBar — Netflix-style bottom navigation on EVERY screen size.
//
// MOBILE (< lg): full-width tab bar pinned to the bottom edge — thumb-zone,
// icon-over-label tabs, ≥56px targets, safe-area inset for the home indicator.
//
// DESKTOP (lg+): the SAME navigation rendered as a centered floating pill
// dock — "the mobile edition on the browser edition". App-dock styling:
// rounded-full glassy pill, 44px tabs with icon + label side by side, hover
// states, focus-visible rings for keyboard users, and a framer-motion
// layoutId pill that slides/morphs between tabs (carrying over the old
// GooeyNav's signature morph into the dock).
//
// Design notes:
//   • Active tab: white — Netflix-authentic on mobile (white text); on
//     desktop a filled white pill with black icon+text for a strong
//     app-dock affordance.
//   • Every target is ≥ 44px in both variants (56px rows on mobile).
//   • `active:scale` press feedback everywhere (90 mobile / 95 desktop).
//   • `env(safe-area-inset-bottom)` padding keeps tabs clear of the iOS
//     home indicator on notched devices (0 on desktop — no-op).
//   • z-40: above page content, below every modal (navbar z-50, overlays
//     z-90+), so open dialogs cover it completely.
//   • The page wrapper adds matching bottom padding (see page.tsx) so the
//     footer/content never scroll under the bar or the floating dock.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = { key: string; label: string; icon: LucideIcon }

export function MobileTabBar({
  active,
  onNav,
}: {
  active: string
  onNav: (key: string) => void
}) {
  const { t } = useLang()

  const tabs: Tab[] = [
    { key: "home", label: t("home"), icon: Home },
    { key: "series", label: t("series"), icon: Tv },
    { key: "movies", label: t("movies"), icon: Film },
    { key: "mylist", label: t("mylist"), icon: Bookmark },
  ]

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md",
        // Desktop (lg+): centered floating pill dock — same tabs & behavior,
        // app-dock presentation (the mobile edition's navigation, desktopified)
        "lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:rounded-full lg:border lg:border-white/10 lg:bg-[#141414]/90 lg:shadow-[0_10px_36px_rgba(0,0,0,0.65)] lg:backdrop-blur-xl"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="mx-auto flex max-w-lg items-stretch justify-around lg:max-w-none lg:items-center lg:justify-center lg:gap-1 lg:px-2 lg:py-2"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNav(tab.key)}
              className={cn(
                "relative flex min-h-[56px] min-w-11 flex-1 select-none flex-col items-center justify-center gap-1 py-2 transition-all duration-150 active:scale-90",
                // Desktop pill tab: 44px tall, icon + label inline, hover &
                // keyboard-focus affordances, subtler press scale for mouse
                "lg:h-11 lg:min-h-11 lg:w-auto lg:flex-none lg:flex-row lg:gap-2.5 lg:rounded-full lg:px-5 lg:py-0 lg:duration-200 lg:active:scale-95 lg:focus-visible:outline-2 lg:focus-visible:outline-offset-2 lg:focus-visible:outline-primary",
                isActive
                  ? "text-white lg:text-black"
                  : "text-white/60 lg:text-white/70 lg:hover:bg-white/10 lg:hover:text-white lg:focus-visible:text-white"
              )}
            >
              {/* Desktop: sliding active pill — morphs between tabs */}
              {isActive && (
                <motion.span
                  layoutId="tab-dock-active-pill"
                  className="absolute inset-0 hidden rounded-full bg-white lg:block"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              )}
              <Icon
                className="relative h-[22px] w-[22px] lg:h-[18px] lg:w-[18px]"
                strokeWidth={isActive ? 2.4 : 2}
              />
              <span
                className={cn(
                  "relative max-w-full truncate px-1 text-[10px] font-semibold leading-none lg:px-0 lg:text-[13px]",
                  isActive ? "text-white lg:text-black" : "text-white/60 lg:text-inherit"
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
