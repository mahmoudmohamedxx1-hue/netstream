import { NextRequest, NextResponse } from "next/server"

// AI Chat API — Movie & Series Recommendation Assistant
// Supports multiple keyless models:
//   - "glm" (DEFAULT) — GLM 5.3 Flash keyless via Z.ai (glm-keyless client;
//      works in sandbox via /etc/.z-ai-config and on serverless via the
//      ZAI_KEYLESS_CONFIG env var). Circuit-breaker protected: if the
//      endpoint is unreachable, later requests skip it instantly.
//   - "pollinations" — gpt-oss-20b via Pollinations, keyless (1st fallback)
//   - "llm7" — codestral via LLM7, keyless (2nd fallback)
// The user can switch models in the chat UI; GLM is the default everywhere.

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

const SYSTEM_PROMPT = `You are NetStream AI, the official recommendation assistant for NetStream — a free streaming platform where users watch movies and TV series in HD with 40+ streaming sources.

Your job: help users discover movies and series they'll love.

## PRIORITY CONTENT (in this order)
When recommending titles, prioritize in this order:
1. **Hollywood movies** — blockbuster hits, action, sci-fi, drama, comedy from major studios
2. **Oscar-winning & Oscar-nominated films** — Academy Award winners and nominees (Best Picture, Best Director, Best Actor/Actress, etc.)
3. **Arabic movies & series** — Egyptian, Syrian, Lebanese, Gulf cinema and TV dramas
4. **International content** — Korean, Turkish, Bollywood, European, anime, etc.

Unless the user specifically asks for something else, ALWAYS include at least 1-2 Hollywood/Oscar titles and 1 Arabic title in your recommendations.

You have deep knowledge of cinema and TV from all over the world, including Hollywood, Bollywood, Arabic cinema, Turkish dramas, Korean dramas, anime, and more.

Guidelines:
- Be friendly, enthusiastic, and concise. Keep responses under 200 words.
- When recommending titles, ALWAYS format each title on its own line prefixed with "🎬 " (for movies) or "📺 " (for TV series), followed by the title and year in parentheses. Example: "🎬 The Dark Knight (2008)"
- Give a 1-sentence reason for each recommendation.
- If the user asks for a specific genre, mood, language, or era, tailor your picks.
- Mention 3-5 titles per recommendation (not more, to keep it digestible).
- If the user asks something unrelated to movies/TV, gently steer back to entertainment.
- You can also answer questions about actors, directors, plot summaries, and "what should I watch" questions.
- For Arabic content, include both the Arabic and English names when possible.
- When mentioning Oscar winners, note the award (e.g., "Best Picture winner", "Oscar nominee for Best Director").

Remember: every title you recommend should be formatted as "🎬 Title (Year)" or "📺 Title (Year)" so the system can make them clickable.`

