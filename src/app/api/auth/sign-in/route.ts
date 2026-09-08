import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// POST /api/auth/sign-in
// Body: { email, password }
// Signs in with email + password. Stores the session tokens in HTTP-only
// cookies so the browser never sees the secret key.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })
  }
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (data.session) {
      const store = await cookies()
      store.set("sb-access-token", data.session.access_token, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: data.session.expires_in,
      })
      store.set("sb-refresh-token", data.session.refresh_token, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 7,
      })
    }
    return NextResponse.json({ user: data.user })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Sign-in failed" }, { status: 500 })
  }
}
