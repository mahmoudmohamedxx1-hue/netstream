import { Page, Locator, expect } from "@playwright/test"

// ═══════════════════════════════════════════════════════════════════════════
// BasePage — shared utilities for all Page Objects
// ═══════════════════════════════════════════════════════════════════════════

export abstract class BasePage {
  constructor(public page: Page) {}

  // ── Navigation ───────────────────────────────────────────────────────────
  async goto(path: string = "/") {
    await this.page.goto(path, { waitUntil: "networkidle" })
  }

  async waitForPageReady() {
    // Wait for the main content to be visible (not the loading skeleton)
    await this.page.waitForSelector("nav", { state: "visible" })
    // Wait for network to settle (TMDB API calls)
    await this.page.waitForLoadState("networkidle")
  }

  // ── Viewport & Device Helpers ────────────────────────────────────────────
  get viewport() {
    return this.page.viewportSize()
  }

  get isMobile() {
    const w = this.viewport?.width ?? 0
    return w < 768
  }

  get isDesktop() {
    return !this.isMobile
  }

  // ── Scroll Helpers ───────────────────────────────────────────────────────
  async scrollDown(amount: number = 500) {
    await this.page.evaluate((y) => window.scrollBy(0, y), amount)
    await this.page.waitForTimeout(300) // Let content settle
  }

  async scrollUp(amount: number = 500) {
    await this.page.evaluate((y) => window.scrollBy(0, -y), amount)
    await this.page.waitForTimeout(300)
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo(0, 0))
    await this.page.waitForTimeout(300)
  }

  async scrollToBottom() {
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    )
    await this.page.waitForTimeout(300)
  }

  // ── Touch Gesture Helpers ────────────────────────────────────────────────
  /** Swipe horizontally on a scroller element (left or right) */
  async swipeHorizontal(
    locator: Locator | string,
    direction: "left" | "right",
    distance: number = 200
  ) {
    const el = typeof locator === "string" ? this.page.locator(locator).first() : locator
    const box = await el.boundingBox()
    if (!box) throw new Error("Element not found for swipe")

    const startX = direction === "left" ? box.x + box.width * 0.8 : box.x + box.width * 0.2
    const endX = direction === "left" ? startX - distance : startX + distance
    const midY = box.y + box.height / 2

    await this.page.touchscreen.tap(startX, midY) // Focus
    await this.page.mouse.move(startX, midY)
    await this.page.mouse.down()
    // Simulate swipe with intermediate points for smooth scrolling
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * i) / steps
      await this.page.mouse.move(x, midY)
      await this.page.waitForTimeout(20)
    }
    await this.page.mouse.up()
    await this.page.waitForTimeout(500) // Let momentum settle
  }

  /** Long-press an element (mobile hover replacement) */
  async longPress(locator: Locator | string, duration: number = 600) {
    const el = typeof locator === "string" ? this.page.locator(locator).first() : locator
    const box = await el.boundingBox()
    if (!box) throw new Error("Element not found for long-press")

    const x = box.x + box.width / 2
    const y = box.y + box.height / 2

    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.waitForTimeout(duration)
    await this.page.mouse.up()
    await this.page.waitForTimeout(500)
  }

  /** Tap outside an element to dismiss (modal/overlay) */
  async tapOutside(locator: Locator | string) {
    const el = typeof locator === "string" ? this.page.locator(locator).first() : locator
    const box = await el.boundingBox()
    if (!box) return

    // Tap above the element
    await this.page.touchscreen.tap(box.x - 10, box.y - 10)
    await this.page.waitForTimeout(300)
  }

  // ── Assertion Helpers ────────────────────────────────────────────────────
  /** Assert no horizontal scrollbar exists on the page */
  async assertNoHorizontalScroll() {
    const hasHorizontalScroll = await this.page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth
    })
    expect(hasHorizontalScroll, "Page should not have horizontal scrollbar").toBe(false)
  }

  /** Assert an element meets minimum tap target size (48×48) */
  async assertTapTargetSize(locator: Locator | string, minSize: number = 48) {
    const el = typeof locator === "string" ? this.page.locator(locator).first() : locator
    const box = await el.boundingBox()
    expect(box, "Element should have a bounding box").not.toBeNull()
    if (box) {
      expect(box.width, `Tap target width should be >= ${minSize}px`).toBeGreaterThanOrEqual(minSize)
      expect(box.height, `Tap target height should be >= ${minSize}px`).toBeGreaterThanOrEqual(minSize)
    }
  }

  /** Assert element is within the "thumb zone" (bottom 2/3 of screen on mobile) */
  async assertInThumbZone(locator: Locator | string) {
    if (!this.isMobile) return // Only check on mobile
    const el = typeof locator === "string" ? this.page.locator(locator).first() : locator
    const box = await el.boundingBox()
    const viewportH = this.viewport?.height ?? 844
    const thumbZoneStart = viewportH / 3
    expect(box?.y, "Element should be in thumb zone (bottom 2/3 of screen)").toBeGreaterThan(thumbZoneStart)
  }

  // ── Network Throttling ───────────────────────────────────────────────────
  async enableSlow3G() {
    const ctx = this.page.context()
    await ctx.route("**/*", (route) => {
      // Simulate Slow 3G: ~400ms delay per request
      setTimeout(() => route.continue(), 400)
    })
  }

  async enableFast3G() {
    const ctx = this.page.context()
    await ctx.route("**/*", (route) => {
      // Simulate Fast 3G: ~150ms delay per request
      setTimeout(() => route.continue(), 150)
    })
  }

  async disableThrottling() {
    await this.page.context().unroute("**/*")
  }

  // ── Screenshot Helpers ───────────────────────────────────────────────────
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `tests/screenshots/${name}.png`,
      fullPage: false,
    })
  }

  async screenshotFullPage(name: string) {
    await this.page.screenshot({
      path: `tests/screenshots/${name}-full.png`,
      fullPage: true,
    })
  }
}
