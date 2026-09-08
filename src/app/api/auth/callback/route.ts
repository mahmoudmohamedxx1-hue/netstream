import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

// GET /api/auth/callback?code=...
// OAuth redirect handler. Exchanges the code for a session, then stores the
// tokens in HTTP-only cookies and redirects to the home page.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  if (!code) return NextResponse.redirect(new URL("/?auth=error", req.url))
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      return NextResponse.redirect(new URL("/?auth=error", req.url))
    }
    const store = await cookies()
    store.set("sb-access-token", data.session.access_token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: data.session.expires_in,
    })
    store.set("sb-refresh-token", data.session.refresh_token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 60 * 60 * 24 * 7,
    })
    return NextResponse.redirect(new URL("/?auth=success", req.url))
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", req.url))
  }
}
