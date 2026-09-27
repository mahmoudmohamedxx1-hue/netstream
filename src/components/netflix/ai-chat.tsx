"use client"

import * as React from "react"
import { Sparkles, X, Send, Film, Tv, Loader2, Bot, User, ChevronDown, Check, Zap, Globe, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

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
  { id: "pollinations", name: "GPT-OSS 20B", desc: "Keyless · Fast", icon: Zap, color: "text-amber-400" },
  { id: "llm7", name: "Codestral", desc: "Keyless · Balanced", icon: Globe, color: "text-sky-400" },
  { id: "glm", name: "GLM 5.3 Flash", desc: "High Quality", icon: Brain, color: "text-violet-400" },
] as const

const SUGGESTION_CHIPS = [
  "Suggest an action movie",
  "Best Arabic series",
  "Something for a cozy night",
  "Sci-fi movies like Interstellar",
  "Top-rated Turkish dramas",
  "Family-friendly animation",
]

const MODEL_KEY = "netstream:ai-model"

export function AIChat({ onPlayTitle }: { onPlayTitle: (t: TitleSuggestion) => void }) {
  const [open, setOpen] = React.useState(false)
  const [model, setModel] = React.useState<string>("pollinations")
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm NetStream AI 🎬 — your personal movie & series assistant. Ask me for recommendations and I'll find something great for you to watch!",
    },
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load saved model preference
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY)
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved)
    } catch {}
  }, [])

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input when chat opens
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = { role: "user", content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again in a moment.",
        },
      ])
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

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0]

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[100] flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-600 text-white shadow-2xl shadow-primary/30 transition-all hover:scale-110 hover:shadow-primary/50 active:scale-95"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="size-6" />
          <span className="absolute -top-1 -right-1 flex size-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-4 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* ── Chat dialog (Claude-style) ── */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-end p-4 sm:p-6">
          {/* Backdrop (mobile only) */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Chat window */}
          <div className="relative flex h-[85vh] w-full max-w-[440px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1a1a1a] shadow-2xl">
            {/* ── Header (Claude-style: clean, minimal) ── */}
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-600 shadow-lg">
                  <Sparkles className="size-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">NetStream AI</h2>
                  <p className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Online · Movie & Series Assistant
                  </p>
                </div>
              </div>

              {/* Model switcher + close */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setModelMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10"
                  >
                    <currentModel.icon className={cn("size-3.5", currentModel.color)} />
                    <span className="hidden sm:inline">{currentModel.name}</span>
                    <ChevronDown className="size-3 text-white/40" />
                  </button>
                  {modelMenuOpen && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#222] py-1 shadow-2xl">
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
                  aria-label="Close chat"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* ── Messages (Claude-style: spacious, rounded bubbles) ── */}
            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                  {/* Avatar */}
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    msg.role === "assistant"
                      ? "bg-gradient-to-br from-primary to-red-600"
                      : "bg-white/10"
                  )}>
                    {msg.role === "assistant" ? (
                      <Sparkles className="size-4 text-white" />
                    ) : (
                      <User className="size-4 text-white/60" />
                    )}
                  </div>

                  {/* Message content */}
                  <div className={cn("flex max-w-[80%] flex-col gap-3", msg.role === "user" && "items-end")}>
                    {/* Text bubble */}
                    <div className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "assistant"
                        ? "rounded-tl-md bg-white/[0.06] text-white/90"
                        : "rounded-tr-md bg-primary text-primary-foreground"
                    )}>
                      {/* Render text with line breaks */}
                      {msg.content.split("\n").map((line, j) => (
                        <p key={j} className={line.trim() === "" ? "h-2" : ""}>{line}</p>
                      ))}
                    </div>

                    {/* Title suggestion cards (Claude-style: rich, card-based) */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                          🎬 Tap to watch
                        </p>
                        {msg.suggestions.map((s, j) => (
                          <button
                            key={j}
                            onClick={() => onPlayTitle(s)}
                            className="group flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left transition hover:border-primary/30 hover:bg-white/[0.06]"
                          >
                            {/* Poster */}
                            <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
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
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
                                <span className="flex items-center gap-0.5">
                                  {s.type === "series" ? "📺" : "🎬"} {s.type}
                                </span>
                                {s.year && <span>• {s.year}</span>}
                                {s.rating && (
                                  <span className="text-amber-400/70">• ⭐ {Number(s.rating).toFixed(1)}</span>
                                )}
                              </div>
                              {s.overview && (
                                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/30">
                                  {s.overview}
                                </p>
                              )}
                            </div>

                            {/* Play icon */}
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                              <Send className="size-3 -rotate-45" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Model badge (subtle, Claude-style) */}
                    {msg.role === "assistant" && msg.model && msg.model !== "none" && (
                      <p className="text-[9px] text-white/20">
                        via {MODELS.find((m) => m.id === msg.model)?.name ?? msg.model}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading (Claude-style: typing indicator) */}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-600">
                    <Sparkles className="size-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white/[0.06] px-4 py-4">
                    <span className="size-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.3s]" />
                    <span className="size-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.15s]" />
                    <span className="size-2 animate-bounce rounded-full bg-white/40" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Suggestion chips (show only on first message) ── */}
            {messages.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-5 py-3">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/60 transition hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* ── Input (Claude-style: rounded, spacious) ── */}
            <form onSubmit={handleSubmit} className="border-t border-white/5 p-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 transition focus-within:border-primary/40">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask for a recommendation…"
                  disabled={loading}
                  maxLength={1000}
                  className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-20"
                  aria-label="Send message"
                >
                  <Send className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[9px] text-white/20">
                NetStream AI can make mistakes. Check movie availability.
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
