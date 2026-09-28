"use client"

import * as React from "react"
import { Sparkles, X, Send, Film, Tv, User, ChevronDown, Check, Zap, Globe, Brain, Trash2, Plus, MessageSquare, Clock, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { AIOrbAvatar } from "./ai-orb-avatar"
import {
  createConversation, listConversations, loadMessages, addChatMessage,
  deleteConversation, clearAllHistory,
  type Conversation, type StoredChatMessage,
} from "@/lib/chat-history"

interface TitleSuggestion {
  title: string
  year?: string
  type: "movie" | "series"
  tmdbId?: number
  imdbId?: string
  poster?: string | null
  overview?: string
  rating?: string | null
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  suggestions?: TitleSuggestion[]
  model?: string
}

const MODELS = [
  { id: "glm", name: "GLM 5.3 Flash", desc: "High Quality · Default", icon: Brain, color: "text-violet-400" },
  { id: "pollinations", name: "GPT-OSS 20B", desc: "Keyless · Fast", icon: Zap, color: "text-amber-400" },
  { id: "llm7", name: "Codestral", desc: "Keyless · Balanced", icon: Globe, color: "text-sky-400" },
] as const

const SUGGESTION_CHIPS = [
  "Suggest an action movie",
  "Best Arabic series",
  "Oscar-winning movies",
  "Something for a cozy night",
  "Top-rated Turkish dramas",
  "Family-friendly animation",
]

const MODEL_KEY = "netstream:ai-model"
const ACTIVE_CONV_KEY = "netstream:ai-active-conv"

export function AIChat({ onPlayTitle }: { onPlayTitle: (t: TitleSuggestion) => void }) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<"chat" | "history">("chat")
  const [model, setModel] = React.useState<string>("glm") // GLM 5.3 Flash is default
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load model preference and conversations on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY)
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved)
    } catch {}

    // Load conversations list
    listConversations().then((convs) => {
      setConversations(convs)
      // Try to restore the last active conversation
      try {
        const lastActive = localStorage.getItem(ACTIVE_CONV_KEY)
        if (lastActive && convs.find((c) => c.id === lastActive)) {
          loadConversation(lastActive)
          return
        }
      } catch {}
      // No active conversation — start fresh
      setMessages([{
        role: "assistant",
        content: "Hi! I'm NetStream AI 🎬 — your personal movie & series assistant. Ask me for recommendations!",
      }])
      setLoaded(true)
    }).catch(() => {
      setMessages([{
        role: "assistant",
        content: "Hi! I'm NetStream AI 🎬 — your personal movie & series assistant. Ask me for recommendations!",
      }])
      setLoaded(true)
    })
  }, [])

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input when chat opens
  React.useEffect(() => {
    if (open && view === "chat") setTimeout(() => inputRef.current?.focus(), 300)
  }, [open, view])

  // Close model menu on outside click
  React.useEffect(() => {
    if (!modelMenuOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-model-menu]")) setModelMenuOpen(false)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [modelMenuOpen])

  // Load a conversation's messages
  const loadConversation = async (convId: string) => {
    const msgs = await loadMessages(convId)
    if (msgs.length > 0) {
      setMessages(msgs.map((m) => ({
        role: m.role,
        content: m.content,
        suggestions: m.suggestions,
        model: m.model,
      })))
    } else {
      setMessages([{
        role: "assistant",
        content: "Hi! I'm NetStream AI 🎬 — Ask me for recommendations!",
      }])
    }
    setActiveConvId(convId)
    try { localStorage.setItem(ACTIVE_CONV_KEY, convId) } catch {}
    setLoaded(true)
    setView("chat")
  }

  // Start a new chat
  const handleNewChat = async () => {
    const conv = await createConversation("New Chat")
    setConversations((prev) => [conv, ...prev])
    setActiveConvId(conv.id)
    try { localStorage.setItem(ACTIVE_CONV_KEY, conv.id) } catch {}
    setMessages([{
      role: "assistant",
      content: "Hi! I'm NetStream AI 🎬 — Ask me for recommendations!",
    }])
    setView("chat")
    setTimeout(() => inputRef.current?.focus(), 300)
  }

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || !loaded) return

    // Create a conversation if none is active
    let convId = activeConvId
    if (!convId) {
      const conv = await createConversation(trimmed.substring(0, 40))
      convId = conv.id
      setConversations((prev) => [conv, ...prev])
      setActiveConvId(conv.id)
      try { localStorage.setItem(ACTIVE_CONV_KEY, conv.id) } catch {}
    }

    const userMsg: ChatMessage = { role: "user", content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    addChatMessage(convId, { role: "user", content: trimmed })

    // Update conversation title if it's the first message
    const conv = conversations.find((c) => c.id === convId)
    if (conv && conv.title === "New Chat") {
      const newTitle = trimmed.substring(0, 40) + (trimmed.length > 40 ? "…" : "")
      await updateConversationTitle(convId, newTitle)
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: newTitle } : c))
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          model,
          history: newMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.reply || "Sorry, I couldn't process that. Try again!",
        suggestions: data.suggestions || [],
        model: data.model,
      }
      setMessages((prev) => [...prev, aiMsg])
      addChatMessage(convId!, {
        role: "assistant",
        content: aiMsg.content,
        suggestions: aiMsg.suggestions,
        model: aiMsg.model,
      })
    } catch {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again in a moment.",
      }
      setMessages((prev) => [...prev, errMsg])
      addChatMessage(convId!, { role: "assistant", content: errMsg.content })
    } finally {
      setLoading(false)
      // Refresh conversation list (for updated timestamps)
      listConversations().then(setConversations)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleModelChange = (id: string) => {
    setModel(id)
    setModelMenuOpen(false)
    try { localStorage.setItem(MODEL_KEY, id) } catch {}
  }

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteConversation(id)
    const updated = conversations.filter((c) => c.id !== id)
    setConversations(updated)
    if (activeConvId === id) {
      setActiveConvId(null)
      setMessages([{
        role: "assistant",
        content: "Hi! I'm NetStream AI 🎬 — Ask me for recommendations!",
      }])
      try { localStorage.removeItem(ACTIVE_CONV_KEY) } catch {}
    }
  }

  const handleClearAll = async () => {
    if (!confirm("Delete ALL chat history? This cannot be undone.")) return
    await clearAllHistory()
    setConversations([])
    setActiveConvId(null)
    setMessages([{
      role: "assistant",
      content: "All history cleared. What would you like to watch?",
    }])
    try { localStorage.removeItem(ACTIVE_CONV_KEY) } catch {}
    setView("chat")
  }

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0]

  return (
    <>
      {/* Floating button — animated AI orb avatar */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[100] flex size-14 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          aria-label="Open AI Assistant"
        >
          <AIOrbAvatar size="lg" />
          <span className="absolute -top-1 -right-1 flex size-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-4 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* Sidebar */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />

          <aside className="fixed right-0 top-0 z-[101] flex h-full w-full flex-col border-l border-white/10 bg-[#131316] shadow-2xl sm:w-[33.333vw] sm:min-w-[380px] sm:max-w-[480px]">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                {view === "history" && (
                  <button
                    onClick={() => setView("chat")}
                    className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                    aria-label="Back to chat"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                <AIOrbAvatar size="sm" />
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {view === "history" ? "Chat History" : "NetStream AI"}
                  </h2>
                  <p className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {view === "history" ? `${conversations.length} conversations` : "Online"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* New chat */}
                <button
                  onClick={handleNewChat}
                  className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="size-4" />
                </button>

                {/* History tab */}
                {view === "chat" && (
                  <button
                    onClick={() => setView("history")}
                    className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                    title="Chat history"
                    aria-label="Chat history"
                  >
                    <MessageSquare className="size-4" />
                  </button>
                )}

                {/* Model switcher */}
                <div className="relative" data-model-menu>
                  <button
                    onClick={() => setModelMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10"
                  >
                    <currentModel.icon className={cn("size-3.5", currentModel.color)} />
                    <span className="hidden sm:inline">{currentModel.name}</span>
                    <ChevronDown className="size-3 text-white/40" />
                  </button>
                  {modelMenuOpen && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c20] py-1 shadow-2xl">
                      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
                        Select Model
                      </p>
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleModelChange(m.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5",
                            model === m.id && "bg-white/5"
                          )}
                        >
                          <m.icon className={cn("size-4 shrink-0", m.color)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white">{m.name}</p>
                            <p className="text-[10px] text-white/40">{m.desc}</p>
                          </div>
                          {model === m.id && <Check className="size-3.5 shrink-0 text-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close sidebar"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* ── History View ── */}
            {view === "history" ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4">
                  {conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <MessageSquare className="mb-3 size-10 text-white/10" />
                      <p className="text-sm text-white/40">No conversations yet</p>
                      <p className="mt-1 text-xs text-white/20">Start a new chat to see it here</p>
                      <button
                        onClick={handleNewChat}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                      >
                        <Plus className="size-3.5" /> New Chat
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => loadConversation(conv.id)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                            activeConvId === conv.id
                              ? "border-violet-500/30 bg-violet-600/10"
                              : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                          )}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                            <MessageSquare className="size-4 text-white/40" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-white">{conv.title}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/30">
                              <Clock className="size-2.5" />
                              {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white/20 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {conversations.length > 0 && (
                  <div className="shrink-0 border-t border-white/5 p-3">
                    <button
                      onClick={handleClearAll}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/50 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" /> Clear All History
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* ── Chat View ── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-6">
                  {!loaded ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {messages.map((msg, i) => (
                        <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                          <div className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                            msg.role === "assistant"
                              ? "bg-gradient-to-br from-violet-600 to-indigo-700"
                              : "bg-white/10"
                          )}>
                            {msg.role === "assistant" ? (
                              <Sparkles className="size-3.5 text-white" />
                            ) : (
                              <User className="size-3.5 text-white/60" />
                            )}
                          </div>

                          <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5", msg.role === "user" && "items-end")}>
                            <div className={cn(
                              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:px-4 sm:py-3",
                              msg.role === "assistant"
                                ? "rounded-tl-md bg-white/[0.06] text-white/90"
                                : "rounded-tr-md bg-violet-600 text-white"
                            )}>
                              {msg.content.split("\n").map((line, j) => (
                                <p key={j} className={line.trim() === "" ? "h-2" : ""}>{line}</p>
                              ))}
                            </div>

                            {msg.suggestions && msg.suggestions.length > 0 && (
                              <div className="w-full space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                                  🎬 Tap to watch
                                </p>
                                {msg.suggestions.map((s, j) => (
                                  <button
                                    key={j}
                                    onClick={() => onPlayTitle(s)}
                                    className="group flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition hover:border-violet-500/30 hover:bg-white/[0.06]"
                                  >
                                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:size-14">
                                      {s.poster ? (
                                        <img src={s.poster} alt={s.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          {s.type === "series" ? <Tv className="size-5 text-white/20" /> : <Film className="size-5 text-white/20" />}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold text-white">{s.title}</p>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40">
                                        <span className="flex items-center gap-0.5">{s.type === "series" ? "📺" : "🎬"} {s.type}</span>
                                        {s.year && <span>• {s.year}</span>}
                                        {s.rating && <span className="text-amber-400/70">• ⭐ {Number(s.rating).toFixed(1)}</span>}
                                      </div>
                                      {s.overview && <p className="mt-1 line-clamp-1 text-[10px] leading-snug text-white/30 sm:line-clamp-2">{s.overview}</p>}
                                    </div>
                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400 transition group-hover:bg-violet-600 group-hover:text-white sm:size-8">
                                      <Send className="size-3 -rotate-45" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}

                            {msg.role === "assistant" && msg.model && msg.model !== "none" && (
                              <p className="text-[9px] text-white/20">via {MODELS.find((m) => m.id === msg.model)?.name ?? msg.model}</p>
                            )}
                          </div>
                        </div>
                      ))}

                      {loading && (
                        <div className="flex gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700">
                            <Sparkles className="size-3.5 text-white" />
                          </div>
                          <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white/[0.06] px-4 py-4">
                            <span className="size-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.3s]" />
                            <span className="size-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.15s]" />
                            <span className="size-2 animate-bounce rounded-full bg-white/40" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Suggestion chips */}
                {loaded && messages.length <= 1 && !loading && (
                  <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-white/5 px-4 py-3 sm:px-5">
                    {SUGGESTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => sendMessage(chip)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/60 transition hover:border-violet-500/40 hover:bg-violet-600/10 hover:text-white"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="shrink-0 border-t border-white/5 p-3 sm:p-4">
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 transition focus-within:border-violet-500/40 sm:px-4">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask for a recommendation…"
                      disabled={loading}
                      maxLength={1000}
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-20"
                      aria-label="Send message"
                    >
                      <Send className="size-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[9px] text-white/20">
                    Powered by {currentModel.name} · Chat history saved locally
                  </p>
                </form>
              </>
            )}
          </aside>
        </>
      )}
    </>
  )
}

// Helper to update conversation title (exported from chat-history but we need it here)
async function updateConversationTitle(id: string, title: string): Promise<void> {
  try {
    const { updateConversation } = await import("@/lib/chat-history")
    await updateConversation(id, title)
  } catch {}
}
