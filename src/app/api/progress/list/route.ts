import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// GET /api/progress/list
// Returns the current signed-in user's watch history (most recent first),
// formatted as CardTitle[] for the Continue Watching row. Each item includes
// the exact resume position (in seconds) and duration so the player can
// seek to the exact moment the user left off.
export async function GET() {
  const store = await cookies()
  const accessToken = store.get("sb-access-token")?.value
  if (!accessToken) return NextResponse.json({ items: [] })
  try {
    const supabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ items: [] })
    // Fetch the 20 most recently watched titles for this user.
    const { data, error } = await supabase
      .from("watch_progress")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ items: [] })
    // Filter out titles that are essentially at 0 (not started) or at the
    // very end (finished) — don't show "continue watching" for those.
    const items = (data ?? [])
      .filter((row: any) => row.position > 5 && (!row.duration || row.position < row.duration * 0.95))
      .map((row: any) => ({
        imdbId: row.imdb_id,
        title: row.title ?? "",
        type: row.type ?? "movie",
        poster: row.poster ?? null,
        year: null,
        overview: null,
        rating: null,
        season: row.season ?? null,
        episode: row.episode ?? null,
        progress: row.duration ? Math.round((row.position / row.duration) * 100) : 0,
        position: Number(row.position), // seconds — the player seeks here on resume
        duration: row.duration ? Number(row.duration) : null,
        updatedAt: row.updated_at,
      }))
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[api/progress/list]", e)
    return NextResponse.json({ items: [] })
  }
}
