"use client"

// Error boundary — catches any uncaught runtime error in the app and shows
// a Netflix-style error page instead of a blank white screen.
// Next.js App Router automatically wraps each route segment in this boundary.

import { useEffect } from "react"
import { AlertTriangle, RotateCw, Home } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console for debugging (production builds strip this)
    console.error("[NetStream Error Boundary]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mb-2 max-w-md text-sm text-white/60">
        An unexpected error occurred while loading NetStream.
      </p>
      {error?.message && (
        <p className="mb-6 max-w-md break-words rounded-lg bg-white/5 px-4 py-2 text-xs text-white/40">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          <RotateCw className="h-4 w-4" />
          Try Again
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
        >
          <Home className="h-4 w-4" />
          Go Home
        </button>
      </div>
    </div>
  )
}
