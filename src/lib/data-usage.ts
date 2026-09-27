// Estimated data usage per hour by video quality tier.
// These are rough averages based on typical streaming bitrates:
//   4K      ≈ 15-20 Mbps → ~7-9 GB/hr (we use 7 GB)
//   1080p   ≈ 5-8 Mbps   → ~2.5-3.5 GB/hr (we use 3 GB)
//   720p HD ≈ 2.5-4 Mbps → ~1.2-1.8 GB/hr (we use 1.5 GB)
//   480p    ≈ 1-1.5 Mbps → ~0.5-0.7 GB/hr (we use 0.5 GB)
//   SD/360p ≈ 0.5-0.8 Mbps → ~0.2-0.4 GB/hr (we use 0.3 GB)
//
// Real file sizes from iframe providers are NOT obtainable (cross-origin),
// so these estimates help users pick a server that matches their data budget.

export type QualityTier = {
  /** Label shown in the UI, e.g. "1080p" */
  label: string
  /** Estimated GB per hour */
  gbPerHour: number
  /** Short tag for badges */
  tag: "4K" | "HD" | "FHD" | "SD"
  /** Color class for the badge */
  color: string
}

/** Parse the `quality` string from a VideoSource into a QualityTier. */
export function parseQuality(quality: string): QualityTier {
  const q = quality.toLowerCase().trim()
  if (q.includes("4k") || q.includes("2160")) {
    return { label: "4K", gbPerHour: 7, tag: "4K", color: "text-violet-400 bg-violet-500/15" }
  }
  if (q.includes("1080") || q.includes("fhd")) {
    return { label: "1080p", gbPerHour: 3, tag: "FHD", color: "text-sky-400 bg-sky-500/15" }
  }
  if (q.includes("720") || q === "hd") {
    return { label: "720p", gbPerHour: 1.5, tag: "HD", color: "text-emerald-400 bg-emerald-500/15" }
  }
  if (q.includes("480")) {
    return { label: "480p", gbPerHour: 0.5, tag: "SD", color: "text-amber-400 bg-amber-500/15" }
  }
  if (q.includes("sd") || q.includes("360") || q.includes("low")) {
    return { label: "SD", gbPerHour: 0.3, tag: "SD", color: "text-amber-400 bg-amber-500/15" }
  }
  // "Multi" or unknown — assume 1080p as a safe middle ground
  return { label: quality || "Auto", gbPerHour: 3, tag: "FHD", color: "text-sky-400 bg-sky-500/15" }
}

/** Format GB to a human-readable string. */
export function formatDataUsage(gb: number): string {
  if (gb >= 1) {
    // Round to 1 decimal if not whole
    const rounded = Math.round(gb * 10) / 10
    return `${rounded} GB`
  }
  // Convert to MB
  const mb = Math.round(gb * 1024)
  return `${mb} MB`
}

/** Estimate total data for a title given quality and runtime in minutes.
 * Returns formatted string like "≈ 4.5 GB" or "≈ 850 MB". */
export function estimateTotalData(quality: string, runtimeMinutes?: number): string {
  if (!runtimeMinutes || runtimeMinutes <= 0) {
    const tier = parseQuality(quality)
    return `~${formatDataUsage(tier.gbPerHour)}/hr`
  }
  const tier = parseQuality(quality)
  const hours = runtimeMinutes / 60
  const totalGb = tier.gbPerHour * hours
  return `≈ ${formatDataUsage(totalGb)}`
}

/** Estimate hourly data for a quality string. Returns formatted string. */
export function estimateHourlyData(quality: string): string {
  const tier = parseQuality(quality)
  return `~${formatDataUsage(tier.gbPerHour)}/hr`
}
