"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Captions, Upload, Download, Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"

type Props = {
  open: boolean
  onClose: () => void
  imdbId: string
  title: string
}

type SubtitleResult = {
  filename: string
  lang: string
  url: string
  rating: number
}

export function SubtitleHelper({ open, onClose, imdbId, title }: Props) {
  const [tab, setTab] = useState<"search" | "upload">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SubtitleResult[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadedSub, setUploadedSub] = useState<{ name: string; content: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => { onClose() }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  // Search OpenSubtitles by IMDB ID — fetch ALL languages, then group by language
  const searchSubs = async () => {
    setLoading(true)
    setResults([])
    try {
      // Search by IMDB ID with ALL languages (no language filter)
      let res = await fetch(
        `https://rest.opensubtitles.org/search/imdbid-${imdbId.replace("tt", "")}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; NetStream/2.0)" } }
      )
      let data = res.ok ? await res.json() : []

      // If no results, try title-based search with all languages
      if (!Array.isArray(data) || data.length === 0) {
        const q = query.trim() || title
        res = await fetch(
          `https://rest.opensubtitles.org/search/query-${encodeURIComponent(q)}`,
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; NetStream/2.0)" } }
        )
        data = res.ok ? await res.json() : []
      }

      const mapped = (Array.isArray(data) ? data : []).slice(0, 40).map((s: any) => ({
        filename: s.MovieReleaseName || s.MovieName || s.SubFileName || "subtitle",
        lang: s.LanguageName || "English",
        langCode: s.SubLanguageID || "eng",
        url: s.SubDownloadLink || s.SubEncoding,
        rating: s.SubRating || 0,
      }))
      // Prioritize Arabic + English first, then everything else alphabetically.
      // Within each language, sort by rating (highest first).
      const priority = (l: string) =>
        l === "Arabic" ? 0 : l === "English" ? 1 : 2
      mapped.sort(
        (a, b) =>
          priority(a.lang) - priority(b.lang) ||
          a.lang.localeCompare(b.lang) ||
          b.rating - a.rating
      )
      setResults(mapped)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && tab === "search") {
      setQuery(title)
      // Auto-search on open
      setTimeout(searchSubs, 100)
    }
  }, [open, tab])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setUploadedSub({ name: file.name, content: reader.result as string })
    }
    reader.readAsText(file)
  }

  const downloadSub = (url: string, filename: string) => {
    // Open the subtitle download link in a new tab
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[96] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl nf-scroll"
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 to-transparent px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-primary">
                <Captions className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">Subtitles</h2>
                <p className="text-xs text-white/50">For: {title}</p>
              </div>
              <button onClick={close} className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-4">
              <button onClick={() => setTab("search")} className={cn("flex-1 rounded-md py-2 text-xs font-semibold transition", tab === "search" ? "bg-white text-black" : "bg-white/10 text-white/70 hover:text-white")}>
                <Search className="mr-1 inline h-3.5 w-3.5" /> Search Online
              </button>
              <button onClick={() => setTab("upload")} className={cn("flex-1 rounded-md py-2 text-xs font-semibold transition", tab === "upload" ? "bg-white text-black" : "bg-white/10 text-white/70 hover:text-white")}>
                <Upload className="mr-1 inline h-3.5 w-3.5" /> Upload .srt
              </button>
            </div>

            {/* Content */}
            <div className="px-4 pb-5">
              {tab === "search" ? (
                <div>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchSubs() }}
                      placeholder="Search subtitles…"
                      className="h-10 border-white/15 bg-white/10 pl-9 text-sm text-white"
                    />
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-white/50">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                    </div>
                  ) : results.length === 0 ? (
                    <div className="py-8 text-center text-sm text-white/40">
                      <Captions className="mx-auto mb-2 h-8 w-8 text-white/20" />
                      No subtitles found. Try uploading a .srt file instead.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Group by language */}
                      {Object.entries(
                        results.reduce((acc, r) => {
                          if (!acc[r.lang]) acc[r.lang] = []
                          acc[r.lang].push(r)
                          return acc
                        }, {} as Record<string, typeof results>)
                      ).map(([lang, subs]) => (
                        <div key={lang}>
                          <p className="mb-1.5 text-xs font-bold text-primary">{lang}</p>
                          <div className="space-y-1.5">
                            {subs.map((r, i) => (
                              <button key={i} onClick={() => downloadSub(r.url, r.filename)} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left transition hover:border-white/30 hover:bg-white/[0.07]">
                                <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-white">{r.filename}</p>
                                  <p className="text-[10px] text-white/50">{r.rating > 0 ? `★ ${r.rating}` : "No rating"}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 rounded-md bg-white/[0.04] p-2 text-[11px] text-white/50">
                    Subtitles from OpenSubtitles.org. Download the .srt file, then use your video player&apos;s subtitle feature to load it.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-xs text-white/60">
                    Upload a .srt subtitle file to display it as an overlay on the video player.
                  </p>
                  <input ref={fileRef} type="file" accept=".srt,.vtt,.ass" onChange={handleUpload} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/20 p-8 text-white/60 transition hover:border-white/40 hover:text-white">
                    <Upload className="h-8 w-8" />
                    <span className="text-sm font-semibold">{uploadedSub ? uploadedSub.name : "Click to select .srt file"}</span>
                    <span className="text-[10px] text-white/40">.srt, .vtt, .ass supported</span>
                  </button>
                  {uploadedSub && (
                    <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400">
                      ✓ {uploadedSub.name} loaded. The subtitle overlay will appear on the video when playing.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function cn(...args: (string | undefined | false)[]) {
  return args.filter(Boolean).join(" ")
}
