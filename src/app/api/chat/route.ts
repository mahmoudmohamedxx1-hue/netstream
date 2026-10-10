import { NextRequest, NextResponse } from "next/server"

// AI Chat API — Movie & Series Recommendation Assistant
// Supports multiple keyless models:
//   - "glm" (DEFAULT) — GLM 5.3 Flash KEYLESS via LLM7 (same proven
//      integration as the user's egxdesk project — works from ANY network
//      incl. Vercel). Second hop: Z.ai internal keyless endpoint (sandbox/
//      Z.ai infra only; circuit-breaker protected).
//   - "kilo" — Nemotron 3 Super 120B keyless via Kilo Gateway (egxdesk's
//      T74 main model — a real 120B brain, 200 req/hr per IP).
//   - "pollinations" — gpt-oss-20b via Pollinations, keyless
//   - "llm7" — LLM7 auto-router ("default"), keyless
// Optional env: LLM7_API_KEY (free key from llm7.io) raises llm7 rate
// limits; ZAI_API_KEY switches the GLM hop-2 client to the public Z.ai API.
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

// Pollinations AI (keyless)
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

// ── LLM7 (keyless; optional LLM7_API_KEY raises limits) ─────────────────
const LLM7_URL = "https://api.llm7.io/v1/chat/completions"
const LLM7_GLM_MODEL = "GLM-5.3-Flash" // exact casing — lowercase 400s

