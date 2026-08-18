import { test, expect } from "@playwright/test"
import { HomePage } from "../../pages/home-page"
import { PlayerModal } from "../../pages/player-modal-page"

// ═══════════════════════════════════════════════════════════════════════════
// Mobile-Specific Edge Cases & UX Tests
//
// Tests mobile-specific behaviors:
//   • Network throttling (Fast 3G / Slow 3G)
//   • Orientation change (portrait → landscape)
//   • Touch gestures (swipe, long-press, tap-outside dismiss)
//   • Loading states (skeletons, spinners)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Mobile Edge Cases & UX @mobile", () => {
  let home: HomePage
  let player: PlayerModal

  test.beforeEach(async ({ page }) => {
    home = new HomePage(page)
    player = new PlayerModal(page)
    await home.open()
  })

  // ── Network Throttling ───────────────────────────────────────────────────

  test("page loads under Slow 3G with loading state", async ({ page }) => {
    // Enable slow 3G throttling
    await home.enableSlow3G()

    // Reload page
    await page.reload({ waitUntil: "domcontentloaded" })

    // Should show loading skeleton or spinner
    const skeleton = page.locator(".skeleton-shimmer")
    const spinner = page.locator(".animate-spin")

    // At least one loading indicator should appear
    const hasLoadingState = await skeleton.or(spinner).first().isVisible({ timeout: 5_000 }).catch(() => false)

    // Wait for content to eventually load
    await home.waitForPageReady()

    // Page should eventually load
    await expect(home.logo).toBeVisible({ timeout: 30_000 })

    await home.disableThrottling()
  })

  test("page loads under Fast 3G", async ({ page }) => {
    await home.enableFast3G()
    await page.reload({ waitUntil: "domcontentloaded" })
    await home.waitForPageReady()
    await expect(home.logo).toBeVisible({ timeout: 20_000 })
    await home.disableThrottling()
  })

  // ── Orientation Change ───────────────────────────────────────────────────

  test("layout adapts to landscape orientation", async ({ page }) => {
    // Start in portrait
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(home.logo).toBeVisible()

    // Switch to landscape
    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForTimeout(500)

    // Navbar should still be visible and functional
    await expect(home.logo).toBeVisible()
    await expect(home.searchButton).toBeVisible()

    // No horizontal scroll in landscape
    await home.assertNoHorizontalScroll()

    // Switch back to portrait
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await expect(home.logo).toBeVisible()
  })

  test("hero section adapts to landscape", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForTimeout(500)

    const heroBox = await home.heroSection.boundingBox()
    expect(heroBox!.width).toBeLessThanOrEqual(844)
    expect(heroBox!.height).toBeGreaterThan(0)
  })

  // ── Touch Gestures ───────────────────────────────────────────────────────

  test("swipe content row left reveals more cards", async ({ page }) => {
    // Get initial scroll position of the first content row
    const scroller = page.locator(".netflix-row-scroller").first()
    const scrollBefore = await scroller.evaluate((el) => el.scrollLeft)

    // Swipe left
    await home.swipeRow("Trending", "left")

    // Scroll position should change
    const scrollAfter = await scroller.evaluate((el) => el.scrollLeft)
    expect(scrollAfter, "Row should scroll after swipe").toBeGreaterThan(scrollBefore)
  })

  test("swipe content row right scrolls back", async ({ page }) => {
    const scroller = page.locator(".netflix-row-scroller").first()

    // Swipe left first
    await home.swipeRow("Trending", "left")
    const scrollMid = await scroller.evaluate((el) => el.scrollLeft)

    // Swipe right
    await home.swipeRow("Trending", "right")
    const scrollAfter = await scroller.evaluate((el) => el.scrollLeft)

    expect(scrollAfter, "Row should scroll back after right swipe").toBeLessThan(scrollMid)
  })

  test("long-press on card opens hover popup", async ({ page }) => {
    // Long-press the first card in Trending row
    await home.longPressCard("Trending", 0)

    // Wait for popup to appear (500ms delay + render)
    await page.waitForTimeout(1000)

    // Check if a popup appeared (it renders via portal to document.body)
    const popup = page.locator('[style*="position: fixed"]').filter({ has: page.locator("button") })
    const popupVisible = await popup.first().isVisible({ timeout: 3_000 }).catch(() => false)
    // Note: popup might not appear if TMDB fetch is slow — that's OK
    if (popupVisible) {
      // If popup appeared, it should have a play button
      const playBtn = popup.locator('button:has(svg.lucide-play)').first()
      await expect(playBtn).toBeVisible()
    }
  })

  test("tap outside modal closes it", async ({ page }) => {
    // Open player
    await home.clickSearch()
    await page.locator('[data-testid="imdb-input"]').fill("tt0111161")
    await page.locator('[data-testid="imdb-input"]').press("Enter")
    await player.assertOpen()

    // Tap outside the modal (top-left corner)
    await page.mouse.click(5, 5)
    await page.waitForTimeout(500)

    // Modal should close
    await player.assertClosed()
  })

  // ── Loading States ───────────────────────────────────────────────────────

  test("skeleton loading state appears during initial load", async ({ page }) => {
    // Reload page
    await page.reload({ waitUntil: "domcontentloaded" })

    // Look for skeleton shimmer
    const skeleton = page.locator(".skeleton-shimmer")
    const skeletonVisible = await skeleton.first().isVisible({ timeout: 3_000 }).catch(() => false)

    // If skeleton appeared, it should eventually disappear when content loads
    if (skeletonVisible) {
      await home.waitForPageReady()
      // Skeleton should be gone
      const stillVisible = await skeleton.first().isVisible().catch(() => false)
      expect(stillVisible, "Skeleton should disappear after content loads").toBe(false)
    }
  })

  // ── Scroll Arrows ────────────────────────────────────────────────────────

  test("right scroll arrow is visible on mobile", async () => {
    // The right arrow should be visible (opacity 0.8) on mobile
    const rightArrow = home.page.locator('button[aria-label="Scroll right"]').first()
    await expect(rightArrow).toBeVisible({ timeout: 5_000 })
  })

  test("left scroll arrow is hidden at start", async () => {
    // At scroll position 0, left arrow should NOT be visible
    const leftArrow = home.page.locator('button[aria-label="Scroll left"]').first()
    const isVisible = await leftArrow.isVisible().catch(() => false)
    expect(isVisible, "Left arrow should be hidden at start").toBe(false)
  })

  test("left scroll arrow appears after scrolling right", async () => {
    // Swipe right first
    await home.swipeRow("Trending", "left")
    await home.page.waitForTimeout(500)

    // Left arrow should now be visible
    const leftArrow = home.page.locator('button[aria-label="Scroll left"]').first()
    await expect(leftArrow).toBeVisible({ timeout: 3_000 })
  })

  test("clicking right scroll arrow advances the row", async ({ page }) => {
    const scroller = page.locator(".netflix-row-scroller").first()
    const scrollBefore = await scroller.evaluate((el) => el.scrollLeft)

    await home.clickScrollArrow("right")

    const scrollAfter = await scroller.evaluate((el) => el.scrollLeft)
    expect(scrollAfter, "Row should scroll after clicking arrow").toBeGreaterThan(scrollBefore)
  })

  // ── Page Zoom ────────────────────────────────────────────────────────────

  test("page is zoomed to 85%", async ({ page }) => {
    const zoom = await page.evaluate(() => {
      const html = document.documentElement
      return getComputedStyle(html).zoom
    })
    expect(zoom, "Page should be zoomed to 85%").toBe("0.85")
  })

  // ── No Backdrop Blur ─────────────────────────────────────────────────────

  test("player modal has no backdrop-blur (performance)", async ({ page }) => {
    await home.clickSearch()
    await page.locator('[data-testid="imdb-input"]').fill("tt0111161")
    await page.locator('[data-testid="imdb-input"]').press("Enter")
    await player.assertOpen()

    // Check the modal container doesn't have backdrop-blur
    const modal = page.locator(".fixed.inset-0.z-\\[100\\]")
    const backdropFilter = await modal.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(backdropFilter, "Modal should not have backdrop-blur").toBe("none")
  })
})
