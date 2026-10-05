"use client"

// ─────────────────────────────────────────────────────────────────────────────
// DownloadsPanel — slide-over panel listing the persistent download history
// (see src/lib/download-history.ts). Opened from the navbar download button.
//
//   • Live-updates: listens for the "netstream:dl-history-changed" event that
//     the history lib dispatches on every mutation.
//   • Re-download reopens the DownloadHelper preloaded with the record's
//     title/season/episode (handled by the parent page).
//   • RTL-aware: uses logical `end-*` utilities so it slides from the correct
//     side in Arabic.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Trash2, RotateCw, Download as DownloadIcon, CheckCircle2,
  XCircle, Ban, Server, Zap, FileVideo, Film, Tv,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { Poster } from "./poster"
import {
  removeDownloadRecord, clearDownloadHistory, getDownloadHistorySnapshot,
  EMPTY_DOWNLOAD_HISTORY, DL_HISTORY_EVENT, type DownloadRecord,
} from "@/lib/download-history"
import { useLanguage } from "@/hooks/use-language"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  onRedownload: (rec: DownloadRecord) => void
}

function fmtDate(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleDateString()
  }
}

export function DownloadsPanel({ open, onClose, onRedownload }: Props) {
  const { t, isArabic } = useLanguage()

  // The history is an external store (lib dispatches DL_HISTORY_EVENT on every
  // mutation). Subscribing keeps the list live even while the panel is closed
  // — a download finishing elsewhere updates it instantly on reopen.
  const items = useSyncExternalStore(
    (cb) => {
      window.addEventListener(DL_HISTORY_EVENT, cb)
      return () => window.removeEventListener(DL_HISTORY_EVENT, cb)
    },
    getDownloadHistorySnapshot,
    () => EMPTY_DOWNLOAD_HISTORY
  )

  // Esc to close + scroll lock.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const locale = isArabic ? "ar" : "en"

  const statusChip = (rec: DownloadRecord) => {
    switch (rec.status) {
      case "done":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
            <CheckCircle2 className="size-3" /> {t("dlStatusDone")}
          </span>
        )
      case "started":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60">
            <Server className="size-3" /> {t("dlStatusStarted")}
          </span>
        )
      case "canceled":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/50">
            <Ban className="size-3" /> {t("dlStatusCanceled")}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
            <XCircle className="size-3" /> {t("dlStatusFailed")}
          </span>
        )
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[290] bg-black/70"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label={t("dlHistoryTitle")}
            dir={isArabic ? "rtl" : "ltr"}
            className="fixed inset-y-0 end-0 z-[295] flex w-full flex-col border-white/10 bg-[#111111] shadow-2xl sm:w-[430px]"
            initial={{ x: isArabic ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: isArabic ? "-100%" : "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
              <DownloadIcon className="h-5 w-5 shrink-0 text-primary" />
              <h2 className="text-lg font-bold text-white">{t("dlHistoryTitle")}</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
                {items.length}
              </span>
              <button
                onClick={onClose}
                aria-label="Close downloads panel"
                className="ms-auto rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 py-4 nf-scroll">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05]">
                    <FileVideo className="h-7 w-7 text-white/25" />
                  </div>
                  <p className="text-base font-semibold text-white">{t("dlHistoryEmpty")}</p>
                  <p className="text-sm leading-relaxed text-white/50">{t("dlHistoryEmptyDesc")}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((rec) => (
                    <li
                      key={rec.id}
                      className="group flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:border-white/15"
                    >
                      {/* Poster thumb */}
                      <div className="h-[75px] w-[52px] shrink-0 overflow-hidden rounded-md bg-neutral-800">
                        <Poster title={rec.title} src={rec.poster} className="h-full w-full" />
                      </div>

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white" title={rec.title}>
                            {rec.title}
                          </p>
                          {rec.type === "series" && rec.season != null && (
                            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/60">
                              S{rec.season}E{rec.episode}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/50">
                          {statusChip(rec)}
                          <span className="inline-flex items-center gap-1">
                            {rec.mode === "browser" ? <Zap className="size-3 text-yellow-400/80" /> : <Server className="size-3 text-white/40" />}
                            {rec.mode === "browser" ? t("dlModeBrowser") : t("dlModeServer")}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            {rec.type === "series" ? <Tv className="size-3" /> : <Film className="size-3" />}
                            {rec.container.toUpperCase()} · {rec.quality}
                          </span>
                        </div>

                        <p className="mt-1 truncate text-[11px] text-white/40">
                          {rec.sizeText !== "—" ? `${rec.sizeText} · ` : ""}{fmtDate(rec.at, locale)}
                          {rec.error ? ` · ${rec.error}` : ""}
                        </p>

                        {/* Actions */}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => { onRedownload(rec); onClose() }}
                            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary hover:text-white"
                          >
                            <RotateCw className="size-3" /> {t("dlRedownload")}
                          </button>
                          <button
                            onClick={() => { removeDownloadRecord(rec.id) }}
                            aria-label={`${t("dlRemoveEntry")}: ${rec.title}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/40 transition hover:bg-white/10 hover:text-red-400"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer — clear all */}
            {items.length > 0 && (
              <div className="border-t border-white/10 px-5 py-3">
                <button
                  onClick={() => { clearDownloadHistory() }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-white/45 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                  {t("dlClearHistory")}
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