async function llm7Round(model: string, messages: { role: string; content: string }[], timeoutMs = 20000): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (process.env.LLM7_API_KEY) headers["Authorization"] = `Bearer ${process.env.LLM7_API_KEY}`
  return fetch(LLM7_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

async function callLLM7Model(model: string, messages: { role: string; content: string }[], timeoutMs = 20000): Promise<string> {
  let res = await llm7Round(model, messages, timeoutMs)
  // Shared free tier: on a SHORT 429 ("Retry after N seconds", per-minute
  // rolling quota) wait ONCE (capped at 5s) and retry. On a LONG 429 (daily
  // quota exhaustion — retry-after in minutes/hours) fall through to the
  // next provider immediately instead of burning a pointless retry.
  if (res.status === 429) {
    const body = await res.text().catch(() => "")
    const waitS = Number(/retry after (\d+)/i.exec(body)?.[1] ?? 3)
    if (waitS > 60) {
      throw new Error(`LLM7(${model}) daily quota exhausted (retry after ${Math.round(waitS / 60)}min)`)
    }
    await new Promise((r) => setTimeout(r, Math.min(Math.max(waitS, 2), 5) * 1000))
    res = await llm7Round(model, messages, timeoutMs)
  }
  if (!res.ok) throw new Error(`LLM7(${model}) HTTP ${res.status}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ""
  if (!content) throw new Error(`LLM7(${model}) empty content`)
  return content
}

// LLM7 auto-router (keyless) — the "llm7" model option
async function callLLM7(messages: { role: string; content: string }[]): Promise<string> {
  return callLLM7Model("default", messages)
}

// ── Kilo Gateway (keyless) — Nemotron 3 Super 120B, egxdesk's T74 main ────
const KILO_URL = "https://api.kilo.ai/api/gateway/v1/chat/completions"
const KILO_ROUTES = ["nvidia/nemotron-3-super-120b-a12b:free", "openrouter/free"]

async function callKilo(messages: { role: string; content: string }[]): Promise<string> {
  const errs: string[] = []
  for (const model of KILO_ROUTES) {
    try {
      const res = await fetch(KILO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 2048 }),
        signal: AbortSignal.timeout(20000),
      })
      if (res.ok) {
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content ?? ""
        if (content.trim()) return content
        errs.push(`${model}: empty content`)
        continue
      }
      errs.push(`${model}: HTTP ${res.status}`)
    } catch (e) {
      errs.push(`${model}: ${(e as Error).message}`)
    }
  }
  throw new Error(`Kilo failed — ${errs.join(" ; ")}`)
}

// ── GLM 5.3 Flash keyless — THE DEFAULT MODEL (composite chain) ─────────
//   hop 1: LLM7 "GLM-5.3-Flash" — the REAL keyless GLM 5.3 Flash tier,
//          reachable from ANY network (incl. Vercel) — the integration the
//          user shipped in egxdesk. 429-aware with one bounded retry.
//   hop 2: Z.ai internal keyless endpoint (src/lib/glm-keyless.ts) — only
//          routable inside Z.ai's infrastructure (sandbox/dev); the circuit
//          breaker caps its cost elsewhere at one 8s attempt per 10-minute
//          window per server instance.
async function callGLM(messages: { role: string; content: string }[]): Promise<string> {
  // hop 1: LLM7 "GLM-5.3-Flash" — 12s cap (from Vercel's shared egress IPs
  // llm7 sometimes tarpits instead of answering cleanly; don't let it eat
  // the whole request budget).
  try {
    return await callLLM7Model(LLM7_GLM_MODEL, messages, 12000)
  } catch (e) {
    console.error("[api/chat] GLM hop-1 (LLM7 GLM-5.3-Flash) failed:", (e as Error).message)
  }
  // hop 2: Z.ai internal keyless endpoint — only meaningful where it is
  // reachable: inside Z.ai's infrastructure (sandbox/dev) or with a real
  // ZAI_API_KEY (which switches glm-keyless to the PUBLIC api.z.ai). On
  // Vercel without a key it is provably unreachable (internal-api.z.ai
  // resolves to private RFC1918 IPs → ConnectTimeoutError, runtime-log
  // verified), so skip it instead of paying the timeout on every cold
  // start — the circuit breaker already covers warm instances.
  if (process.env.VERCEL === "1" && !process.env.ZAI_API_KEY) {
    throw new Error("GLM hop-2 skipped on Vercel (internal endpoint unreachable; set ZAI_API_KEY to use the public endpoint)")
  }
  const { glmChatCompletion } = await import("@/lib/glm-keyless")
  return glmChatCompletion(messages as any) // throws → outer loop falls through
}

// GET /api/chat — health check / model list
export async function GET() {
  const { isGLMConfigured, isGLMCircuitOpen } = await import("@/lib/glm-keyless")
  return NextResponse.json({
    status: "ok",
    models: [
      { id: "glm", name: "GLM 5.3 Flash (Keyless)", available: true },
      { id: "kilo", name: "Nemotron 3 Super 120B (Keyless)", available: true },
      { id: "pollinations", name: "GPT-OSS 20B (Keyless)", available: true },
      { id: "llm7", name: "LLM7 Auto (Keyless)", available: true },
    ],
    glmInternalHop: { configured: isGLMConfigured(), circuitOpen: isGLMCircuitOpen() },
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

    // Determine which model to use — GLM 5.3 Flash keyless (via LLM7, with
    // the Z.ai-internal second hop) is the DEFAULT everywhere.
    const requestedModel = model || "glm"
    let aiText = ""
    let usedModel = ""

    // Build model order — requested model first, then fallbacks
    const modelOrder: string[] = requestedModel === "glm"
      ? ["glm", "kilo", "pollinations", "llm7"]
      : requestedModel === "kilo"
        ? ["kilo", "glm", "pollinations", "llm7"]
        : requestedModel === "llm7"
          ? ["llm7", "glm", "kilo", "pollinations"]
          : ["pollinations", "glm", "kilo", "llm7"]

    for (const m of modelOrder) {
      try {
        if (m === "pollinations") { aiText = await callPollinations(messages); usedModel = "pollinations" }
        else if (m === "llm7") { aiText = await callLLM7(messages); usedModel = "llm7" }
        else if (m === "kilo") { aiText = await callKilo(messages); usedModel = "kilo" }
        else if (m === "glm") { aiText = await callGLM(messages); usedModel = "glm" }
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
