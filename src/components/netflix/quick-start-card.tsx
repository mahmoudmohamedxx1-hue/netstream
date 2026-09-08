"use client"

import * as React from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

/* ──────────────────────────────────────────────────────────────────────────
   QuickStartCard — a 3-step onboarding card inspired by Vercel Analytics docs.

   • Three vertical columns with numbered circles (①②③)
   • Step 1: package manager tabs (npm / yarn / pnpm) + copy button
   • Step 2: syntax-highlighted code + docs link
   • Step 3: body text paragraphs
   • Pure black backgrounds, white text, blue links, thin vertical dividers
   • Responsive: stacks to single column on mobile, 3 columns on desktop
   ────────────────────────────────────────────────────────────────────────── */

type PackageManager = "npm" | "yarn" | "pnpm"

const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: "npm i @vercel/analytics",
  yarn: "yarn add @vercel/analytics",
  pnpm: "pnpm add @vercel/analytics",
}

/* ── Tiny syntax highlighter for the step 2 code block ────────────────────── */
function HighlightedCode({ code }: { code: string }) {
  // Tokenize: keywords (import/from), identifiers, punctuation, strings
  // Color scheme matches the screenshot: pink keywords, green strings, white text
  const tokens = React.useMemo(() => {
    const parts: { text: string; cls: string }[] = []
    const regex = /(\bimport\b|\bfrom\b)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([{}();,])|(\s+)|([A-Za-z_$][A-Za-z0-9_$]*)|(.)/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(code)) !== null) {
      if (m[1]) parts.push({ text: m[1], cls: "text-[#ff6b9d]" }) // keywords pink
      else if (m[2]) parts.push({ text: m[2], cls: "text-[#7ee787]" }) // strings green
      else if (m[3]) parts.push({ text: m[3], cls: "text-white/60" }) // punctuation
      else if (m[4]) parts.push({ text: m[4], cls: "" }) // whitespace
      else if (m[5]) parts.push({ text: m[5], cls: "text-white" }) // identifiers
      else if (m[6]) parts.push({ text: m[6], cls: "text-white/80" })
    }
    return parts
  }, [code])

  return (
    <code className="font-mono text-[13px] leading-relaxed">
      {tokens.map((t, i) => (
        <span key={i} className={t.cls}>{t.text}</span>
      ))}
    </code>
  )
}

/* ── Copy button ─────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy to clipboard"
      className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
    >
      {copied ? <Check className="size-3.5 text-[#7ee787]" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/* ── Numbered circle (①②③) ──────────────────────────────────────────────── */
function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-white"
    >
      {n}
    </span>
  )
}

export function QuickStartCard({ className }: { className?: string }) {
  const [pkg, setPkg] = React.useState<PackageManager>("npm")

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-white/10 bg-black",
        className
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-3">
        {/* ── Step 1: Install our package ────────────────────────────────── */}
        <section className="flex flex-col gap-5 p-8 md:border-r md:border-white/10">
          <div className="flex items-center gap-3">
            <StepNumber n={1} />
            <h3 className="text-base font-semibold text-white">Install our package</h3>
          </div>
          <p className="text-sm leading-relaxed text-white/60">
            Start by installing <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white/90">@vercel/analytics</code> in your existing project.
          </p>

          {/* Package manager tabs */}
          <div className="inline-flex w-fit items-center gap-1 rounded-md bg-white/5 p-1">
            {(["npm", "yarn", "pnpm"] as PackageManager[]).map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setPkg(pm)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  pkg === pm
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/80"
                )}
              >
                {pm}
              </button>
            ))}
          </div>

          {/* Code block */}
          <div className="relative mt-auto rounded-lg border border-white/10 bg-[#0a0a0a] py-4 pl-4 pr-12">
            <CopyButton text={INSTALL_COMMANDS[pkg]} />
            <code className="font-mono text-[13px] text-white/90">
              <span className="text-[#ff6b9d]">$</span>{" "}
              <span className="text-white">{INSTALL_COMMANDS[pkg]}</span>
            </code>
          </div>
        </section>

        {/* ── Step 2: Add the React component ─────────────────────────────── */}
        <section className="flex flex-col gap-5 p-8 md:border-r md:border-white/10">
          <div className="flex items-center gap-3">
            <StepNumber n={2} />
            <h3 className="text-base font-semibold text-white">Add the React component</h3>
          </div>
          <p className="text-sm leading-relaxed text-white/60">
            Import and use the{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white/90">&lt;Analytics/&gt;</code>{" "}
            React component into your app&apos;s layout.
          </p>

          {/* Code block with syntax highlighting */}
          <div className="relative mt-auto rounded-lg border border-white/10 bg-[#0a0a0a] py-4 pl-4 pr-12">
            <CopyButton text={'import { Analytics } from "@vercel/analytics/next"'} />
            <pre className="overflow-x-auto">
              <HighlightedCode code={'import { Analytics } from "@vercel/analytics/next"'} />
            </pre>
          </div>

          <p className="text-xs leading-relaxed text-white/40">
            For full examples and further reference, please refer to our{" "}
            <a
              href="https://vercel.com/docs/analytics"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#3b82f6] hover:text-[#60a5fa]"
            >
              documentation
              <ExternalLink className="size-3" />
            </a>
          </p>
        </section>

        {/* ── Step 3: Deploy & Visit your Site ─────────────────────────────── */}
        <section className="flex flex-col gap-5 p-8">
          <div className="flex items-center gap-3">
            <StepNumber n={3} />
            <h3 className="text-base font-semibold text-white">Deploy &amp; Visit your Site</h3>
          </div>
          <p className="text-sm leading-relaxed text-white/60">
            Deploy your changes and visit the deployment to collect your page views.
          </p>
          <p className="text-sm leading-relaxed text-white/60">
            If you don&apos;t see data after 30 seconds, please check for content blockers and try to navigate between pages on your site.
          </p>
        </section>
      </div>
    </div>
  )
}

export default QuickStartCard
