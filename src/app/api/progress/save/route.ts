import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// POST /api/progress/save
// Body: { imdbId, title, type, poster, season, episode, position, duration }
// Saves (upserts) the user's playback position so they can resume later.
// Called periodically (every ~10s) during playback + on pause/close.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { imdbId, title, type, poster, season, episode, position, duration } = body
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  const store = await cookies()
  const accessToken = store.get("sb-access-token")?.value
  if (!accessToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const supabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const { error } = await supabase.from("watch_progress").upsert({
      user_id: user.id,
      imdb_id: imdbId,
      title: title ?? null,
      type: type ?? null,
      poster: poster ?? null,
      season: season ?? null,
      episode: episode ?? null,
      position: position ?? 0,
      duration: duration ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,imdb_id,season,episode" })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[api/progress/save]", e)
    return NextResponse.json({ error: e.message ?? "Failed to save progress" }, { status: 500 })
  }
}
