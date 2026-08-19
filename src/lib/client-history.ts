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
  position?: number | null   // seconds
  duration?: number | null   // seconds
  progress?: number | null   // 0-100
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

// ── Promisify a single IDBRequest ───────────────────────────────────────────
function promisifyReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all watch history items, sorted by updatedAt descending.
 * Returns at most 20 items.
 */
export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  if (typeof window === "undefined") return []
  try {
    const items = await tx<WatchHistoryItem[]>("readonly", (store) => store.getAll())
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
 * Save (upsert) a watch history item.
 * If the item already exists (by imdbId), it is updated.
 * Merges with existing data so partial updates don't lose fields.
 *
 * Deduplicates writes: if the same imdbId is saved within 500ms,
 * only the last write is committed.
 */
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingWrites = new Map<string, WatchHistoryItem>()

export async function saveWatchProgress(item: WatchHistoryItem): Promise<void> {
  if (typeof window === "undefined") return

  // Don't save if title is just the imdbId
  if (!item.title || item.title === item.imdbId) return

  // Ensure timestamps
  const now = new Date().toISOString()
  if (!item.createdAt) item.createdAt = now
  item.updatedAt = now

  // Deduplicate: if there's a pending write for this imdbId, cancel it
  // and replace with the latest data
  const existing = pendingWrites.get(item.imdbId)
  const merged = existing ? { ...existing, ...item } : item
  pendingWrites.set(item.imdbId, merged)

  const existingTimer = writeTimers.get(item.imdbId)
  if (existingTimer) clearTimeout(existingTimer)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const data = pendingWrites.get(item.imdbId)
      pendingWrites.delete(item.imdbId)
      writeTimers.delete(item.imdbId)
      if (!data) return resolve()

      try {
        // Check if progress >= 95% — if so, remove the item instead of saving
        if (data.progress != null && data.progress >= 95) {
          await removeWatchItem(data.imdbId)
          return resolve()
        }

        await tx<void>("readwrite", (store) => store.put(data))
        resolve()
      } catch (e) {
        console.error("[client-history] saveWatchProgress error:", e)
        reject(e)
      }
    }, 300) // 300ms dedup window
    writeTimers.set(item.imdbId, timer)
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