async function getPlatformContext(): Promise<string> {
  try {
    // Fetch multiple content categories in parallel to give the AI context
    // about what's available on NetStream, prioritizing Hollywood, Oscar,
    // and Arabic content.
    const [trendingRes, topMoviesRes, arabicMoviesRes, arabicSeriesRes] = await Promise.all([
      fetch(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`, { next: { revalidate: 3600 } }).catch(() => null),
      fetch(`${TMDB_BASE}/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`, { next: { revalidate: 3600 } }).catch(() => null),
      fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&with_original_language=ar&sort_by=popularity.desc&page=1`, { next: { revalidate: 3600 } }).catch(() => null),
      fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&with_original_language=ar&sort_by=popularity.desc&page=1`, { next: { revalidate: 3600 } }).catch(() => null),
    ])

    const sections: string[] = []

    // Trending this week
    if (trendingRes?.ok) {
      const data = await trendingRes.json()
      const titles = (data.results ?? []).slice(0, 15).map((r: any) => {
        const title = r.title ?? r.name ?? ""
        const type = r.media_type === "tv" ? "series" : "movie"
        const year = (r.release_date ?? r.first_air_date ?? "").slice(0, 4)
        return `${type === "series" ? "📺" : "🎬"} ${title} (${year})`
      })
      if (titles.length) sections.push(`📈 Trending this week:\n${titles.join("\n")}`)
    }

    // Top-rated Hollywood/Oscar movies
    if (topMoviesRes?.ok) {
      const data = await topMoviesRes.json()
      const titles = (data.results ?? []).slice(0, 10).map((r: any) => {
        const title = r.title ?? ""
        const year = (r.release_date ?? "").slice(0, 4)
        return `🎬 ${title} (${year})`
      })
      if (titles.length) sections.push(`🏆 Top-rated Hollywood/Oscar movies:\n${titles.join("\n")}`)
    }

    // Arabic movies
    if (arabicMoviesRes?.ok) {
      const data = await arabicMoviesRes.json()
      const titles = (data.results ?? []).slice(0, 8).map((r: any) => {
        const title = r.title ?? ""
        const year = (r.release_date ?? "").slice(0, 4)
        return `🎬 ${title} (${year})`
      })
      if (titles.length) sections.push(`🌍 Popular Arabic movies:\n${titles.join("\n")}`)
    }

    // Arabic series
    if (arabicSeriesRes?.ok) {
      const data = await arabicSeriesRes.json()
      const titles = (data.results ?? []).slice(0, 8).map((r: any) => {
        const title = r.name ?? ""
        const year = (r.first_air_date ?? "").slice(0, 4)
        return `📺 ${title} (${year})`
      })
      if (titles.length) sections.push(`🌍 Popular Arabic series:\n${titles.join("\n")}`)
    }

    if (sections.length === 0) return ""
    return `\n\n=== Currently available on NetStream ===\n\n${sections.join("\n\n")}`
  } catch {
    return ""
  }
}

async function extractTitleSuggestions(text: string): Promise<TitleSuggestion[]> {
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

// ── Model providers ──────────────────────────────────────────────────────

// Pollinations AI (keyless) — primary
async function callPollinations(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: "openai", messages }),
  })
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

// LLM7 (keyless) — fallback
async function callLLM7(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch("https://api.llm7.io/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: "default", messages }),
  })
  if (!res.ok) throw new Error(`LLM7 HTTP ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

// GLM 5.3 Flash keyless — the DEFAULT model. Direct-fetch client (see
// src/lib/glm-keyless.ts): no SDK file dependency, config from env var on
// serverless or /etc/.z-ai-config in sandbox. Circuit breaker: if GLM is
// unreachable, it is skipped instantly (0ms) for 10 minutes instead of
// hanging every request. Fallback to Pollinations/LLM7 stays automatic.

// GET /api/chat — health check / model list
export async function GET() {
  const { isGLMConfigured, isGLMCircuitOpen } = await import("@/lib/glm-keyless")
  return NextResponse.json({
    status: "ok",
    models: [
      { id: "glm", name: "GLM 5.3 Flash (Keyless)", available: isGLMConfigured(), circuitOpen: isGLMCircuitOpen() },
      { id: "pollinations", name: "GPT-OSS 20B (Keyless)", available: true },
      { id: "llm7", name: "Codestral (Keyless)", available: true },
    ],
    timestamp: Date.now(),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history, model }: { message: string; history?: ChatMessage[]; model?: string } = body ?? {}

    if (!message || typeof message !== "string" || message.length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "message too long (max 1000 chars)" }, { status: 400 })
    }

    const platformContext = await getPlatformContext()

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT + platformContext },
      ...(history ?? []).slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ]

    // Determine which model to use — GLM 5.3 Flash keyless is the DEFAULT
    // everywhere (sandbox AND Vercel). The glm-keyless circuit breaker means
    // an unreachable GLM costs at most one timeout per 10-minute window per
    // server instance; after that it is skipped instantly.
    const requestedModel = model || "glm"
    let aiText = ""
    let usedModel = ""

    // Build model order — requested model first, then fallbacks
    const modelOrder: string[] = requestedModel === "glm"
      ? ["glm", "pollinations", "llm7"]
      : requestedModel === "llm7"
        ? ["llm7", "pollinations", "glm"]
        : ["pollinations", "llm7", "glm"]

    for (const m of modelOrder) {
      try {
        if (m === "pollinations") { aiText = await callPollinations(messages); usedModel = "pollinations" }
        else if (m === "llm7") { aiText = await callLLM7(messages); usedModel = "llm7" }
        else if (m === "glm") {
          const { glmChatCompletion } = await import("@/lib/glm-keyless")
          aiText = await glmChatCompletion(messages as any)
          usedModel = "glm"
        }
        if (aiText) break
      } catch (e) {
        console.error(`[api/chat] ${m} failed:`, e)
        continue
      }
    }

    if (!aiText) {
      throw new Error("All AI providers failed")
    }

    const suggestions = await extractTitleSuggestions(aiText)

    return NextResponse.json({
      reply: aiText,
      suggestions,
      model: usedModel,
    })
  } catch (e) {
    console.error("[api/chat] error:", e)
    return NextResponse.json(
      {
        error: "AI assistant is temporarily unavailable.",
        reply: "Sorry, I couldn't process your request right now. Please try again in a moment.",
        suggestions: [],
        model: "none",
      },
      { status: 500 }
    )
  }
}
