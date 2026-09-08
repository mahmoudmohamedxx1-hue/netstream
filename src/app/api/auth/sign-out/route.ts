import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// POST /api/auth/sign-out
// Clears the session cookies.
export async function POST() {
  const store = await cookies()
  store.delete("sb-access-token")
  store.delete("sb-refresh-token")
  return NextResponse.json({ success: true })
}
