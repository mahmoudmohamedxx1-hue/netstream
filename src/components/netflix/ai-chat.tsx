"use client"

import * as React from "react"
import { Sparkles, X, Send, Film, Tv, Bot, User, ChevronDown, Check, Zap, Globe, Brain, Trash2, Plus, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { loadChatHistory, addChatMessage, clearChatHistory, type StoredChatMessage } from "@/lib/chat-history"

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

// ── Model definitions ─────────────────────────────────────────────────────
const MODELS = [
  { id: "pollinations", name: "GPT-OSS 20B", desc: "Keyless · Default", icon: Zap, color: "text-amber-400" },
  { id: "glm", name: "GLM 5.3 Flash", desc: "High Quality · Sandbox only", icon: Brain, color: "text-violet-400" },
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

export function AIChat({ onPlayTitle }: { onPlayTitle: (t: TitleSuggestion) => void }) {
  const [open, setOpen] = React.useState(false)
  const [model, setModel] = React.useState<string>("pollinations")
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load saved model preference and chat history from IndexedDB on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY)
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved)
    } catch {}

    // Load chat history from IndexedDB
    loadChatHistory().then((stored) => {
      if (stored.length > 0) {
        setMessages(stored.map((s) => ({
          role: s.role,
          content: s.content,
          suggestions: s.suggestions,
          model: s.model,
        })))
      } else {
        setMessages([{
          role: "assistant",
          content: "Hi! I'm NetStream AI 🎬 — your personal movie & series assistant. Ask me for recommendations!",
        }])
      }
      setHistoryLoaded(true)
    }).catch(() => {
      setMessages([{
        role: "assistant",
        content: "Hi! I'm NetStream AI 🎬 — your personal movie & series assistant. Ask me for recommendations!",
      }])
      setHistoryLoaded(true)
    })
  }, [])

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input when chat opens
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  // Close model menu when clicking outside
  React.useEffect(() => {
    if (!modelMenuOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-model-menu]")) setModelMenuOpen(false)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [modelMenuOpen])

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || !historyLoaded) return

    const userMsg: ChatMessage = { role: "user", content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    addChatMessage({ role: "user", content: trimmed })

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
      addChatMessage({
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
      addChatMessage({ role: "assistant", content: errMsg.content })
    } finally {
      setLoading(false)
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

  const handleClearHistory = async () => {
    if (!confirm("Clear all chat history? This cannot be undone.")) return
    await clearChatHistory()
    setMessages([{
      role: "assistant",
      content: "Chat history cleared. What would you like to watch?",
    }])
  }

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0]

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[100] flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-2xl shadow-violet-600/30 transition-all hover:scale-110 hover:shadow-violet-600/50 active:scale-95"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="size-6" />
          <span className="absolute -top-1 -right-1 flex size-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-4 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* ── Sidebar ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Sidebar — responsive: full width on mobile, ~1/3 on desktop (min 380px, max 480px) */}
          <aside
            className="fixed right-0 top-0 z-[101] flex h-full w-full flex-col border-l border-white/10 bg-[#131316] shadow-2xl sm:w-[33.333vw] sm:min-w-[380px] sm:max-w-[480px]"
          >
            {/* ── Header ── */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 shadow-lg sm:size-9">
                  <Sparkles className="size-4 text-white sm:size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">NetStream AI</h2>
                  <p className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Online
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Clear history */}
                <button
                  onClick={handleClearHistory}
                  className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                  title="Clear chat history"
                  aria-label="Clear chat history"
                >
                  <Trash2 className="size-3.5" />
                </button>

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

                {/* Close */}
                <button
                  onClick={() => setOpen(false)}
                  className="flex size-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close sidebar"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* ── Messages (scrollable area) ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-6">
              {!historyLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                      {/* Avatar */}
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

                      {/* Message content */}
                      <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5", msg.role === "user" && "items-end")}>
                        {/* Text bubble */}
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

                        {/* Title suggestion cards */}
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
                                {/* Poster */}
                                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:size-14">
                                  {s.poster ? (
                                    <img
                                      src={s.poster}
                                      alt={s.title}
                                      className="h-full w-full object-cover transition group-hover:scale-105"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      {s.type === "series" ? (
                                        <Tv className="size-5 text-white/20" />
                                      ) : (
                                        <Film className="size-5 text-white/20" />
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-white">{s.title}</p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40">
                                    <span className="flex items-center gap-0.5">
                                      {s.type === "series" ? "📺" : "🎬"} {s.type}
                                    </span>
                                    {s.year && <span>• {s.year}</span>}
                                    {s.rating && (
                                      <span className="text-amber-400/70">• ⭐ {Number(s.rating).toFixed(1)}</span>
                                    )}
                                  </div>
                                  {s.overview && (
                                    <p className="mt-1 line-clamp-1 text-[10px] leading-snug text-white/30 sm:line-clamp-2">
                                      {s.overview}
                                    </p>
                                  )}
                                </div>

                                {/* Play icon */}
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400 transition group-hover:bg-violet-600 group-hover:text-white sm:size-8">
                                  <Send className="size-3 -rotate-45" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Model badge */}
                        {msg.role === "assistant" && msg.model && msg.model !== "none" && (
                          <p className="text-[9px] text-white/20">
                            via {MODELS.find((m) => m.id === msg.model)?.name ?? msg.model}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Loading (typing indicator) */}
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

            {/* ── Suggestion chips (show only on first message) ── */}
            {historyLoaded && messages.length <= 1 && !loading && (
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

            {/* ── Input ── */}
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
          </aside>
        </>
      )}
    </>
  )
}
