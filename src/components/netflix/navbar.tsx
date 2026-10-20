"use client"

import { useEffect, useState } from "react"
import { Search, Languages, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import DecryptedText from "@/components/react-bits/DecryptedText"

// Ad-block toggle state — shared across the app via localStorage.
// (Exported for use by player-modal.tsx; the navbar itself no longer exposes
// the toggle button — it was cluttering the top bar. The user can still flip
// this via the player-modal controls if needed.)
const AD_BLOCK_KEY = "netstream:adblock"
export function getAdBlockEnabled(): boolean {
  if (typeof window === "undefined") return true
  try { return localStorage.getItem(AD_BLOCK_KEY) !== "false" } catch { return true }
}
export function setAdBlockEnabled(enabled: boolean) {
  try { localStorage.setItem(AD_BLOCK_KEY, String(enabled)) } catch {}
}

type Props = {
  onSearch: () => void
  onNav?: (key: string) => void
  onDownloads?: () => void
}

export function Navbar({ onSearch, onNav, onDownloads }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const { t, toggle, isArabic } = useLang()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Primary navigation lives in the bottom tab bar on EVERY screen size now
  // (MobileTabBar: full-width thumb bar < lg, centered floating pill dock on
  // desktop) — the top navbar is logo + actions only, matching the mobile
  // edition's layout on the browser edition.

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? // Frosted glass on scroll — the modern premium idiom (Apple TV+ /
            // maxtv): translucent near-black + backdrop blur + a hairline
            // bottom border + a soft drop shadow, instead of flat solid black.
            "border-b border-white/[0.06] bg-[#0a0a0a]/75 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      )}
    >
      {/* Safe-area top padding: in PWA standalone mode (viewportFit: cover)
          the fixed header would sit under the notch / Dynamic Island without
          it. In regular browser mode the inset is 0 — no visual change. */}
      <nav
        className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-8"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Logo with DecryptedText effect — hover to decrypt (slower, red).
            Fixed width + overflow hidden so the character-shuffling animation
            doesn't cause the navbar to shift horizontally. */}
        <button
          onClick={() => onNav?.("home")}
          className="relative flex h-9 w-[120px] shrink-0 items-center overflow-hidden sm:w-[165px]"
          aria-label="NetStream home" data-testid="logo"
        >
          <DecryptedText
            text="NETSTREAM"
            speed={120}
            maxIterations={15}
            animateOn="hover"
            sequential={true}
            revealDirection="start"
            className="text-lg font-black tracking-tight text-primary sm:text-2xl"
            parentClassName="text-lg font-black tracking-tight text-primary sm:text-2xl"
            encryptedClassName="text-lg font-black tracking-tight text-primary/50 sm:text-2xl"
            style={{ letterSpacing: "-0.04em" }}
          />
        </button>

        {/* Primary navigation is the bottom tab bar (all screen sizes) —
            the navbar keeps logo + language/downloads/search, exactly like
            the mobile edition. */}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Language toggle (EN ↔ AR with RTL flip) — 44×44 touch target */}
          <button
            onClick={toggle}
            aria-label="Toggle language" data-testid="language-toggle"
            title={isArabic ? "Switch to English" : "التبديل إلى العربية"}
            className="flex h-11 w-11 items-center justify-center gap-1 rounded-full text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <Languages className="h-5 w-5" />
            <span className="hidden sm:inline">{isArabic ? "EN" : "ع"}</span>
          </button>
          {/* Downloads history panel — 44×44 touch target */}
          {onDownloads && (
            <button
              onClick={onDownloads}
              aria-label="Downloads" data-testid="downloads-button"
              title={t("dlHistoryTitle")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-90"
            >
              <Download className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onSearch}
            aria-label={t("search")} data-testid="search-button"
            title={`${t("search")} (/)`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-90"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </nav>
    </header>
  )
}
