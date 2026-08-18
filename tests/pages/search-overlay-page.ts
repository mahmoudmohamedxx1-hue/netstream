import { Page, Locator, expect } from "@playwright/test"
import { BasePage } from "./base-page"

// ═══════════════════════════════════════════════════════════════════════════
// SearchOverlay — Page Object for the full-screen search overlay
// ═══════════════════════════════════════════════════════════════════════════

export class SearchOverlay extends BasePage {
  readonly overlay: Locator
  readonly closeButton: Locator
  readonly searchInput: Locator
  readonly imdbInput: Locator
  readonly resultsGrid: Locator
  readonly trendingGrid: Locator
  readonly peopleSection: Locator
  readonly typeToggle: Locator
  readonly playNowButton: Locator

  constructor(page: Page) {
    super(page)
    this.overlay = page.locator(".fixed.inset-0.z-\\[90\\]").first()
    this.closeButton = page.locator('[data-testid="close-search"]')
    this.searchInput = page.locator('input[placeholder*="Search"]').first()
    this.imdbInput = page.locator('[data-testid="imdb-input"]')
    this.resultsGrid = page.locator(".grid").filter({ has: page.locator("button") }).first()
    this.trendingGrid = page.locator(".grid").filter({ hasText: "trending" }).first()
    this.peopleSection = page.locator("section:has(h3:text('People')), div:has(h3:text('People'))").first()
    this.typeToggle = page.locator('button:has-text("Movie"), button:has-text("Series")').filter({ has: page.locator("svg") })
    this.playNowButton = page.locator('button:has-text("Play now")')
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Open the search overlay (click search button on navbar) */
  async open() {
    await this.page.locator('[data-testid="search-button"]').click()
    await this.page.waitForTimeout(500) // Wait for overlay animation
  }

  /** Close the search overlay */
  async close() {
    await this.closeButton.click()
    await this.page.waitForTimeout(500)
  }

  /** Type a search query and wait for debounced results */
  async search(query: string) {
    await this.searchInput.fill(query)
    await this.page.waitForTimeout(500) // 300ms debounce + buffer
  }

  /** Type an IMDB ID and press Enter to play */
  async playByImdbId(imdbId: string) {
    await this.imdbInput.fill(imdbId)
    await this.imdbInput.press("Enter")
    await this.page.waitForTimeout(2000) // Wait for player to open
  }

  /** Click the first search result */
  async clickFirstResult() {
    const result = this.resultsGrid.locator("button").first()
    await result.click()
    await this.page.waitForTimeout(2000)
  }

  /** Toggle between movie and series type */
  async toggleType() {
    await this.typeToggle.first().click()
    await this.page.waitForTimeout(300)
  }

  /** Navigate results with keyboard (ArrowDown, ArrowUp, Enter) */
  async keyboardNavigate(direction: "down" | "up", times: number = 1) {
    for (let i = 0; i < times; i++) {
      await this.page.keyboard.press(direction === "down" ? "ArrowDown" : "ArrowUp")
      await this.page.waitForTimeout(100)
    }
  }

  /** Press Enter to play the currently highlighted result */
  async keyboardPlay() {
    await this.page.keyboard.press("Enter")
    await this.page.waitForTimeout(2000)
  }

  // ── Assertions ───────────────────────────────────────────────────────────

  /** Assert the search overlay is open */
  async assertOpen() {
    await expect(this.searchInput).toBeVisible({ timeout: 5_000 })
  }

  /** Assert the search overlay is closed */
  async assertClosed() {
    await expect(this.searchInput).not.toBeVisible({ timeout: 3_000 })
  }

  /** Assert search results are displayed */
  async assertResultsVisible() {
    await expect(this.resultsGrid).toBeVisible({ timeout: 10_000 })
  }

  /** Assert trending titles are shown when search is empty */
  async assertTrendingVisible() {
    await expect(this.trendingGrid).toBeVisible({ timeout: 10_000 })
  }

  /** Assert the IMDB ID input is visible */
  async assertImdbInputVisible() {
    await expect(this.imdbInput).toBeVisible()
  }
}
