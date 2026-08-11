"use client"

// Language context provider — wraps the entire app so every component can
// call `t("key")` to get the localized string. Also flips <html dir> to "rtl"
// when Arabic is active.
//
// Usage:
//   import { LanguageProvider, useLang } from "@/lib/lang-context"
//   <LanguageProvider> <App /> </LanguageProvider>
//   const { t, lang, toggle, isArabic } = useLang()

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useLanguage, type Lang } from "@/hooks/use-language"

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
  isArabic: boolean
  t: (key: string) => string
}

const LanguageContext = createContext<Ctx | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { lang, setLang, toggle, t, isArabic } = useLanguage()
  const value = useMemo(
    () => ({ lang, setLang, toggle, isArabic, t }),
    [lang, setLang, toggle, t, isArabic]
  )
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    // Fallback for components rendered outside the provider (shouldn't happen
    // in practice — the provider wraps the whole app in layout.tsx).
    return {
      lang: "en",
      setLang: () => {},
      toggle: () => {},
      isArabic: false,
      t: (k: string) => k,
    }
  }
  return ctx
}
