import { Page, Locator, expect } from "@playwright/test"
import { BasePage } from "./base-page"

// ═══════════════════════════════════════════════════════════════════════════
// PlayerModal — Page Object for the video player modal
// ═══════════════════════════════════════════════════════════════════════════

export class PlayerModal extends BasePage {
  // ── Modal Container ──────────────────────────────────────────────────────
  readonly modal: Locator
  readonly closeButton: Locator
  readonly fullscreenButton: Locator
  readonly videoFrame: Locator

  // ── Controls ─────────────────────────────────────────────────────────────
  readonly reloadButton: Locator
  readonly nextServerButton: Locator
  readonly downloadButton: Locator
  readonly subtitlesButton: Locator
  readonly myListButton: Locator

  // ── Server Dropdown ──────────────────────────────────────────────────────
  readonly serverDropdown: Locator
  readonly serverOptions: Locator
  readonly favoriteStars: Locator

  // ── Episode Grid (series only) ───────────────────────────────────────────
  readonly episodeSection: Locator
  readonly episodeCards: Locator
  readonly seasonSelector: Locator

  // ── Info Section ─────────────────────────────────────────────────────────
  readonly titleHeading: Locator
  readonly overviewText: Locator

  constructor(page: Page) {
    super(page)
    this.modal = page.locator('[data-testid="close-player"]').locator("..")
    this.closeButton = page.locator('[data-testid="close-player"]')
    this.fullscreenButton = page.locator('[data-testid="fullscreen-toggle"]')
    this.videoFrame = page.locator(".aspect-video iframe, .aspect-video video").first()

    this.reloadButton = page.locator('[data-testid="reload-button"]')
    this.nextServerButton = page.locator('[data-testid="next-server"]')
    this.downloadButton = page.locator('button[title*="download" i]').first()
    this.subtitlesButton = page.locator('button[title*="subtitle" i]').first()
    this.myListButton = page.locator('button:has(svg.lucide-plus), button:has(svg.lucide-check)').last()

    this.serverDropdown = page.locator('[role="combobox"]').first()
    this.serverOptions = page.locator('[role="option"]')
    this.favoriteStars = page.locator('[aria-label*="favorites" i]')

    this.episodeSection = page.locator("section:has(h3:text('Episodes'))")
    this.episodeCards = this.episodeSection.locator("button:has(svg.lucide-play)")
    this.seasonSelector = this.episodeSection.locator("select").first()

    this.titleHeading = page.locator("h2").first()
    this.overviewText = page.locator("p:has-text('Fighting')").first() // Overview text varies
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Close the player modal */
  async close() {
    await this.closeButton.click()
    await this.page.waitForTimeout(500) // Wait for exit animation
  }

  /** Click the fullscreen toggle */
  async toggleFullscreen() {
    await this.fullscreenButton.click()
    await this.page.waitForTimeout(500)
  }

  /** Click the reload button */
  async reload() {
    await this.reloadButton.click()
    await this.page.waitForTimeout(1000)
  }

  /** Click "Next server" button */
  async nextServer() {
    await this.nextServerButton.click()
    await this.page.waitForTimeout(1000)
  }

  /** Open the server dropdown */
  async openServerDropdown() {
    await this.serverDropdown.click()
    await this.page.waitForTimeout(500) // Wait for dropdown animation
  }

  /** Select a server by name */
  async selectServer(name: string) {
    await this.openServerDropdown()
    const option = this.serverOptions.filter({ hasText: name }).first()
    await option.click()
    await this.page.waitForTimeout(1000)
  }

  /** Toggle favorite on the first server in the dropdown */
  async toggleFavoriteOnFirstServer() {
    await this.openServerDropdown()
    const star = this.favoriteStars.first()
    await star.click()
    await this.page.waitForTimeout(300)
  }

  /** Select a season (series only) */
  async selectSeason(seasonNumber: number) {
    if (await this.seasonSelector.isVisible()) {
      await this.seasonSelector.selectOption(String(seasonNumber))
      await this.page.waitForTimeout(2000) // Wait for episode data to load
    }
  }

  /** Click an episode by index (series only) */
  async clickEpisode(index: number = 0) {
    const ep = this.episodeCards.nth(index)
    if (await ep.isVisible()) {
      await ep.click()
      await this.page.waitForTimeout(1000)
    }
  }

  /** Scroll to the episode section */
  async scrollToEpisodes() {
    if (await this.episodeSection.isVisible()) {
      await this.episodeSection.scrollIntoViewIfNeeded()
      await this.page.waitForTimeout(500)
    }
  }

  // ── Assertions ───────────────────────────────────────────────────────────

  /** Assert the player modal is open */
  async assertOpen() {
    await expect(this.closeButton).toBeVisible({ timeout: 10_000 })
  }

  /** Assert the player modal is closed */
  async assertClosed() {
    await expect(this.closeButton).not.toBeVisible({ timeout: 5_000 })
  }

  /** Assert the video iframe is loading or loaded */
  async assertVideoFramePresent() {
    // The iframe might take a moment to mount
    await expect(this.videoFrame).toBeVisible({ timeout: 15_000 })
  }

  /** Assert the server dropdown has options */
  async assertServerOptionsPresent() {
    await this.openServerDropdown()
    const count = await this.serverOptions.count()
    expect(count, "Should have multiple server options").toBeGreaterThan(3)
  }

  /** Assert episode grid is visible (series only) */
  async assertEpisodesVisible() {
    await this.scrollToEpisodes()
    await expect(this.episodeSection).toBeVisible({ timeout: 10_000 })
    const count = await this.episodeCards.count()
    expect(count, "Should have multiple episodes").toBeGreaterThan(0)
  }

  /** Assert the title heading is visible */
  async assertTitleVisible() {
    await expect(this.titleHeading).toBeVisible()
  }
}
