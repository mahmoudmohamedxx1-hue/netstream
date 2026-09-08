import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/auth/magic-link
// Body: { email }
// Sends a magic sign-in link to the email. After the user clicks it, they're
// redirected to /api/auth/callback which sets the session cookies.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${req.nextUrl.origin}/api/auth/callback` },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Magic link failed" }, { status: 500 })
  }
}
