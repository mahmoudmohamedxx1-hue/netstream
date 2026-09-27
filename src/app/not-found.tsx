import Link from "next/link"
import { Home, Search } from "lucide-react"

// 404 page — Netflix-style "not found" screen.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center">
      <h1 className="mb-2 text-6xl font-black text-primary sm:text-8xl">404</h1>
      <h2 className="mb-3 text-xl font-bold text-white sm:text-2xl">
        Page Not Found
      </h2>
      <p className="mb-8 max-w-md text-sm text-white/60">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          <Home className="h-4 w-4" />
          Back to Home
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
        >
          <Search className="h-4 w-4" />
          Browse Titles
        </Link>
      </div>
    </div>
  )
}
