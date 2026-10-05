"use client"

// ─────────────────────────────────────────────────────────────────────────────
// Download history — persistent record of completed/canceled/failed downloads,
// shown in the Downloads panel (navbar button).
//
// Storage: localStorage "netstream:download-history", newest-first, capped at
// 40 entries (older ones fall off the end).
//
// Records are written by DownloadHelper at the END of a download lifecycle
// (done / canceled / failed), plus an entry when a server-mode download is
// handed to the browser's native download manager (status "started" — we
// can't observe the browser's manager from JS).
// ─────────────────────────────────────────────────────────────────────────────

export type DownloadStatus = "done" | "canceled" | "failed" | "started"
export type DownloadMode = "browser" | "server"

export type DownloadRecord = {
  id: string
  imdbId: string
  type: "movie" | "series"
  season: number | null
  episode: number | null
  title: string
  poster: string | null
  filename: string
  container: "mp4" | "ts"
  quality: string
  mode: DownloadMode
  status: DownloadStatus
  bytes: number
  sizeText: string
  error?: string
  at: number // epoch ms
}

const KEY = "netstream:download-history"
const MAX = 40
export const DL_HISTORY_EVENT = "netstream:dl-history-changed"

export function getDownloadHistory(): DownloadRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r): r is DownloadRecord =>
        !!r && typeof r.id === "string" && typeof r.title === "string" && typeof r.at === "number"
      )
      .slice(0, MAX)
  } catch {
    return []
  }
}

function persist(list: DownloadRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch {}
  // Invalidate the useSyncExternalStore snapshot BEFORE dispatching so
  // subscribers that re-read get the new list, not the stale one.
  snapshot = null
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DL_HISTORY_EVENT))
  }
}

// ── useSyncExternalStore glue ──────────────────────────────────────────────
// The panel subscribes to the history as an external store. getSnapshot must
// be referentially stable between mutations (a fresh array every call would
// look like an infinite stream of changes), so we cache and invalidate on
// every persist().
let snapshot: DownloadRecord[] | null = null

export function getDownloadHistorySnapshot(): DownloadRecord[] {
  if (snapshot === null) snapshot = getDownloadHistory()
  return snapshot
}

export const EMPTY_DOWNLOAD_HISTORY: DownloadRecord[] = []

export function addDownloadRecord(rec: Omit<DownloadRecord, "id" | "at">): DownloadRecord {
  const entry: DownloadRecord = {
    ...rec,
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    at: Date.now(),
  }
  // Replace an existing record for the same title+episode (re-download of the
  // same file shouldn't pile up duplicates — the newest entry wins).
  const dedupKey = (r: DownloadRecord) => `${r.imdbId}|${r.type}|${r.season}|${r.episode}|${r.mode}`
  const list = getDownloadHistory().filter((r) => dedupKey(r) !== dedupKey(entry))
  persist([entry, ...list])
  return entry
}

export function removeDownloadRecord(id: string) {
  persist(getDownloadHistory().filter((r) => r.id !== id))
}

export function clearDownloadHistory() {
  persist([])
}
