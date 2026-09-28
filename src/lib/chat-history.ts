// IndexedDB-based chat history persistence with multiple conversation support.
// Uses a SEPARATE database from watch history to avoid version conflicts.
// Supports multiple conversations — users can start new chats, browse history.

const DB_NAME = "netstream-chat"
const DB_VERSION = 1
const CONVERSATIONS_STORE = "conversations"
const MESSAGES_STORE = "messages"

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
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error("IndexedDB blocked"))
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        // Conversations store — one entry per conversation
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          const cStore = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" })
          cStore.createIndex("updatedAt", "updatedAt", { unique: false })
        }
        // Messages store — all messages across all conversations
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const mStore = db.createObjectStore(MESSAGES_STORE, { keyPath: "id", autoIncrement: true })
          mStore.createIndex("conversationId", "conversationId", { unique: false })
          mStore.createIndex("timestamp", "timestamp", { unique: false })
        }
      }
    } catch (e) {
      reject(e)
    }
  })
  return dbPromise
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface StoredChatMessage {
  id?: number
  conversationId: string
  role: "user" | "assistant"
  content: string
  suggestions?: any[]
  model?: string
  timestamp: number
}

// Generate a unique conversation ID
function generateId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// ── Conversation operations ───────────────────────────────────────────────

// Create a new conversation
export async function createConversation(title: string = "New Chat"): Promise<Conversation> {
  const conv: Conversation = {
    id: generateId(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONVERSATIONS_STORE, "readwrite")
      tx.objectStore(CONVERSATIONS_STORE).add(conv)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error("[chat-history] createConversation failed:", e)
  }
  return conv
}

// List all conversations (newest first)
export async function listConversations(): Promise<Conversation[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONVERSATIONS_STORE, "readonly")
      const req = tx.objectStore(CONVERSATIONS_STORE).getAll()
      req.onsuccess = () => {
        const convs = (req.result as Conversation[]).sort((a, b) => b.updatedAt - a.updatedAt)
        resolve(convs)
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

// Update conversation title and timestamp
export async function updateConversation(id: string, title?: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(CONVERSATIONS_STORE, "readwrite")
    const store = tx.objectStore(CONVERSATIONS_STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const conv = getReq.result as Conversation | undefined
      if (conv) {
        if (title) conv.title = title
        conv.updatedAt = Date.now()
        store.put(conv)
      }
    }
  } catch (e) {
    console.error("[chat-history] updateConversation failed:", e)
  }
}

// Delete a conversation and all its messages
export async function deleteConversation(id: string): Promise<void> {
  try {
    const db = await openDB()
    // Delete conversation
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CONVERSATIONS_STORE, "readwrite")
      tx.objectStore(CONVERSATIONS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    // Delete all messages in this conversation
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MESSAGES_STORE, "readwrite")
      const store = tx.objectStore(MESSAGES_STORE)
      const idx = store.index("conversationId")
      const req = idx.openCursor(IDBKeyRange.only(id))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) { cursor.delete(); cursor.continue() }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch (e) {
    console.error("[chat-history] deleteConversation failed:", e)
  }
}

// ── Message operations ────────────────────────────────────────────────────

// Load all messages for a conversation (ordered by timestamp)
export async function loadMessages(conversationId: string): Promise<StoredChatMessage[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGES_STORE, "readonly")
      const idx = tx.objectStore(MESSAGES_STORE).index("conversationId")
      const req = idx.getAll(IDBKeyRange.only(conversationId))
      req.onsuccess = () => {
        const msgs = (req.result as StoredChatMessage[]).sort((a, b) => a.timestamp - b.timestamp)
        resolve(msgs)
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

// Add a message to a conversation
export async function addChatMessage(
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; suggestions?: any[]; model?: string }
): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MESSAGES_STORE, "readwrite")
      tx.objectStore(MESSAGES_STORE).add({
        ...msg,
        conversationId,
        timestamp: Date.now(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    // Update conversation timestamp
    await updateConversation(conversationId)
  } catch (e) {
    console.error("[chat-history] addChatMessage failed:", e)
  }
}

// Clear ALL history (all conversations + messages)
export async function clearAllHistory(): Promise<void> {
  try {
    const db = await openDB()
    await Promise.all([
      new Promise<void>((resolve) => {
        const tx = db.transaction(CONVERSATIONS_STORE, "readwrite")
        tx.objectStore(CONVERSATIONS_STORE).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      }),
      new Promise<void>((resolve) => {
        const tx = db.transaction(MESSAGES_STORE, "readwrite")
        tx.objectStore(MESSAGES_STORE).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      }),
    ])
  } catch (e) {
    console.error("[chat-history] clearAllHistory failed:", e)
  }
}
