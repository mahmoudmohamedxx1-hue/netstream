import { NextRequest } from "next/server"
import { createDecipheriv } from "crypto"
import { resolveVidoraSource, parseMediaPlaylist, DL_UA } from "@/lib/download-sources"

// GET /api/download-file?imdbId=tt0111161&type=movie&season=1&episode=1
//                    &quality=1080p&title=Shawshank
//
// Server-side streaming download: resolves the source, downloads segments
// with a sliding-window (bounded memory), decrypts AES-128 if needed, and
// streams a finished file to the browser with Content-Disposition — the
// user gets their browser's native download manager (progress, pause,
// cancel). fMP4 streams are stitched into a real .mp4; TS streams are
// delivered as .ts (plays in VLC / any player).

export const dynamic = "force-dynamic"
export const maxDuration = 300

const CONCURRENCY = 6

function sanitizeFilename(name: string): string {
  return (name || "video")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 80) || "video"
}

/** AES-128-CBC decrypt a single HLS segment (PKCS7 unpadded). */
function decryptSegment(data: Uint8Array, key: Buffer, iv: Buffer): Uint8Array {
  const decipher = createDecipheriv("aes-128-cbc", key, iv)
  decipher.setAutoPadding(false)
  const out = Buffer.concat([decipher.update(data), decipher.final()])
  // Strip PKCS7 padding manually (robust against sloppy providers)
  if (out.length > 0) {
    const pad = out[out.length - 1]
    if (pad >= 1 && pad <= 16 && out.length >= pad) {
      let valid = true
      for (let i = out.length - pad; i < out.length; i++) {
        if (out[i] !== pad) { valid = false; break }
      }
      if (valid) return out.subarray(0, out.length - pad)
    }
  }
  return out
}

/** 16-byte big-endian sequence number IV (HLS spec when IV attr missing). */
function ivFromSequence(seq: number): Buffer {
  const iv = Buffer.alloc(16)
  iv.writeUInt32BE(Math.floor(seq / 2 ** 32), 8)
  iv.writeUInt32BE(seq % 2 ** 32, 12)
  return iv
}

function ivFromHex(hex: string): Buffer {
  const buf = Buffer.alloc(16)
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  buf.write(clean.padStart(32, "0").slice(0, 32).slice(-32), "hex")
  return buf
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const imdbId = searchParams.get("imdbId")
  const type = searchParams.get("type") === "series" ? "series" : "movie"
  const season = searchParams.get("season") || "1"
  const episode = searchParams.get("episode") || "1"
  const quality = searchParams.get("quality") || "best"
  const title = sanitizeFilename(searchParams.get("title") || "netstream-video")
  const suffix = type === "series" ? `.S${season}E${episode}` : ""

  if (!imdbId) return new Response("imdbId required", { status: 400 })

  // ── Resolve + pick variant ──────────────────────────────────────────────
  let source
  try {
    source = await resolveVidoraSource(imdbId, type, season, episode)
  } catch {
    source = null
  }
  if (!source || source.variants.length === 0) {
    return new Response("No downloadable source found for this title", { status: 404 })
  }

  const variant =
    quality === "best"
      ? source.variants[source.variants.length - 1]
      : source.variants.find((v) => v.quality === quality) ||
        source.variants[source.variants.length - 1]

  // Re-fetch the chosen media playlist for the authoritative segment list
  let playlistRes: Response
  try {
    playlistRes = await fetch(variant.url, {
      headers: { "User-Agent": DL_UA, Referer: source.referer },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return new Response("Failed to fetch playlist", { status: 502 })
  }
  if (!playlistRes.ok) return new Response(`Playlist ${playlistRes.status}`, { status: 502 })
  const playlistText = await playlistRes.text()
  const playlistUrl = playlistRes.url || variant.url
  const parsed = parseMediaPlaylist(playlistText, playlistUrl)
  if (parsed.segments.length === 0) return new Response("Empty playlist", { status: 502 })

  const isFmp4 = !!parsed.mapUrl
  const ext = isFmp4 ? "mp4" : "ts"

  // AES key (if encrypted)
  let aesKey: Buffer | null = null
  let playlistIv: Buffer | null = null
  if (parsed.aesKeyUrl) {
    try {
      const keyRes = await fetch(parsed.aesKeyUrl, {
        headers: { "User-Agent": DL_UA, Referer: source.referer },
        signal: AbortSignal.timeout(10000),
      })
      if (keyRes.ok) {
        const kb = Buffer.from(await keyRes.arrayBuffer())
        if (kb.length >= 16) aesKey = kb.subarray(0, 16)
      }
    } catch { /* fall through unencrypted */ }
    if (parsed.aesIv) playlistIv = ivFromHex(parsed.aesIv)
  }

  // ── Streaming download with in-order emission ───────────────────────────
  const filename = `${title}${suffix}.${ext}`
  const segCount = parsed.segments.length
  const segs = parsed.segments

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const results = new Map<number, Uint8Array>()
      let nextToEmit = 0
      let cursor = 0

      const tryEmit = () => {
        while (!closed && results.has(nextToEmit)) {
          const buf = results.get(nextToEmit)!
          results.delete(nextToEmit)
          if (buf.length > 0) controller.enqueue(buf)
          nextToEmit++
        }
      }

      const safeEnqueue = (buf: Uint8Array) => {
        if (!closed && buf.length > 0) controller.enqueue(buf)
      }

      try {
        // fMP4: init segment (EXT-X-MAP) comes first
        if (parsed.mapUrl) {
          try {
            const initRes = await fetch(parsed.mapUrl, {
              headers: { "User-Agent": DL_UA, Referer: source.referer },
              signal: AbortSignal.timeout(15000),
            })
            if (initRes.ok) {
              safeEnqueue(Buffer.from(await initRes.arrayBuffer()))
            }
          } catch { /* skip init if unreachable */ }
        }

        const fetchSegment = async (idx: number): Promise<Uint8Array> => {
          const seg = segs[idx]
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(seg.url, {
                headers: { "User-Agent": DL_UA, Referer: source.referer },
                signal: AbortSignal.timeout(30000),
              })
              if (!res.ok) throw new Error(String(res.status))
              let buf: Uint8Array = Buffer.from(await res.arrayBuffer())
              if (buf.length === 0) throw new Error("empty")
              if (aesKey) {
                const seq = parsed.mediaSequence + idx
                const iv = playlistIv || ivFromSequence(seq)
                try { buf = decryptSegment(buf, aesKey, iv) } catch { /* keep raw */ }
              }
              return buf
            } catch {
              if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
            }
          }
          return Buffer.alloc(0) // permanent failure → empty placeholder keeps order
        }

        const worker = async () => {
          while (true) {
            const idx = cursor++
            if (idx >= segCount) return
            const buf = await fetchSegment(idx)
            results.set(idx, buf)
            tryEmit()
          }
        }

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, segCount) }, () => worker()))
      } catch (e) {
        // Network aborts (client closed download) land here — just close
        console.warn("[download-file] stream ended:", e instanceof Error ? e.message : e)
      } finally {
        if (!closed) {
          closed = true
          try { controller.close() } catch { /* already closed */ }
        }
      }
    },
    cancel() { /* client aborted the download */ },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": isFmp4 ? "video/mp4" : "video/mp2t",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
