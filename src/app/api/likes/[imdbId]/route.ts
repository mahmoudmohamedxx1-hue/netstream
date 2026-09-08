import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// GET /api/likes/[imdbId]
// Returns { count, hasLiked } for a title. `count` is the total number of
// real cross-user likes. `hasLiked` is true if the current signed-in user
// has liked this title (false if not signed in). Public — anyone can read.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  try {
    const supabase = createAdminClient()
    // Count ALL likes for this title (admin client bypasses RLS).
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("imdb_id", imdbId)
    // Check if the current user has liked it (via the access-token cookie).
    const store = await cookies()
    const accessToken = store.get("sb-access-token")?.value
    let hasLiked = false
    if (accessToken) {
      const { data: { user } } = await supabase.auth.getUser(accessToken)
      if (user) {
        const { data } = await supabase
          .from("likes")
          .select("user_id")
          .eq("imdb_id", imdbId)
          .eq("user_id", user.id)
          .maybeSingle()
        hasLiked = !!data
      }
    }
    return NextResponse.json({ count: count ?? 0, hasLiked })
  } catch (e) {
    console.error("[api/likes GET]", e)
    return NextResponse.json({ error: "Failed to fetch likes" }, { status: 500 })
  }
}

// POST /api/likes/[imdbId]
// Likes a title (inserts a row). Requires authentication via the access-token
// cookie. The user_id is taken from the session.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  try {
    const supabase = createAdminClient()
    const store = await cookies()
    const accessToken = store.get("sb-access-token")?.value
    if (!accessToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    let body: any = {}
    try { body = await req.json() } catch {}
    const { error } = await supabase.from("likes").upsert({
      user_id: user.id,
      imdb_id: imdbId,
      title: body.title ?? null,
      type: body.type ?? null,
      poster: body.poster ?? null,
    }, { onConflict: "user_id,imdb_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("imdb_id", imdbId)
    return NextResponse.json({ count: count ?? 0, hasLiked: true })
  } catch (e) {
    console.error("[api/likes POST]", e)
    return NextResponse.json({ error: "Failed to like title" }, { status: 500 })
  }
}

// DELETE /api/likes/[imdbId]
// Unlikes a title (deletes the row). Requires authentication.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> }
) {
  const { imdbId } = await params
  if (!imdbId) return NextResponse.json({ error: "imdbId required" }, { status: 400 })
  try {
    const supabase = createAdminClient()
    const store = await cookies()
    const accessToken = store.get("sb-access-token")?.value
    if (!accessToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("imdb_id", imdbId)
      .eq("user_id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("imdb_id", imdbId)
    return NextResponse.json({ count: count ?? 0, hasLiked: false })
  } catch (e) {
    console.error("[api/likes DELETE]", e)
    return NextResponse.json({ error: "Failed to unlike title" }, { status: 500 })
  }
}
