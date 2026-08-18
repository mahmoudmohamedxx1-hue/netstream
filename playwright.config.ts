import { defineConfig, devices } from "@playwright/test"

// ═══════════════════════════════════════════════════════════════════════════
// Playwright Configuration — Mobile E2E Test Suite for NetStream
//
// Targets two standard mobile viewports:
//   • iPhone 14/15 Pro  (390 × 844, iOS Safari, deviceScaleRatio 3)
//   • Pixel 7           (412 × 915, Android Chrome, deviceScaleRatio 2.625)
//
// Both projects enable touch events, mobile user agents, and proper DPRs.
// Tests run headless by default; use --headed for visual debugging.
// ═══════════════════════════════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || "http://localhost:3000"

export default defineConfig({
  // Test directory
  testDir: "./tests/e2e",

  // Test files match pattern
  testMatch: "**/*.spec.ts",

  // Timeout per test (30s — generous for network calls to TMDB)
  timeout: 30_000,

  // Expect timeout for assertions (5s)
  expect: { timeout: 5_000 },

  // Parallel test execution (speeds up CI)
  fullyParallel: false, // Sequential — dev server can't handle parallel

  // Fail fast on first error
  forbidOnly: !!process.env.CI,

  // Retries in CI (1 retry, 0 locally)
  retries: process.env.CI ? 1 : 0,

  // Workers (1 — dev server is single-threaded)
  workers: 1,

  // Reporter — HTML for visual reports, list for console
  reporter: [
    ["html", { outputFolder: "tests/reports/html", open: "never" }],
    ["list"],
  ],

  // Global setup — start dev server if not already running
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        cwd: __dirname,
      },

  // Shared settings for all projects
  use: {
    baseURL: BASE_URL,
    // Screenshot on failure
    screenshot: "only-on-failure",
    // Video on failure
    video: "retain-on-failure",
    // Trace on first retry
    trace: "on-first-retry",
    // Accept downloads
    acceptDownloads: true,
    // Ignore HTTPS errors (dev server)
    ignoreHTTPSErrors: true,
  },

  // ── Mobile Projects ──────────────────────────────────────────────────────
  projects: [
    // iPhone 14/15 Pro — iOS Safari
    {
      name: "iPhone 14 Pro",
      use: {
        ...devices["iPhone 14 Pro"],
        // Ensure touch is enabled (it is by default for iPhone profile)
        hasTouch: true,
        // Override viewport if needed (iPhone 14 Pro is 393×852 natively,
        // but we standardize to 390×844 for consistency with design specs)
        viewport: { width: 390, height: 844 },
      },
      // Only run tests tagged with @mobile or @ios
      grep: /@mobile|@ios/,
    },

    // Pixel 7 — Android Chrome
    {
      name: "Pixel 7",
      use: {
        ...devices["Pixel 7"],
        hasTouch: true,
        viewport: { width: 412, height: 915 },
      },
      grep: /@mobile|@android/,
    },

    // Desktop (for comparison tests — not the main focus)
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: false,
        viewport: { width: 1280, height: 800 },
      },
      grep: /@desktop/,
    },
  ],
})
