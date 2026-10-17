"use client"

import { Home, Film, Tv, Bookmark, type LucideIcon } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// MobileTabBar — Netflix-style bottom tab bar for phones/tablets (< lg).
//
// WHY: the previous mobile navigation was a row of 28×28 icon-only buttons
// pinned to the TOP of the screen — thumb-hostile (top corners are the
// hardest reach on large phones) and unlabeled. Apple HIG / Material / the
// ui-craft responsive skill all call for bottom navigation for 2–5 top-level
// SECTIONS on mobile.
//
// Design notes:
//   • Active tab = white (Netflix-authentic); inactive = 60% white.
//   • Every target is ≥ 56px tall and ~1/4 of the screen wide (≥ 44pt HIG
//     minimum with generous breathing room between neighbors).
//   • `active:scale-95` gives instant tactile press feedback on touch.
//   • `env(safe-area-inset-bottom)` padding keeps tabs clear of the iOS
//     home indicator on notched devices (viewportFit: cover is set in layout).
//   • The page wrapper adds matching bottom padding (see page.tsx) so the
//     footer/content never scroll under the bar.
//   • z-40: above page content, below every modal (navbar z-50, overlays
//     z-90+), so open dialogs cover it completely.
//   • Hidden ≥ lg where the desktop GooeyNav in the top navbar takes over.
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around" role="tablist">
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
                "flex min-h-[56px] min-w-11 flex-1 select-none flex-col items-center justify-center gap-1 py-2 transition-transform duration-150 active:scale-90",
                isActive ? "text-white" : "text-white/60"
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[10px] font-semibold leading-none",
                  isActive ? "text-white" : "text-white/60"
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
