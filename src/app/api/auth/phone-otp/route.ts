import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// POST /api/auth/phone-otp
// Body: { phone, action: "send" | "verify", token? }
// send: sends an SMS OTP code to the phone number.
// verify: verifies the code and establishes a session (stored in cookies).
export async function POST(req: NextRequest) {
  const { phone, action, token } = await req.json().catch(() => ({}))
  if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 })
  try {
    const supabase = createAdminClient()
    if (action === "send") {
      const { error } = await supabase.auth.signInWithOtp({ phone })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    } else if (action === "verify") {
      if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 })
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" })
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
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Phone OTP failed" }, { status: 500 })
  }
}
