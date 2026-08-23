// Cross-browser fetch timeout — AbortSignal.timeout() is not available
// on older Safari (iPhone < 16), Smart TV browsers, and older Chrome.
// This polyfill uses AbortController + setTimeout instead.

export function fetchWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...fetchOptions } = options
  
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    // Use native AbortSignal.timeout if available (modern browsers)
    return fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(timeoutMs) })
  }
  
  // Fallback: manual AbortController + setTimeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  
  return fetch(url, { ...fetchOptions, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}
