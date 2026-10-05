import { Page, Locator, expect } from "@playwright/test"

// ═══════════════════════════════════════════════════════════════════════════
// BasePage — shared utilities for all Page Objects
// ═══════════════════════════════════════════════════════════════════════════

export abstract class BasePage {
  constructor(public page: Page) {}

  // ── Navigation ───────────────────────────────────────────────────────────
  // NOTE: never wait for "networkidle" — the home page keeps the network busy
  // forever (rotating hero trailer iframe + image prefetch + SW activity),
  // which caused every beforeEach to time out. Wait for DOM + concrete
  // app markers instead: deterministic and ~25x faster.
  async goto(path: string = "/") {
    await this.page.goto(path, { waitUntil: "domcontentloaded" })
    await this.waitForPageReady()
  }

  async waitForPageReady() {
    // Wait for the app shell (navbar) to render…
    await this.page.waitForSelector("nav", { state: "visible" })
    // …and for real content (a heading or a row of cards) to replace skeletons.
    await this.page.waitForFunction(
      () =>
        document.querySelectorAll("h1, h2, h3").length > 1 ||
        document.querySelectorAll("img").length > 5,
      undefined,
      { timeout: 20_000 }
    )
    // Small settle for framer-motion enter animations.
    await this.page.waitForTimeout(400)
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

    // Real touch swipe via CDP. The old implementation mixed touchscreen.tap
    // with MOUSE drag events — mouse drags never scroll a touch-pan scroller,
    // so every swipe test failed. Chromium's Input.dispatchTouchEvent drives
    // the same pipeline a real finger uses.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdp = await (this.page.context() as any).newCDPSession(this.page)
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: startX, y: midY }],
      })
      const steps = 10
      for (let i = 1; i <= steps; i++) {
        const x = startX + ((endX - startX) * i) / steps
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: midY }],
        })
        await this.page.waitForTimeout(20)
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      })
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cdp as any).detach()
    }
    await this.page.waitForTimeout(600) // Let momentum/snap settle
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
  // CDP-based network emulation. The previous context.route("**/*") approach
  // leaked handlers across tests: any test that failed before calling
  // disableThrottling left its route registered, and the next 3G test then
  // double-handled requests ("Route is already handled!"). A per-page CDP
  // session dies with the page, so leaks are impossible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _netCdp: any = null

  private async emulateNetwork(latencyMs: number, throughputKbps: number) {
    await this.disableThrottling()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._netCdp = await (this.page.context() as any).newCDPSession(this.page)
    await this._netCdp.send("Network.enable")
    await this._netCdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: latencyMs,
      downloadThroughput: (throughputKbps * 1024) / 8,
      uploadThroughput: (throughputKbps * 1024) / 8,
    })
  }

  async enableSlow3G() {
    // ~400 ms RTT, ~400 kbps — Chrome DevTools "Slow 3G" preset
    await this.emulateNetwork(400, 400)
  }

  async enableFast3G() {
    // ~150 ms RTT, ~1.6 Mbps — Chrome DevTools "Fast 3G" preset
    await this.emulateNetwork(150, 1600)
  }

  async disableThrottling() {
    if (this._netCdp) {
      try {
        await this._netCdp.send("Network.emulateNetworkConditions", {
          offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this._netCdp as any).detach()
      } catch { /* session already dead with the page */ }
      this._netCdp = null
    }
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
