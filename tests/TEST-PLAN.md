# NetStream — Mobile E2E Test Plan

> **Framework:** Playwright + TypeScript
> **Target Devices:** iPhone 14 Pro (390×844), Pixel 7 (412×915)
> **Pattern:** Page Object Model (POM)

---

## Test Plan Breakdown

### 1. Navigation & Mobile Layout (`01-navigation-layout.spec.ts`)

| # | Test Case | Assertions |
|---|-----------|------------|
| 1 | Navbar is visible and fixed at top | `position: fixed`, visible |
| 2 | Logo is visible and not cropped | width ≥ 100px |
| 3 | Search button visible and within viewport | x + width ≤ viewport width |
| 4 | Language toggle visible and within viewport | x + width ≤ viewport width |
| 5 | Search button meets tap target size | width ≥ 36px, height ≥ 36px |
| 6 | Language toggle meets tap target size | width ≥ 36px, height ≥ 36px |
| 7 | No horizontal scrollbar on home page | scrollWidth ≤ innerWidth |
| 8 | No horizontal scrollbar after scrolling down | scrollWidth ≤ innerWidth |
| 9 | No horizontal scrollbar at bottom of page | scrollWidth ≤ innerWidth |
| 10 | Hero section fills viewport width | width ≤ viewport width |
| 11 | Page loads at the top (scrollY = 0) | scrollY === 0 |
| 12 | Hero play button is visible and tappable | visible, ≥ 44px |
| 13 | Content rows are rendered with cards | rows > 2 |
| 14 | Cards are within viewport width | x ≥ 0, x + width ≤ viewport + 50px |
| 15 | Scroll arrows are semi-opaque on mobile | opacity > 0.5 |
| 16 | Backup sites section at bottom | visible after scroll |
| 17 | Backup site links open in new tabs | target=_blank, rel=noopener |
| 18 | Backup site links meet tap target size | ≥ 44px |
| 19 | Footer is visible at bottom | visible after scroll |
| 20 | Footer social links meet tap target size | ≥ 44px |
| 21 | Navigate to Movies section | heading visible |
| 22 | Navigate to Series section | heading visible |
| 23 | Navigate to My List section | heading visible |
| 24 | Navigate back to Home from Movies | navbar + hero visible |
| 25 | Language toggle switches to Arabic (RTL) | dir=rtl |
| 26 | Language toggle switches back to English | dir=ltr |

### 2. User Journey & Critical Paths (`02-user-journey.spec.ts`)

| # | Test Case | Assertions |
|---|-----------|------------|
| 1 | Search for a title and play it | results visible, player/detail opens |
| 2 | Search shows trending when empty | trending grid visible |
| 3 | Close search with close button | search input not visible |
| 4 | Close search with Escape key | search input not visible |
| 5 | Play by IMDB ID (tt0111161) | player modal open |
| 6 | Click a card opens player or detail | player or detail visible |
| 7 | Player modal has close, fullscreen, reload | all buttons visible |
| 8 | Player modal can be closed | close button not visible |
| 9 | Server dropdown shows multiple options | options > 3 |
| 10 | Server dropdown has favorite star buttons | stars > 0 |
| 11 | Next server button switches provider | player still open |
| 12 | Series player shows episode grid | episode cards > 0 |
| 13 | IMDB input accepts text input | value matches |
| 14 | Search input has correct placeholder | contains "search" |

### 3. Mobile-Specific Edge Cases & UX (`03-edge-cases-ux.spec.ts`)

| # | Test Case | Assertions |
|---|-----------|------------|
| 1 | Page loads under Slow 3G with loading state | skeleton/spinner → content |
| 2 | Page loads under Fast 3G | logo visible |
| 3 | Layout adapts to landscape orientation | navbar visible, no h-scroll |
| 4 | Hero section adapts to landscape | width ≤ viewport |
| 5 | Swipe content row left reveals more cards | scrollLeft increases |
| 6 | Swipe content row right scrolls back | scrollLeft decreases |
| 7 | Long-press on card opens hover popup | popup visible |
| 8 | Tap outside modal closes it | modal closed |
| 9 | Skeleton loading state during initial load | skeleton → content |
| 10 | Right scroll arrow visible on mobile | visible |
| 11 | Left scroll arrow hidden at start | not visible |
| 12 | Left scroll arrow appears after scrolling right | visible |
| 13 | Clicking right scroll arrow advances row | scrollLeft increases |
| 14 | Page is zoomed to 85% | zoom === 0.85 |
| 15 | Player modal has no backdrop-blur | backdropFilter === none |

