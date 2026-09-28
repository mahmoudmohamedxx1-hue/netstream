// IndexedDB-based chat history persistence.
// Uses a SEPARATE database from watch history to avoid version conflicts.
// Messages persist across sessions so users can continue conversations.

const DB_NAME = "netstream-chat"
const DB_VERSION = 1
const STORE_NAME = "messages"

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"))
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => {
        console.error("[chat-history] IndexedDB open error:", req.error)
        reject(req.error)
      }
      req.onblocked = () => {
        console.error("[chat-history] IndexedDB open blocked")
        reject(new Error("IndexedDB blocked"))
      }
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
          store.createIndex("timestamp", "timestamp", { unique: false })
        }
      }
    } catch (e) {
      console.error("[chat-history] IndexedDB open threw:", e)
      reject(e)
    }
  })
  return dbPromise
}

export interface StoredChatMessage {
  id?: number
  role: "user" | "assistant"
  content: string
  suggestions?: any[]
  model?: string
  timestamp: number
}

// Load all chat messages (ordered by timestamp ascending)
export async function loadChatHistory(): Promise<StoredChatMessage[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const messages = (req.result as StoredChatMessage[]).sort(
          (a, b) => a.timestamp - b.timestamp
        )
        resolve(messages)
      }
      req.onerror = () => {
        console.error("[chat-history] getAll error:", req.error)
        resolve([]) // resolve empty instead of reject — don't block UI
      }
    })
  } catch (e) {
    console.error("[chat-history] loadChatHistory failed:", e)
    return []
  }
}

// Add a single message to the chat history
export async function addChatMessage(msg: Omit<StoredChatMessage, "id" | "timestamp">): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      store.add({ ...msg, timestamp: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        console.error("[chat-history] add error:", tx.error)
        resolve() // resolve instead of reject — don't block UI
      }
    })
  } catch (e) {
    console.error("[chat-history] addChatMessage failed:", e)
  }
}

// Clear all chat history
export async function clearChatHistory(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        console.error("[chat-history] clear error:", tx.error)
        resolve()
      }
    })
  } catch (e) {
    console.error("[chat-history] clearChatHistory failed:", e)
  }
}
