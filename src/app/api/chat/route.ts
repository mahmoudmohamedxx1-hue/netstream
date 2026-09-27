import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"

// ──────────────────────────────────────────────────────────────────────────
// AI Chat API — Movie & Series Recommendation Assistant
//
// Uses z-ai-web-dev-sdk (keyless, pre-authenticated via /etc/.z-ai-config).
// The AI is connected to the website's data: it knows what titles are
// trending, popular, and available on NetStream. When it recommends a
// title, we search TMDB to make it clickable in the UI.
// ──────────────────────────────────────────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY || "1c5d8fc6971ccb06fcc873d748bcba92"
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_IMG = "https://image.tmdb.org/t/p/w500"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

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

// ── System prompt — tells the AI it's NetStream's assistant ───────────────
const SYSTEM_PROMPT = `You are NetStream AI, the official recommendation assistant for NetStream — a free streaming platform where users watch movies and TV series in HD with 40+ streaming sources.

Your job: help users discover movies and series they'll love. You have deep knowledge of cinema and TV from all over the world, including Hollywood, Bollywood, Arabic cinema, Turkish dramas, Korean dramas, anime, and more.

Guidelines:
- Be friendly, enthusiastic, and concise. Keep responses under 200 words.
- When recommending titles, ALWAYS format each title on its own line prefixed with "🎬 " (for movies) or "📺 " (for TV series), followed by the title and year in parentheses. Example: "🎬 The Dark Knight (2008)"
- Give a 1-sentence reason for each recommendation.
- If the user asks for a specific genre, mood, language, or era, tailor your picks.
- Mention 3-5 titles per recommendation (not more, to keep it digestible).
- If the user asks something unrelated to movies/TV, gently steer back to entertainment.
- You can also answer questions about actors, directors, plot summaries, and "what should I watch" questions.
- For Arabic content, include both the Arabic and English names when possible.

Remember: every title you recommend should be formatted as "🎬 Title (Year)" or "📺 Title (Year)" so the system can make them clickable.`

// ── Fetch a snapshot of what's currently on NetStream ─────────────────────
async function getPlatformContext(): Promise<string> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return ""
    const data = await res.json()
    const titles = (data.results ?? []).slice(0, 20).map((r: any) => {
      const title = r.title ?? r.name ?? ""
      const type = r.media_type === "tv" ? "series" : "movie"
      const year = (r.release_date ?? r.first_air_date ?? "").slice(0, 4)
      return `${type === "series" ? "📺" : "🎬"} ${title} (${year})`
    })
    return `\n\nCurrently trending on NetStream this week:\n${titles.join("\n")}`
  } catch {
    return ""
  }
}

// ── Extract title suggestions from AI response and match to TMDB ──────────
async function extractTitleSuggestions(text: string): Promise<TitleSuggestion[]> {
  // Match patterns like "🎬 Title (Year)" or "📺 Title (Year)"
  const titleRegex = /[🎬📺]\s+(.+?)\s*\((\d{4})?\)/g
  const matches: { title: string; year?: string }[] = []
  let m: RegExpExecArray | null
  while ((m = titleRegex.exec(text)) !== null) {
    const title = m[1].trim()
    const year = m[2] || undefined
    if (title && title.length > 1 && title.length < 200) {
      matches.push({ title, year })
    }
  }

  if (matches.length === 0) return []

  // Search TMDB for each title (in parallel, max 5)
  const top = matches.slice(0, 5)
  const results = await Promise.all(
    top.map(async ({ title, year }) => {
      try {
        const searchRes = await fetch(
          `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US&page=1`,
          { next: { revalidate: 3600 } }
        )
        if (!searchRes.ok) return null
        const searchData = await searchRes.json()
        const results = (searchData.results ?? []).filter(
          (r: any) => r.media_type === "movie" || r.media_type === "tv"
        )
        if (results.length === 0) return null

        // Prefer results matching the year if provided
        let best = results[0]
        if (year) {
          const yearMatch = results.find((r: any) => {
            const rYear = (r.release_date ?? r.first_air_date ?? "").slice(0, 4)
            return rYear === year
          })
          if (yearMatch) best = yearMatch
        }

        const type: "movie" | "series" = best.media_type === "tv" ? "series" : "movie"
        const bestYear = (best.release_date ?? best.first_air_date ?? "").slice(0, 4)

        // Try to get imdbId via external_ids
        let imdbId: string | undefined
        try {
          const extRes = await fetch(
            `${TMDB_BASE}/${best.media_type}/${best.id}/external_ids?api_key=${TMDB_API_KEY}`,
            { next: { revalidate: 86400 } }
          )
          if (extRes.ok) {
            const extData = await extRes.json()
            imdbId = extData.imdb_id ?? undefined
          }
        } catch {}

        return {
          title: best.title ?? best.name ?? title,
          year: bestYear || year,
          type,
          tmdbId: best.id,
          imdbId,
          poster: best.poster_path ? `${TMDB_IMG}${best.poster_path}` : null,
          overview: best.overview ?? "",
          rating: best.vote_average ? String(best.vote_average) : null,
        } as TitleSuggestion
      } catch {
        return null
      }
    })
  )

  return results.filter((r): r is TitleSuggestion => r !== null)
}

// ── POST /api/chat ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history }: { message: string; history?: ChatMessage[] } = body ?? {}

    if (!message || typeof message !== "string" || message.length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "message too long (max 1000 chars)" }, { status: 400 })
    }

    // Build the platform context (what's trending right now)
    const platformContext = await getPlatformContext()

    // Initialize the ZAI SDK (keyless — pre-authenticated)
    const zai = await ZAI.create()

    // Build the message array: system prompt + conversation history + user message
    const messages: { role: string; content: string }[] = [
      { role: "assistant", content: SYSTEM_PROMPT + platformContext },
      ...(history ?? []).slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ]

    const completion = await zai.chat.completions.create({
      messages: messages as any,
      thinking: { type: "disabled" },
    })

    const aiText = completion.choices[0]?.message?.content ?? ""

    // Extract clickable title suggestions from the AI response
    const suggestions = await extractTitleSuggestions(aiText)

    return NextResponse.json({
      reply: aiText,
      suggestions,
    })
  } catch (e) {
    console.error("[api/chat] error:", e)
    return NextResponse.json(
      {
        error: "AI assistant is temporarily unavailable. Please try again.",
        reply: "Sorry, I couldn't process your request right now. Please try again in a moment.",
        suggestions: [],
      },
      { status: 500 }
    )
  }
}
