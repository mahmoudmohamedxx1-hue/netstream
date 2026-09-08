"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Mail, Phone, Loader2, Check } from "lucide-react"
import { useAuth } from "@/lib/supabase/auth-context"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup"
type Method = "email" | "phone"

type Props = {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: Props) {
  const { user, signOut } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [method, setMethod] = useState<Method>("email")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  // Refresh the session after a successful sign-in/sign-up so the UI updates
  // (the auth context reads from /api/auth/session which reads the cookie).
  const refreshSession = useCallback(async () => {
    // The auth context polls /api/auth/session on mount; a full page reload
    // is the most reliable way to pick up the new cookie-set session.
    window.location.reload()
  }, [])

  // Reset all state when the modal closes.
  useEffect(() => {
    if (!open) {
      setIdentifier("")
      setPassword("")
      setOtp("")
      setError(null)
      setOtpSent(false)
      setSuccess(null)
      setLoading(false)
    }
  }, [open])

  // ── Email sign-up (via server route) ────────────────────────────────────
  // The server route uses admin.createUser with email_confirm: true, so the
  // user is created + signed in immediately — NO verification email is sent
  // (avoids the "email rate limit exceeded" error).
  const handleEmailSignUp = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Sign-up failed")
      // Sign-up now returns a session immediately — reload to pick it up.
      await refreshSession()
      onClose()
    } catch (e: any) {
      setError(e.message ?? "Sign-up failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Email sign-in (via server route) ────────────────────────────────────
  const handleEmailSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed")
      await refreshSession()
      onClose()
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Phone OTP — still uses the browser client because it needs realtime
  //     SMS delivery which is a client-side flow. Phone auth is optional and
  //     disabled by default; if enabled, the anon key must be set. ──────────
  const handlePhoneSendOtp = async () => {
    setError(null)
    setLoading(true)
    try {
      const phone = normalizePhone(identifier)
      const res = await fetch("/api/auth/phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, action: "send" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send code")
      setOtpSent(true)
      setSuccess("Verification code sent to your phone.")
    } catch (e: any) {
      setError(e.message ?? "Failed to send code")
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneVerifyOtp = async () => {
    setError(null)
    setLoading(true)
    try {
      const phone = normalizePhone(identifier)
      const res = await fetch("/api/auth/phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, token: otp, action: "verify" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Verification failed")
      await refreshSession()
      onClose()
    } catch (e: any) {
      setError(e.message ?? "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Email magic link (via server route) ─────────────────────────────────
  const handleEmailMagicLink = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send link")
      setSuccess("Check your email for a magic sign-in link.")
    } catch (e: any) {
      setError(e.message ?? "Failed to send link")
    } finally {
      setLoading(false)
    }
  }

  // ── OAuth (Google / Apple) — redirect to the server route ───────────────
  const handleOAuth = (provider: "google" | "apple") => {
    window.location.href = `/api/auth/oauth?provider=${provider}`
  }

  // If the user is already signed in, show their account + sign-out button.
  if (open && user) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-[#181818] p-8 ring-1 ring-white/10"
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Account</h2>
              <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-white/60">Signed in as</p>
              <p className="text-lg font-semibold text-white">{user.email ?? user.phone ?? "User"}</p>
              <button
                onClick={async () => { await signOut(); onClose() }}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
              >
                Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-[#181818] p-8 ring-1 ring-white/10"
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {mode === "signin" ? "Sign In" : "Create Account"}
              </h2>
              <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            {/* OAuth — Google + Apple (one-tap sign-in) */}
            <div className="mb-5 space-y-2">
              <button
                onClick={() => handleOAuth("google")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
              <button
                onClick={() => handleOAuth("apple")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-lg bg-black px-4 py-3 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-black/80 disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                Continue with Apple
              </button>
            </div>

            {/* Divider */}
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/40">OR</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Method toggle (Email / Phone) */}
            <div className="mb-5 flex gap-2 rounded-lg bg-black/40 p-1">
              <button
                onClick={() => { setMethod("email"); setOtpSent(false); setError(null); setSuccess(null) }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition",
                  method === "email" ? "bg-white text-black" : "text-white/60 hover:text-white"
                )}
              >
                <Mail className="h-4 w-4" /> Email
              </button>
              <button
                onClick={() => { setMethod("phone"); setOtpSent(false); setError(null); setSuccess(null) }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition",
                  method === "phone" ? "bg-white text-black" : "text-white/60 hover:text-white"
                )}
              >
                <Phone className="h-4 w-4" /> Phone
              </button>
            </div>

            {/* ── Email flow ── */}
            {method === "email" && (
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                />
                {mode === "signin" ? (
                  <>
                    <button
                      onClick={handleEmailSignIn}
                      disabled={loading || !identifier || !password}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Sign In
                    </button>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-white/40">OR</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <button
                      onClick={handleEmailMagicLink}
                      disabled={loading || !identifier}
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Send magic link (passwordless)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEmailSignUp}
                    disabled={loading || !identifier || !password}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Account
                  </button>
                )}
              </div>
            )}

            {/* ── Phone flow (OTP) ── */}
            {method === "phone" && (
              <div className="space-y-3">
                <input
                  type="tel"
                  placeholder="+1234567890 (with country code)"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={otpSent}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-white placeholder:text-white/30 focus:border-primary focus:outline-none disabled:opacity-50"
                />
                {!otpSent ? (
                  <button
                    onClick={handlePhoneSendOtp}
                    disabled={loading || !identifier}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send verification code
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-center text-lg tracking-[0.5em] text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={handlePhoneVerifyOtp}
                      disabled={loading || otp.length < 6}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Verify & Sign In
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Error / success messages */}
            {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
            {success && <p className="mt-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</p>}

            {/* Toggle sign-in / sign-up */}
            <p className="mt-6 text-center text-sm text-white/50">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); setOtpSent(false) }}
                className="font-semibold text-primary hover:underline"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Ensure the phone number is in E.164 format (starts with `+`).
function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith("+")) return trimmed
  return `+${trimmed}`
}
