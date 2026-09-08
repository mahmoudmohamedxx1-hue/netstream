import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET /api/auth/oauth?provider=google|apple
// Initiates OAuth sign-in by getting the provider URL from Supabase, then
// redirects the browser to it. After the user authorizes, Supabase redirects
// back to /api/auth/callback (which sets the session cookies).
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider")
  if (provider !== "google" && provider !== "apple") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${req.nextUrl.origin}/api/auth/callback`,
      },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.redirect(data.url)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "OAuth failed" }, { status: 500 })
  }
}
