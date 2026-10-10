"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Monitor, Smartphone, Download } from "lucide-react"

export function DownloadDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Download App"
        title="Download App"
        className="rounded-full p-2 text-white transition hover:bg-white/10"
      >
        <Download className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 24, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="p-6">
                <h2 className="mb-1 text-xl font-bold text-white">Download NetStream</h2>
                <p className="mb-5 text-sm text-white/50">Choose your platform</p>

                <div className="space-y-3">
                  {/* Windows */}
                  <a
                    href="/NetStream-Windows.zip"
                    download
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/30 hover:bg-white/[0.07]"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-500/10">
                      <Monitor className="h-6 w-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Windows PC</p>
                      <p className="text-xs text-white/50">Standalone EXE — 90MB</p>
                    </div>
                    <Download className="h-4 w-4 text-white/40" />
                  </a>

                  {/* Android */}
                  <a
                    href="/NetStream.apk"
                    download
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/30 hover:bg-white/[0.07]"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-green-500/10">
                      <Smartphone className="h-6 w-6 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Android</p>
                      <p className="text-xs text-white/50">Standalone APK — 25KB</p>
                    </div>
                    <Download className="h-4 w-4 text-white/40" />
                  </a>
                </div>

                <p className="mt-4 rounded-md bg-white/[0.04] p-2.5 text-[11px] leading-relaxed text-white/50">
                  The Windows app bundles the full Next.js server and runs
                  locally. The Android app is a standalone WebView with all
                  features built in — no server needed.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
