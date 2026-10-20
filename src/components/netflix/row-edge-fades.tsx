// Netflix-style edge fades for horizontal content rows.
//
// Posters that get clipped by the row scroller's viewport edge dissolve into
// the page background instead of being hard-cut — the signature row treatment
// on Netflix / Prime Video / Disney+. Rendered as two pointer-events-none
// gradient strips pinned to the left/right edges of the row's `relative`
// wrapper (which should wrap ONLY the scroller, not the row header, so the
// fades never darken the heading text).
//
// z-[5]: above the cards at rest (z-auto) so the dissolve reads, below the
// scroll arrows (z-10) and below hover-scaled cards (specular-card-outline
// bumps to z-10 on hover) so an expanded card always wins.

import { cn } from "@/lib/utils"

export function RowEdgeFades({ className }: { className?: string }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/55 to-transparent sm:w-14",
          className
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/55 to-transparent sm:w-14",
          className
        )}
      />
    </>
  )
}
