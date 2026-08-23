import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  React.useEffect(() => {
    const mql = window.matchMedia ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`) : null
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    if (mql) {
      if (mql.addEventListener) {
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
      } else if (mql.addListener) {
        mql.addListener(onChange)
        return () => mql.removeListener(onChange)
      }
    }
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
  }, [])

  return isMobile
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT
  })

  React.useEffect(() => {
    const onChange = () => {
      setIsTablet(window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT)
    }
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
  }, [])

  return isTablet
}

// Detect Smart TV browsers — they have limited CSS/JS support and use
// remote controls instead of touch/mouse.
export function useIsTV() {
  const [isTV, setIsTV] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const ua = navigator.userAgent.toLowerCase()

    // Smart TV platforms — each has a distinct user agent
    const tvPlatforms = [
      "tv",           // Generic TV
      "smarttv",      // Smart TV generic
      "hbbtv",        // European HBBTV standard (Samsung, LG, Panasonic, Sony)
      "netcast",      // LG NetCast (older LG TVs)
      "viera",        // Panasonic Viera
      "bravia",       // Sony Bravia
      "tizen",        // Samsung Tizen OS
      "webos",        // LG webOS
      "opera tv",     // Opera TV Store
      "ce-html",      // CE-HTML spec
      "aftt",         // Amazon Fire TV
      "aftm",         // Amazon Fire TV Stick
      "afts",         // Amazon Fire TV Stick 4K
      "aftmm",        // Amazon Fire TV Stick Lite
      "android tv",   // Android TV (Nvidia Shield, Sony TV, etc.)
      "crkey",        // Chromecast
      "googletv",     // Google TV
      "hilink",       // Huawei TV
      "tvstore",      // Opera TV Store
    ]

    // Check for TV-specific user agents
    for (const platform of tvPlatforms) {
      if (ua.includes(platform)) return true
    }

    // Additional check: large screen + no touch + no mouse movement
    // (TV remote doesn't trigger pointer: fine)
    if (window.innerWidth >= 1920 && !("ontouchstart" in window)) {
      // Check if pointer is coarse (remote control) or none
      const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null
      const none = window.matchMedia ? window.matchMedia("(pointer: none)") : null
      if ((coarse?.matches || none?.matches) && ua.includes("samsung")) return true
      if ((coarse?.matches || none?.matches) && ua.includes("lg")) return true
    }

    return false
  })

  return isTV
}

// Detect Android devices (phones + tablets + TV)
export function useIsAndroid() {
  const [isAndroid, setIsAndroid] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return /android/i.test(navigator.userAgent)
  })
  return isAndroid
}

// Detect iOS devices (iPhone + iPad)
export function useIsIOS() {
  const [isIOS, setIsIOS] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const ua = navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) // iPad Pro
  })
  return isIOS
}

// Detect Safari (for Safari-specific CSS fixes)
export function useIsSafari() {
  const [isSafari, setIsSafari] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android")
  })
  return isSafari
}

// Get device type as a string for CSS class targeting
export function useDeviceType() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const isTV = useIsTV()
  const isAndroid = useIsAndroid()
  const isIOS = useIsIOS()

  if (isTV) return "tv"
  if (isMobile) return isIOS ? "ios-mobile" : isAndroid ? "android-mobile" : "mobile"
  if (isTablet) return isIOS ? "ios-tablet" : isAndroid ? "android-tablet" : "tablet"
  return "desktop"
}
