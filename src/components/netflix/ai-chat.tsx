"use client"

import * as React from "react"
import { Sparkles, X, Send, Film, Tv, Loader2, Bot, User } from "lucide-react"
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
}

const SUGGESTION_CHIPS = [
  "Suggest an action movie",
  "Best Arabic series",
  "Something for a cozy night",
  "Sci-fi movies like Interstellar",
  "Top-rated Turkish dramas",
  "Family-friendly animation",
]

export function AIChat({ onPlayTitle }: { onPlayTitle: (t: TitleSuggestion) => void }) {
  const [open, setOpen] = React.useState(false)
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

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
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

  return (
    <>
      {/* Floating button */}
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

      {/* Chat dialog */}
      {open && (
        <div className="fixed bottom-6 right-6 z-[100] flex h-[600px] max-h-[85vh] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-primary/20 to-transparent px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-600">
                <Bot className="size-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">NetStream AI</p>
                <p className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Online · Movie & Series Assistant
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex size-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2.5", msg.role === "user" && "flex-row-reverse")}>
                {/* Avatar */}
                <div className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  msg.role === "assistant"
                    ? "bg-gradient-to-br from-primary to-red-600"
                    : "bg-white/10"
                )}>
                  {msg.role === "assistant" ? (
                    <Bot className="size-4 text-white" />
                  ) : (
                    <User className="size-4 text-white/70" />
                  )}
                </div>
                {/* Bubble */}
                <div className={cn("max-w-[78%] space-y-3", msg.role === "user" && "text-right")}>
                  <div className={cn(
                    "inline-block rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "assistant"
                      ? "bg-white/8 text-white/90 rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm"
                  )}>
                    {msg.content}
                  </div>
                  {/* Title suggestion cards */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        Click to watch ↓
                      </p>
                      {msg.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => onPlayTitle(s)}
                          className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-left transition hover:border-primary/40 hover:bg-white/10"
                        >
                          {/* Poster thumbnail */}
                          <div className="size-12 shrink-0 overflow-hidden rounded bg-neutral-800">
                            {s.poster ? (
                              <img
                                src={s.poster}
                                alt={s.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                {s.type === "series" ? (
                                  <Tv className="size-4 text-white/30" />
                                ) : (
                                  <Film className="size-4 text-white/30" />
                                )}
                              </div>
                            )}
                          </div>
                          {/* Title info */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-white">{s.title}</p>
                            <p className="flex items-center gap-1.5 text-[10px] text-white/50">
                              {s.type === "series" ? "📺 Series" : "🎬 Movie"}
                              {s.year && <span>• {s.year}</span>}
                              {s.rating && <span>• ⭐ {s.rating}</span>}
                            </p>
                          </div>
                          {/* Play icon */}
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                            ▶
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-600">
                  <Bot className="size-4 text-white" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white/8 px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-white/60" />
                  <span className="text-xs text-white/60">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestion chips (show only on first message) */}
          {messages.length <= 1 && !loading && (
            <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-4 py-2">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/60 transition hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for a recommendation..."
              disabled={loading}
              maxLength={1000}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-30"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
