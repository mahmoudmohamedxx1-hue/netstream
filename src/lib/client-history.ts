// ═══════════════════════════════════════════════════════════════════════════
// client-history.ts — Browser IndexedDB client for Continue Watching.
//
// Uses IndexedDB directly (no Prisma, SQLite, API routes, or localStorage).
// Database: netstream-client
// Object store: watch-history (keyPath: imdbId)
//
// All functions are SSR-safe (guard against typeof window === "undefined").
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = "netstream-client"
const DB_VERSION = 1
const STORE_NAME = "watch-history"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

export type WatchHistoryItem = {
  imdbId: string
  title: string
  type: "movie" | "series"
  poster?: string | null
  backdrop?: string | null
  year?: string | null
  overview?: string | null
  rating?: string | null
  season?: number | null
  episode?: number | null
  position?: number | null   // seconds (actual playback position)
  duration?: number | null   // seconds (total duration)
  progress?: number | null   // 0-100 (calculated from position / duration)
  sourceId?: string | null   // streaming provider
  updatedAt?: string
  createdAt?: string
}

let dbPromise: Promise<IDBDatabase> | null = null

// ── Open / get the database (singleton) ─────────────────────────────────────
function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available during SSR"))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "imdbId" })
        store.createIndex("updatedAt", "updatedAt", { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"))
  })

  return dbPromise
}

// ── Run a transaction and return a promise ──────────────────────────────────
function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return getDB().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      const request = fn(store)
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  })
}

// ── Normalize poster URL ────────────────────────────────────────────────────
// If the poster is a relative TMDB path (e.g. "/abc.jpg"), prepend the TMDB image URL.
// If it's already a full URL, return as-is. If null/empty, return null.
function normalizePoster(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || url.trim() === "") return null
  if (url.startsWith("http")) return url
  if (url.startsWith("/")) return `${TMDB_IMG}${url}`
  return url
}

// ── Calculate progress from position and duration ───────────────────────────
function calcProgress(position: number | null | undefined, duration: number | null | undefined): number {
  if (!duration || duration <= 0 || !position || position <= 0) return 0
  const pos = Math.min(position, duration) // clamp position to duration
  return Math.min(100, Math.max(0, Math.round((pos / duration) * 100)))
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all watch history items, sorted by updatedAt descending.
 * Returns at most 20 items. Also repairs stale records (missing poster, bad progress).
 */
export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  if (typeof window === "undefined") return []
  try {
    const items = await tx<WatchHistoryItem[]>("readonly", (store) => store.getAll())
    if (!items) return []

    // Repair stale records
    let needsRewrite = false
    for (const item of items) {
      let repaired = false

      // Fix poster: normalize if it's a relative path
      const normalizedPoster = normalizePoster(item.poster)
      if (normalizedPoster !== item.poster) {
        item.poster = normalizedPoster
        repaired = true
      }

      // Fix progress: recalculate from position/duration if they exist
      if (item.position != null && item.duration != null && item.duration > 0) {
        const correctProgress = calcProgress(item.position, item.duration)
        if (item.progress !== correctProgress) {
          item.progress = correctProgress
          repaired = true
        }
      }

      // Clamp position to duration
      if (item.position != null && item.duration != null && item.position > item.duration) {
        item.position = item.duration
        item.progress = 100
        repaired = true
      }

      if (repaired) {
        needsRewrite = true
        try {
          await tx<void>("readwrite", (store) => store.put(item))
        } catch {}
      }
    }

    if (needsRewrite) {
      // Re-fetch after repairs
      const repaired = await tx<WatchHistoryItem[]>("readonly", (store) => store.getAll())
      if (repaired) items.splice(0, items.length, ...repaired)
    }

    // Sort by updatedAt descending
    items.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return tb - ta
    })
    return items.slice(0, 20)
  } catch (e) {
    console.error("[client-history] getWatchHistory error:", e)
    throw e
  }
}

/**
 * Get a single watch history item by imdbId.
 */
export async function getWatchItem(imdbId: string): Promise<WatchHistoryItem | undefined> {
  if (typeof window === "undefined") return undefined
  try {
    const result = await tx<WatchHistoryItem | undefined>("readonly", (store) => store.get(imdbId))
    return result ?? undefined
  } catch (e) {
    console.error("[client-history] getWatchItem error:", e)
    throw e
  }
}

/**
 * Save (upsert) a watch history item with proper merge.
 *
 * Merges with existing data so partial updates (e.g. progress-only) don't
 * lose fields like poster, title, type, etc.
 *
 * Deduplicates writes: if the same imdbId is saved within 300ms,
 * only the last write is committed.
 */
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingWrites = new Map<string, Partial<WatchHistoryItem>>()

