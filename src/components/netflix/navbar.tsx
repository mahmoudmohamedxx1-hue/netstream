"use client"

import { useEffect, useState } from "react"
import { Search, Languages, Home, Film, Tv, Bookmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import DecryptedText from "@/components/react-bits/DecryptedText"
import { GooeyNav } from "@/components/react-bits/GooeyNav"

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
  onProfile: () => void
  active?: string
  onNav?: (key: string) => void
}

export function Navbar({ onSearch, onProfile, active = "home", onNav }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const { t, toggle, isArabic } = useLang()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // GooeyNav items with icons for Movies/Series types
  const navItems = [
    { key: "home", label: t("home"), icon: <Home className="h-4 w-4" /> },
    { key: "series", label: t("series"), icon: <Tv className="h-4 w-4" /> },
    { key: "movies", label: t("movies"), icon: <Film className="h-4 w-4" /> },
    { key: "mylist", label: t("mylist"), icon: <Bookmark className="h-4 w-4" /> },
  ]

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "bg-[#0a0a0a]"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      )}
    >
      <nav className="flex h-16 items-center gap-4 px-4 sm:h-16 sm:px-8">
        {/* Logo with DecryptedText effect — hover to decrypt (slower, red) */}
        <button
          onClick={() => onNav?.("home")}
          className="shrink-0"
          aria-label="NetStream home"
        >
          <DecryptedText
            text="NETSTREAM"
            speed={120}
            maxIterations={15}
            animateOn="hover"
            sequential={true}
            revealDirection="start"
            className="text-xl font-black tracking-tight text-primary sm:text-2xl"
            parentClassName="text-xl font-black tracking-tight text-primary sm:text-2xl"
            encryptedClassName="text-xl font-black tracking-tight text-primary/50 sm:text-2xl"
            style={{ letterSpacing: "-0.04em" }}
          />
        </button>

        {/* GooeyNav — desktop */}
        <div className="ml-2 hidden lg:block">
          <GooeyNav
            items={navItems}
            active={active}
            onChange={(key) => onNav?.(key)}
          />
        </div>

        {/* GooeyNav — mobile/tablet (compact) */}
        <div className="ml-1 lg:hidden">
          <GooeyNav
            items={navItems.map((item) => ({ ...item, label: "" }))}
            active={active}
            onChange={(key) => onNav?.(key)}
            className="!gap-0.5 !p-0.5"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Language toggle (EN ↔ AR with RTL flip) */}
          <button
            onClick={toggle}
            aria-label="Toggle language"
            title={isArabic ? "Switch to English" : "التبديل إلى العربية"}
            className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <Languages className="h-4 w-4" />
            <span>{isArabic ? "EN" : "ع"}</span>
          </button>
          <button
            onClick={onSearch}
            aria-label={t("search")}
            className="rounded-full p-2 text-white transition hover:bg-white/10"
          >
            <Search className="h-5 w-5" />
          </button>
          {/* Profile / Play by IMDB ID */}
          <button
            onClick={onProfile}
            aria-label={t("playImdb")}
            title={t("playImdb")}
            className="flex items-center gap-1.5 rounded p-0.5 transition hover:opacity-80"
          >
            <span className="hidden text-xs font-medium text-white/80 sm:inline">
              {t("playImdb")}
            </span>
            <span className="grid h-8 w-8 place-items-center rounded bg-gradient-to-br from-primary to-red-700 text-sm font-bold text-white ring-2 ring-white/0 transition hover:ring-white/40">
              U
            </span>
          </button>
        </div>
      </nav>
    </header>
  )
}
