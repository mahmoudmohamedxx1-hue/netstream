import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// GET /api/auth/session
// Returns the current user based on the access-token cookie. Uses the admin
// client to verify the JWT (the admin client can call auth.getUser with any
// valid token). Returns { user: null } if not signed in.
export async function GET() {
  const store = await cookies()
  const accessToken = store.get("sb-access-token")?.value
  if (!accessToken) return NextResponse.json({ user: null })
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) {
      // Token expired or invalid — clear it.
      const s = await cookies()
      s.delete("sb-access-token")
      s.delete("sb-refresh-token")
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({ user: data.user })
  } catch {
    return NextResponse.json({ user: null })
  }
}
