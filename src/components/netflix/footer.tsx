"use client"

import { Github, Twitter, Instagram, Youtube, Smartphone, Download } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { CurvedLoop } from "@/components/react-bits/CurvedLoop"
import DecryptedText from "@/components/react-bits/DecryptedText"

// Footer — pro layout: quick-navigation links (real actions via onNav, never
// dead "#"), app download card, socials, TMDB attribution (required when
// using TMDB data, and a credibility marker), and the disclaimer.
//
// onNav is optional so the footer still renders standalone (e.g. future
// static pages) — links are simply omitted when it's absent.
export function Footer({ onNav }: { onNav?: (k: string) => void }) {
  const { t, isArabic } = useLang()

  const quickLinks: Array<{ key: string; label: string }> = [
    { key: "home", label: t("home") },
    { key: "series", label: t("series") },
    { key: "movies", label: t("movies") },
    { key: "mylist", label: t("mylist") },
  ]

  return (
    <footer className="mt-auto border-t border-white/5 bg-[#0a0a0a] px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-white/60 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* CurvedLoop — "Made✦by✦Glabs✦" infinite scrolling text */}
        <div className="mb-8">
          <CurvedLoop
            text="Made✦by✦Glabs✦"
            speed={40}
            color="#e50914"
          />
        </div>

        {/* App download section */}
        <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Download className="h-4 w-4 text-primary" />
            {t("getTheApp")}
          </h3>
          <p className="mb-4 text-xs text-white/50">
            {t("downloadAndroid")} — {t("forMovieLovers")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/NetStream.apk"
              download
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:border-primary/40 hover:bg-white/10"
            >
              <Smartphone className="h-4 w-4" />
              <div className="flex flex-col">
                <span className="text-[9px] text-white/50">Android</span>
                <span>APK</span>
              </div>
            </a>
          </div>
        </div>

        {/* Quick navigation — functional links to the four main views.
            Buttons (not <a href="#">) because navigation is client-side
            state (see page.tsx handleSetNav). */}
        {onNav && (
          <nav aria-label="Footer" className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
            {quickLinks.map((l) => (
              <button
                key={l.key}
                onClick={() => onNav(l.key)}
                className="rounded transition hover:text-white active:scale-95"
              >
                {l.label}
              </button>
            ))}
          </nav>
        )}

        <div className="mb-6 flex items-center gap-4">
          <a href="https://github.com/mahmoudmohamedxx1-hue/netstream" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="inline-flex -m-2 items-center justify-center p-3 transition hover:text-white">
            <Github className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Twitter" className="inline-flex -m-2 items-center justify-center p-3 transition hover:text-white">
            <Twitter className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Instagram" className="inline-flex -m-2 items-center justify-center p-3 transition hover:text-white">
            <Instagram className="h-5 w-5" />
          </a>
          <a href="#" aria-label="YouTube" className="inline-flex -m-2 items-center justify-center p-3 transition hover:text-white">
            <Youtube className="h-5 w-5" />
          </a>
        </div>

        {/* TMDB attribution — required by TMDB's terms of use when their
            data/posters power the product, and a credibility marker. */}
        <p className="mt-6 text-xs text-white/40">
          {isArabic ? "بيانات وصور المنتج مقدَّمة من " : "Product data & images by "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white/60 underline decoration-white/30 underline-offset-2 transition hover:text-white hover:decoration-white/60"
          >
            TMDB
          </a>
          {isArabic ? "." : "."}
        </p>
        <p className="mt-2 text-xs text-white/40">
          {t("disclaimer")}
        </p>
        <p className="mt-2 text-xs text-white/40">
          © {new Date().getFullYear()} NetStream. {t("madeWith")} Next.js.
        </p>
      </div>
    </footer>
  )
}
