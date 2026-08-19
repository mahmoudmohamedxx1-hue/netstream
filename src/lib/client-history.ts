// ═══════════════════════════════════════════════════════════════════════════
// client-history.ts — Browser IndexedDB client for Continue Watching.
//
// NO API routes. NO localStorage. NO sessionStorage. NO Prisma/SQLite.
// IndexedDB is the single source of truth for watch history.
//
// Database: netstream-client  |  Store: watch-history  |  keyPath: imdbId
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = "netstream-client"
const DB_VERSION = 1
const STORE = "watch-history"
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
  position?: number | null   // seconds
  duration?: number | null   // seconds
  progress?: number | null   // 0–100 (derived from position/duration)
  sourceId?: string | null
  updatedAt?: string
  createdAt?: string
}

// ── helpers ────────────────────────────────────────────────────────────────

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || url.trim() === "") return null
  if (url.startsWith("http")) return url
  if (url.startsWith("/")) return `${TMDB_IMG}${url}`
  return url
}

function calcProgress(position: number | null | undefined, duration: number | null | undefined): number {
  const d = Math.max(0, Number(duration) || 0)
  const p = Math.min(d, Math.max(0, Number(position) || 0))
  return d > 0 ? Math.min(100, Math.max(0, (p / d) * 100)) : 0
}

// ── DB singleton ───────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "imdbId" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return getDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const s = t.objectStore(STORE)
    const r = fn(s)
    r.onsuccess = () => resolve(r.result as T)
    r.onerror = () => reject(r.error)
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

export function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window
}

/** Get all items sorted by updatedAt desc, max 20. Repairs stale records. */
export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  if (typeof window === "undefined") return []
  try {
    const items = (await tx<WatchHistoryItem[]>("readonly", s => s.getAll())) ?? []
    let dirty = false
    for (const item of items) {
      const np = normalizeUrl(item.poster)
      if (np !== item.poster) { item.poster = np; dirty = true }
      if (item.position != null && item.duration != null && item.duration > 0) {
        const cp = calcProgress(item.position, item.duration)
        if (Math.round(cp) !== Math.round(item.progress ?? -1)) { item.progress = cp; dirty = true }
        if (item.position > item.duration) { item.position = item.duration; item.progress = 100; dirty = true }
      }
      if (dirty) await tx<void>("readwrite", s => s.put(item)).catch(() => {})
    }
    items.sort((a, b) => (new Date(b.updatedAt ?? 0).getTime()) - (new Date(a.updatedAt ?? 0).getTime()))
    return items.slice(0, 20)
  } catch (e) {
    console.error("[client-history] getWatchHistory:", e)
    throw e
  }
}

/** Get a single item by imdbId. */
export async function getWatchItem(imdbId: string): Promise<WatchHistoryItem | undefined> {
  if (typeof window === "undefined") return undefined
  try {
    return (await tx<WatchHistoryItem | undefined>("readonly", s => s.get(imdbId))) ?? undefined
  } catch { return undefined }
}

/**
 * Upsert a watch history item with proper merge.
 * - Fetches existing record
 * - Merges: new fields override, but never overwrite valid poster/title/type with null
 * - Recalculates progress from position/duration
 * - Deduplicates writes (300ms window)
 */
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingWrites = new Map<string, Partial<WatchHistoryItem>>()

export async function upsertWatchItem(item: Partial<WatchHistoryItem>): Promise<void> {
  if (typeof window === "undefined") return
  if (!item.imdbId) return
  if (item.title && item.title === item.imdbId) return // don't save imdbId as title

  // Normalize URLs
  if (item.poster !== undefined) item.poster = normalizeUrl(item.poster)
  if (item.backdrop !== undefined) item.backdrop = normalizeUrl(item.backdrop)

  // Merge with pending
  const existing = pendingWrites.get(item.imdbId)
  pendingWrites.set(item.imdbId, { ...existing, ...item })

  const oldTimer = writeTimers.get(item.imdbId)
  if (oldTimer) clearTimeout(oldTimer)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const pending = pendingWrites.get(item.imdbId!)
      pendingWrites.delete(item.imdbId!)
      writeTimers.delete(item.imdbId!)
      if (!pending) return resolve()

      try {
        const prev = await getWatchItem(pending.imdbId!)

        // Merge: never overwrite valid fields with null/undefined
        const merged: WatchHistoryItem = {
          imdbId: pending.imdbId!,
          title: pending.title ?? prev?.title ?? pending.imdbId!,
          type: pending.type ?? prev?.type ?? "movie",
          poster: pending.poster ?? prev?.poster ?? null,
          backdrop: pending.backdrop ?? prev?.backdrop ?? null,
          year: pending.year ?? prev?.year ?? null,
          overview: pending.overview ?? prev?.overview ?? null,
          rating: pending.rating ?? prev?.rating ?? null,
          season: pending.season ?? prev?.season ?? null,
          episode: pending.episode ?? prev?.episode ?? null,
          position: pending.position ?? prev?.position ?? null,
          duration: pending.duration ?? prev?.duration ?? null,
          progress: pending.progress ?? prev?.progress ?? null,
          sourceId: pending.sourceId ?? prev?.sourceId ?? null,
          createdAt: prev?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // Don't overwrite valid duration with 0
        if (merged.duration != null && merged.duration <= 0 && prev?.duration && prev.duration > 0) {
          merged.duration = prev.duration
        }

        // Recalculate progress
        if (merged.position != null && merged.duration != null && merged.duration > 0) {
          merged.progress = calcProgress(merged.position, merged.duration)
        }

        // Auto-remove at 95%
        if (merged.progress != null && merged.progress >= 95) {
          await deleteWatchItem(merged.imdbId)
          return resolve()
        }

        await tx<void>("readwrite", s => s.put(merged))
        resolve()
      } catch (e) {
        console.error("[client-history] upsertWatchItem:", e)
        reject(e)
      }
    }, 300)
    writeTimers.set(item.imdbId!, timer)
  })
}

/** Delete a single item. */
export async function deleteWatchItem(imdbId: string): Promise<void> {
  if (typeof window === "undefined") return
  await tx<void>("readwrite", s => s.delete(imdbId))
}

/** Clear all items. */
export async function clearWatchHistory(): Promise<void> {
  if (typeof window === "undefined") return
  await tx<void>("readwrite", s => s.clear())
}
