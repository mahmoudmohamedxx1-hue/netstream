"use client"

// CurvedLoop — infinite scrolling text in a straight line across the footer.
// Uses CSS animation for smooth, GPU-accelerated scrolling.
// Text: "Made✦by✦Glabs✦" repeating, scrolling left infinitely.

type CurvedLoopProps = {
  text?: string
  className?: string
  color?: string
  speed?: number // seconds for one full loop (lower = faster)
}

export function CurvedLoop({
  text = "Made✦by✦Glabs✦",
  className = "",
  color = "#e50914",
  speed = 40
}: CurvedLoopProps) {
  const unit = text + " ✦ "
  // Repeat enough times to fill a very wide area — both halves must be identical
  const repeatText = unit.repeat(30)

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "30px",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          whiteSpace: "nowrap",
          animation: `curved-loop-scroll ${speed}s linear infinite`,
          willChange: "transform",
        }}
      >
        {/* First copy */}
        <span
          style={{
            color: color,
            fontSize: "18px",
            fontWeight: "800",
            letterSpacing: "4px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            paddingRight: "30px",
          }}
        >
          {repeatText}
        </span>
        {/* Exact duplicate — when first copy scrolls fully off screen left,
            this one takes its place, creating a seamless infinite loop */}
        <span
          style={{
            color: color,
            fontSize: "18px",
            fontWeight: "800",
            letterSpacing: "4px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            paddingRight: "30px",
          }}
          aria-hidden
        >
          {repeatText}
        </span>
      </div>
      <style>{`
        @keyframes curved-loop-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
