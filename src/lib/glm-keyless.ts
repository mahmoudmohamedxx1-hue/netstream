// GLM keyless client — direct fetch replica of z-ai-web-dev-sdk's chat
// completion call, without the filesystem-only config dependency.
//
// Why: the SDK resolves its config from process.cwd()/.z-ai-config,
// ~/.z-ai-config, or /etc/.z-ai-config. None of those exist on Vercel
// (and the cwd is read-only there). This client keeps identical behavior
// (same endpoint, same headers, same body shape) but resolves config from:
//   1. ZAI_KEYLESS_CONFIG env var (JSON string) — serverless/production
//   2. /etc/.z-ai-config → ~/.z-ai-config → ./.z-ai-config — sandbox/dev
//
// Also includes a circuit breaker so a dead/unreachable GLM endpoint never
// adds timeout latency to more than one request per cooldown window.

import fs from "fs"
import os from "os"
import path from "path"

export interface GLMConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

const CONFIG_FILE_PATHS = [
  "/etc/.z-ai-config", // sandbox: system-level SDK config
  path.join(os.homedir(), ".z-ai-config"),
  path.join(process.cwd(), ".z-ai-config"),
]

let cachedConfig: GLMConfig | null | undefined

/** Resolve the keyless GLM config. Returns null when unavailable (e.g. no env var on a bare server). */
export function resolveGLMConfig(): GLMConfig | null {
  if (cachedConfig !== undefined) return cachedConfig

  // 1. Env var (serverless-friendly)
  const envRaw = process.env.ZAI_KEYLESS_CONFIG
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw)
      if (parsed.baseUrl && parsed.apiKey) {
        cachedConfig = parsed as GLMConfig
        return cachedConfig
      }
    } catch {
      console.error("[glm-keyless] ZAI_KEYLESS_CONFIG is set but not valid JSON")
    }
  }

  // 2. Config files (sandbox parity with z-ai-web-dev-sdk)
  for (const p of CONFIG_FILE_PATHS) {
    try {
      const raw = fs.readFileSync(p, "utf-8")
      const parsed = JSON.parse(raw)
      if (parsed.baseUrl && parsed.apiKey) {
        cachedConfig = parsed as GLMConfig
        return cachedConfig
      }
    } catch {
      // ENOENT etc. — try next
    }
  }

  cachedConfig = null
  return null
}

/** Whether GLM is usable in this environment (for health reporting). */
export function isGLMConfigured(): boolean {
  return resolveGLMConfig() !== null
}

// ── Circuit breaker ──────────────────────────────────────────────────────
// When the GLM endpoint fails (network-blocked, 4xx/5xx, timeout), stop
// trying it for COOLDOWN_MS so every chat message doesn't pay the timeout
// penalty. Module-scope: applies for the lifetime of the server instance
// (on Vercel that's per warm lambda — cold starts re-probe automatically).

const GLM_COOLDOWN_MS = 10 * 60 * 1000 // retry GLM every 10 minutes after a failure
let glmDownSince = 0

export function isGLMCircuitOpen(): boolean {
  return glmDownSince > 0 && Date.now() - glmDownSince < GLM_COOLDOWN_MS
}

export function glmCircuitRemainingMs(): number {
  if (!isGLMCircuitOpen()) return 0
  return GLM_COOLDOWN_MS - (Date.now() - glmDownSince)
}

function tripCircuit() {
  glmDownSince = Date.now()
}

function resetCircuit() {
  glmDownSince = 0
}

// ── Chat completion (SDK-identical request) ──────────────────────────────

export interface GLMChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

const GLM_TIMEOUT_MS = 12000

/**
 * Keyless GLM chat completion. Mirrors z-ai-web-dev-sdk's
 * createChatCompletion: same URL, headers, and body (thinking disabled by
 * default). Throws on failure — callers should have their own fallback.
 */
export async function glmChatCompletion(
  messages: GLMChatMessage[],
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const config = resolveGLMConfig()
  if (!config) throw new Error("GLM config not available (no ZAI_KEYLESS_CONFIG env var, no config file)")
  if (isGLMCircuitOpen()) {
    throw new Error(`GLM circuit open (${Math.ceil(glmCircuitRemainingMs() / 1000)}s until retry)`)
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "X-Z-AI-From": "Z",
  }
  if (config.chatId) headers["X-Chat-Id"] = config.chatId
  if (config.userId) headers["X-User-Id"] = config.userId
  if (config.token) headers["X-Token"] = config.token

  const body = {
    messages,
    thinking: { type: "disabled" },
  }

  try {
    const res = await Promise.race([
      fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GLM timeout")), opts.timeoutMs ?? GLM_TIMEOUT_MS)
      ),
    ])

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      throw new Error(`GLM HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error("GLM returned empty content")
    resetCircuit()
    return content
  } catch (e) {
    tripCircuit()
    throw e
  }
}
