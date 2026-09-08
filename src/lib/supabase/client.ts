"use client"

import { createBrowserClient } from "@supabase/ssr"

// Browser-side Supabase client. Uses the PUBLIC anon key + URL (both are
// safe to expose — the anon key is designed to be public and is protected
// by Row-Level Security policies on the database). This client powers all
// client-side auth (sign-in, sign-up, OTP verification, session refresh).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
