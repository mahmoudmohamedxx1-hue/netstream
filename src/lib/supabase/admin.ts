import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Admin Supabase client using the SERVICE ROLE key. This bypasses RLS and
// must ONLY be used in server-side route handlers / server actions where
// you need privileged access (e.g. looking up a user by ID for aggregating
// likes). NEVER import this in a client component — the service role key
// must never reach the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
