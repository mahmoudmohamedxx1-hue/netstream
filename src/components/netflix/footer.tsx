"use client"

import { Github, Twitter, Instagram, Youtube, Smartphone, Download } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { CurvedLoop } from "@/components/react-bits/CurvedLoop"
import DecryptedText from "@/components/react-bits/DecryptedText"

export function Footer() {
  const { t } = useLang()
  return (
    <footer className="mt-auto border-t border-white/5 bg-[#0a0a0a] px-4 py-10 text-white/60 sm:px-8">
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

        <div className="mb-6 flex items-center gap-4">
          <a href="#" aria-label="GitHub" className="transition hover:text-white">
            <Github className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Twitter" className="transition hover:text-white">
            <Twitter className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Instagram" className="transition hover:text-white">
            <Instagram className="h-5 w-5" />
          </a>
          <a href="#" aria-label="YouTube" className="transition hover:text-white">
            <Youtube className="h-5 w-5" />
          </a>
        </div>

        <p className="mt-6 text-xs text-white/40">
          {t("disclaimer")}
        </p>
        <p className="mt-2 text-xs text-white/40">
          © {new Date().getFullYear()} NetStream. {t("madeWith")} Next.js.
        </p>
      </div>
    </footer>
  )
}
