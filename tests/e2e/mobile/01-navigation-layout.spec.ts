import { test, expect } from "@playwright/test"
import { HomePage } from "../../pages/home-page"

// ═══════════════════════════════════════════════════════════════════════════
// Mobile Navigation & Layout Tests
//
// Verifies that the mobile navbar, hero, content rows, footer, and backup
// sites render correctly on mobile viewports. Checks for horizontal scroll,
// tap target sizes, and thumb-zone accessibility.
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Mobile Navigation & Layout @mobile", () => {
  let home: HomePage

  test.beforeEach(async ({ page }) => {
    home = new HomePage(page)
    await home.open()
  })

  // ── Navbar ───────────────────────────────────────────────────────────────

  test("navbar is visible and fixed at top", async ({ page }) => {
    const nav = page.locator("nav")
    await expect(nav).toBeVisible()
    // Check it's fixed (position: fixed)
    const position = await nav.evaluate((el) => getComputedStyle(el.parentElement!).position)
    expect(position).toBe("fixed")
  })

  test("logo is visible and not cropped", async ({ page }) => {
    await expect(home.logo).toBeVisible()
    const box = await home.logo.boundingBox()
    expect(box, "Logo should have dimensions").not.toBeNull()
    // Logo should be at least 100px wide (not cropped)
    expect(box!.width).toBeGreaterThanOrEqual(100)
  })

  test("search button is visible and within viewport", async ({ page }) => {
    await expect(home.searchButton).toBeVisible()
    const box = await home.searchButton.boundingBox()
    expect(box, "Search button should have dimensions").not.toBeNull()
    // Search button should be within the viewport (not pushed off-screen)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test("language toggle is visible and within viewport", async ({ page }) => {
    await expect(home.languageToggle).toBeVisible()
    const box = await home.languageToggle.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test("search button meets minimum tap target size", async () => {
    await home.assertTapTargetSize(home.searchButton, 36) // 36px on mobile (h-9)
  })

  test("language toggle meets minimum tap target size", async () => {
    await home.assertTapTargetSize(home.languageToggle, 36)
  })

  // ── No Horizontal Scroll ─────────────────────────────────────────────────

  test("no horizontal scrollbar on home page", async () => {
    await home.assertNoHorizontalScroll()
  })

  test("no horizontal scrollbar after scrolling down", async () => {
    await home.scrollDown(1000)
    await home.assertNoHorizontalScroll()
  })

  test("no horizontal scrollbar at bottom of page", async () => {
    await home.scrollToBottom()
    await home.assertNoHorizontalScroll()
  })

  // ── Hero Section ─────────────────────────────────────────────────────────

  test("hero section is visible and fills viewport width", async ({ page }) => {
    await expect(home.heroSection).toBeVisible()
    const box = await home.heroSection.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test("page loads at the top (scrollY = 0)", async () => {
    await home.assertScrollAtTop()
  })

  test("hero play button is visible and tappable", async () => {
    await expect(home.heroPlayButton).toBeVisible({ timeout: 10_000 })
    await home.assertTapTargetSize(home.heroPlayButton, 44)
  })

  // ── Content Rows ─────────────────────────────────────────────────────────

  test("content rows are rendered with cards", async () => {
    await home.assertContentRowsVisible()
  })

  test("content row cards are within viewport width", async ({ page }) => {
    const firstCard = home.cards.first()
    await expect(firstCard).toBeVisible()
    const box = await firstCard.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 50) // +50 for peek
  })

  test("scroll arrows are semi-opaque on mobile", async () => {
    // Scroll right first to make the left arrow appear
    await home.swipeRow("Trending", "right")
    const rightArrow = home.page.locator('button[aria-label="Scroll right"]').first()
    if (await rightArrow.isVisible()) {
      const opacity = await rightArrow.evaluate((el) => getComputedStyle(el).opacity)
      expect(parseFloat(opacity)).toBeGreaterThan(0.5) // Should be 0.8 on mobile
    }
  })

  // ── Backup Sites ─────────────────────────────────────────────────────────

  test("backup sites section is at the bottom", async () => {
    await home.scrollToBackupSites()
    await expect(home.backupSitesSection).toBeVisible()
  })

  test("backup site links open in new tabs", async () => {
    await home.scrollToBackupSites()
    await home.assertBackupSitesPresent()
  })

  test("backup site links meet tap target size", async () => {
    await home.scrollToBackupSites()
    const firstLink = home.backupSiteLinks.first()
    await home.assertTapTargetSize(firstLink, 44)
  })

  // ── Footer ───────────────────────────────────────────────────────────────

  test("footer is visible at the bottom of the page", async () => {
    await home.scrollToFooter()
    await expect(home.footer).toBeVisible()
  })

  test("footer social links meet tap target size", async () => {
    await home.scrollToFooter()
    const socialLink = home.footer.locator("a[aria-label]").first()
    await home.assertTapTargetSize(socialLink, 44)
  })

  // ── Navigation Between Sections ──────────────────────────────────────────

  test("navigate to Movies section", async ({ page }) => {
    await home.navigateTo("movies")
    // Should show browse grid, not home rows
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({ timeout: 5_000 })
  })

  test("navigate to Series section", async ({ page }) => {
    await home.navigateTo("series")
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({ timeout: 5_000 })
  })

  test("navigate to My List section", async ({ page }) => {
    await home.navigateTo("mylist")
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({ timeout: 5_000 })
  })

  test("navigate back to Home from Movies", async () => {
    await home.navigateTo("movies")
    await home.page.waitForTimeout(1000)
    await home.navigateTo("home")
    await home.page.waitForTimeout(1000)
    await home.assertLoaded()
  })

  // ── Language Toggle ──────────────────────────────────────────────────────

  test("language toggle switches to Arabic (RTL)", async ({ page }) => {
    await home.toggleLanguage()
    const dir = await page.evaluate(() => document.documentElement.dir)
    expect(dir).toBe("rtl")
  })

  test("language toggle switches back to English (LTR)", async ({ page }) => {
    await home.toggleLanguage() // → Arabic
    await home.toggleLanguage() // → English
    const dir = await page.evaluate(() => document.documentElement.dir)
    expect(dir).toBe("ltr")
  })
})