---

## Test File Structure

```
tests/
├── pages/
│   ├── base-page.ts              # Shared utilities (scroll, swipe, throttle, assertions)
│   ├── home-page.ts              # HomePage POM (navbar, hero, rows, backup sites, footer)
│   ├── player-modal-page.ts      # PlayerModal POM (controls, dropdown, episodes)
│   └── search-overlay-page.ts    # SearchOverlay POM (input, results, IMDB quick-launch)
├── e2e/
│   └── mobile/
│       ├── 01-navigation-layout.spec.ts   # 26 tests — nav, layout, scroll, tap targets
│       ├── 02-user-journey.spec.ts        # 14 tests — search, play, episodes, IMDB
│       └── 03-edge-cases-ux.spec.ts       # 15 tests — throttling, orientation, gestures
├── reports/                      # HTML test reports (auto-generated)
└── screenshots/                  # Failure screenshots (auto-generated)
```

---

## Execution Commands

```bash
# ── Install dependencies ──────────────────────────────────────
bun add -d @playwright/test
bunx playwright install chromium

# ── Run all mobile tests (both devices) ───────────────────────
bunx playwright test

# ── Run only iPhone tests ─────────────────────────────────────
bunx playwright test --project="iPhone 14 Pro"

# ── Run only Pixel 7 tests ────────────────────────────────────
bunx playwright test --project="Pixel 7"

# ── Run specific test file ────────────────────────────────────
bunx playwright tests/e2e/mobile/01-navigation-layout.spec.ts

# ── Run with a specific grep filter ───────────────────────────
bunx playwright test -g "no horizontal scrollbar"

# ── Run in headed mode (see the browser) ──────────────────────
bunx playwright test --headed

# ── Run with debug mode (Playwright Inspector) ────────────────
bunx playwright test --debug

# ── Generate HTML report ──────────────────────────────────────
bunx playwright test --reporter=html
bunx playwright show-report tests/reports/html

# ── Run with a specific base URL (e.g. production) ────────────
BASE_URL=https://netstream.space-z.ai bunx playwright test

# ── Skip webServer startup (use already-running server) ───────
SKIP_WEBSERVER=1 bunx playwright test

# ── Run tests sequentially (no parallelism) ───────────────────
bunx playwright test --workers=1

# ── Retry failed tests once ───────────────────────────────────
bunx playwright test --retries=1

# ── List all tests without running ────────────────────────────
bunx playwright test --list
```

---

## Key Design Decisions

1. **Page Object Model** — Each page (Home, Player, Search) has its own class with locators and actions. Tests reference POMs, not raw selectors.

2. **Dynamic waits** — Uses `toBeVisible({ timeout })` and `waitForLoadState("networkidle")` instead of hardcoded `setTimeout`.

3. **Touch simulation** — `swipeHorizontal()`, `longPress()`, and `tapOutside()` helpers simulate real touch gestures.

4. **Network throttling** — `enableSlow3G()` / `enableFast3G()` add artificial delays via route interception.

5. **Viewport assertions** — `assertNoHorizontalScroll()`, `assertTapTargetSize()`, and `assertInThumbZone()` verify mobile-specific layout requirements.

6. **Device projects** — Two Playwright projects (iPhone 14 Pro, Pixel 7) with proper DPRs, touch events, and mobile user agents.

7. **No parallelism** — `workers: 1` because the dev server is single-threaded. In CI with a proper server, set `fullyParallel: true`.

8. **Failure artifacts** — Screenshots, video, and traces are captured on failure for debugging.