export async function saveWatchProgress(item: Partial<WatchHistoryItem>): Promise<void> {
  if (typeof window === "undefined") return
  if (!item.imdbId) return

  // Don't save if title is just the imdbId
  if (item.title && item.title === item.imdbId) return

  // Normalize poster before saving
  if (item.poster !== undefined) {
    item.poster = normalizePoster(item.poster)
  }
  if (item.backdrop !== undefined) {
    item.backdrop = normalizePoster(item.backdrop)
  }

  // Calculate progress from position/duration if both are available
  if (item.position != null && item.duration != null && item.duration > 0) {
    item.progress = calcProgress(item.position, item.duration)
  }

  // Clamp position to duration
  if (item.position != null && item.duration != null && item.position > item.duration) {
    item.position = item.duration
    item.progress = 100
  }

  // Deduplicate: merge with any pending write for this imdbId
  const existing = pendingWrites.get(item.imdbId)
  const merged = existing ? { ...existing, ...item } : item
  pendingWrites.set(item.imdbId, merged)

  const existingTimer = writeTimers.get(item.imdbId)
  if (existingTimer) clearTimeout(existingTimer)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const pendingData = pendingWrites.get(item.imdbId!)
      pendingWrites.delete(item.imdbId!)
      writeTimers.delete(item.imdbId!)
      if (!pendingData) return resolve()

      try {
        // Fetch existing record from IndexedDB for proper merge
        const existingRecord = await getWatchItem(pendingData.imdbId!)

        // Merge: don't overwrite valid fields with null/undefined
        const mergedRecord: WatchHistoryItem = {
          imdbId: pendingData.imdbId!,
          title: pendingData.title ?? existingRecord?.title ?? pendingData.imdbId!,
          type: pendingData.type ?? existingRecord?.type ?? "movie",
          poster: pendingData.poster ?? existingRecord?.poster ?? null,
          backdrop: pendingData.backdrop ?? existingRecord?.backdrop ?? null,
          year: pendingData.year ?? existingRecord?.year ?? null,
          overview: pendingData.overview ?? existingRecord?.overview ?? null,
          rating: pendingData.rating ?? existingRecord?.rating ?? null,
          season: pendingData.season ?? existingRecord?.season ?? null,
          episode: pendingData.episode ?? existingRecord?.episode ?? null,
          position: pendingData.position ?? existingRecord?.position ?? null,
          duration: pendingData.duration ?? existingRecord?.duration ?? null,
          progress: pendingData.progress ?? existingRecord?.progress ?? null,
          sourceId: pendingData.sourceId ?? existingRecord?.sourceId ?? null,
          createdAt: existingRecord?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // Don't overwrite a valid duration with zero/null
        if (mergedRecord.duration != null && mergedRecord.duration <= 0 && existingRecord?.duration && existingRecord.duration > 0) {
          mergedRecord.duration = existingRecord.duration
        }

        // Recalculate progress from final position/duration
        if (mergedRecord.position != null && mergedRecord.duration != null && mergedRecord.duration > 0) {
          mergedRecord.progress = calcProgress(mergedRecord.position, mergedRecord.duration)
        }

        // Check if progress >= 95% — if so, remove the item instead of saving
        if (mergedRecord.progress != null && mergedRecord.progress >= 95) {
          await removeWatchItem(mergedRecord.imdbId)
          return resolve()
        }

        await tx<void>("readwrite", (store) => store.put(mergedRecord))
        resolve()
      } catch (e) {
        console.error("[client-history] saveWatchProgress error:", e)
        reject(e)
      }
    }, 300) // 300ms dedup window
    writeTimers.set(item.imdbId!, timer)
  })
}

/**
 * Remove a watch history item by imdbId.
 */
export async function removeWatchItem(imdbId: string): Promise<void> {
  if (typeof window === "undefined") return
  try {
    await tx("readwrite", (store) => store.delete(imdbId))
  } catch (e) {
    console.error("[client-history] removeWatchItem error:", e)
    throw e
  }
}

/**
 * Clear all watch history items.
 */
export async function clearWatchHistory(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    await tx("readwrite", (store) => store.clear())
  } catch (e) {
    console.error("[client-history] clearWatchHistory error:", e)
    throw e
  }
}

/**
 * Check if IndexedDB is available in the current environment.
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof window === "undefined") return false
  return "indexedDB" in window
}
