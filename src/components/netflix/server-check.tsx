"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Activity, Check, XCircle, Loader2, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type ServerResult = {
  id: string
  name: string
  quality: string
  tier: number
  logo: string
  color: string
  mobile: boolean
  region: "Global" | "Arabic" | "Indonesian"
  ok: boolean
  status: number
  url: string
}

type Props = {
  open: boolean
  onClose: () => void
  imdbId: string
  type: "movie" | "series"
  season?: number
  episode?: number
  onSelectServer: (serverId: string) => void
}

export function ServerCheck({ open, onClose, imdbId, type, season, episode, onSelectServer }: Props) {
  const [results, setResults] = useState<ServerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [tested, setTested] = useState(false)

  const close = useCallback(() => {
    setTested(false)
    setResults([])
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  const runTest = async () => {
    setLoading(true)
    setTested(false)
    setResults([])
    try {
      const params = new URLSearchParams({ imdbId, type })
      if (season) params.set("season", String(season))
      if (episode) params.set("episode", String(episode))
      const res = await fetch(`/api/check-servers?${params}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setTested(true)
    }
  }

  useEffect(() => {
    if (open) runTest()
  }, [open])

  const workingCount = results.filter((r) => r.ok).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[96] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl nf-scroll"
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 to-transparent px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">Server Status</h2>
                <p className="text-xs text-white/50">
                  {tested ? `${workingCount}/${results.length} servers responding` : "Testing all servers…"}
                </p>
              </div>
              <button onClick={close} className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-white/50">
                  <Loader2 className="h-5 w-5 animate-spin" /> Testing servers…
                </div>
              )}

              {tested && results.length > 0 && (
                <div className="space-y-1.5">
                  {/* Working servers first */}
                  {[...results]
                    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.tier - b.tier)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { onSelectServer(r.id); close() }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                          r.ok
                            ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10"
                            : "border-red-500/20 bg-red-500/5 opacity-60"
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br text-[11px] font-black text-white ring-1 ring-white/10",
                            r.color
                          )}
                          aria-hidden
                        >
                          {r.logo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {r.name}
                            {r.mobile && <span className="ml-1.5 text-[10px]">📱</span>}
                            {r.region !== "Global" && (
                              <span className="ml-1.5 rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase text-white/60">
                                {r.region}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-white/50">
                            {r.quality} • {r.ok ? `HTTP ${r.status}` : "No response"}
                          </p>
                        </div>
                        {r.ok ? (
                          <ArrowRight className="h-4 w-4 shrink-0 text-white/40" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-red-400/60" />
                        )}
                      </button>
                    ))}
                  <p className="mt-3 rounded-md bg-white/[0.04] p-2 text-[11px] text-white/50">
                    Click a working server to switch instantly. Note: this test
                    checks if the server URL is reachable — the video may still
                    require clicking play or dealing with ads.
                  </p>
                  <button
                    onClick={runTest}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-white/10 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    <Activity className="h-3.5 w-3.5" /> Re-test
                  </button>
                </div>
              )}

              {tested && results.length === 0 && (
                <div className="py-8 text-center text-sm text-white/40">
                  No servers responded. Try again later.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
