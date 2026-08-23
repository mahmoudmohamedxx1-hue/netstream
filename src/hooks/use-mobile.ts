import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TV_BREAKPOINT = 1920 // TV screens are typically 1920x1080+

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  React.useEffect(() => {
    // Use matchMedia if available (modern browsers), fallback to resize
    const mql = window.matchMedia ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`) : null
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    if (mql) {
      // addEventListener for modern, addListener for older Safari
      if (mql.addEventListener) {
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
      } else if (mql.addListener) {
        mql.addListener(onChange)
        return () => mql.removeListener(onChange)
      }
    }
    // Fallback: resize event
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
  }, [])

  return isMobile
}

// Detect Smart TV browsers — they have limited CSS/JS support
export function useIsTV() {
  const [isTV, setIsTV] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const ua = navigator.userAgent.toLowerCase()
    // Common Smart TV browser user agents
    return ua.includes("tv") || ua.includes("smarttv") || ua.includes("hbbtv") ||
           ua.includes("netcast") || ua.includes("viera") || ua.includes("bravia") ||
           ua.includes("tizen") || ua.includes("webos") || ua.includes("opera tv") ||
           ua.includes("ce-html") || (window.innerWidth >= TV_BREAKPOINT && ua.includes("samsung"))
  })
  return isTV
}
