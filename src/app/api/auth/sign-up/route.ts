import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// POST /api/auth/sign-up
// Body: { email, password }
// Creates a new user via the admin API with email_confirm: true — this
// BYPASSES the normal sign-up email-sending flow (which hits Supabase's
// email rate limit after a few sign-ups). After creating the user, we
// immediately sign them in with signInWithPassword to get a session and
// store it in HTTP-only cookies.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })
  }
  try {
    const supabase = createAdminClient()
    // Use admin.createUser with email_confirm: true so NO verification email
    // is sent (avoids the "email rate limit exceeded" error).
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) {
      // If the user already exists, fall through to sign-in instead.
      if (!createError.message.includes("already") && !createError.message.includes("registered")) {
        return NextResponse.json({ error: createError.message }, { status: 400 })
      }
    }
    // Immediately sign in the user to get a session (no email verification needed).
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email, password,
    })
    if (signInError) return NextResponse.json({ error: signInError.message }, { status: 400 })
    // Store the session in HTTP-only cookies.
    if (signInData.session) {
      const store = await cookies()
      store.set("sb-access-token", signInData.session.access_token, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: signInData.session.expires_in,
      })
      store.set("sb-refresh-token", signInData.session.refresh_token, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 7,
      })
    }
    return NextResponse.json({ user: signInData.user, session: "created" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Sign-up failed" }, { status: 500 })
  }
}
