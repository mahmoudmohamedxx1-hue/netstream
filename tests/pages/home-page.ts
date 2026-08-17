import { Page, Locator, expect } from "@playwright/test"
import { BasePage } from "./base-page"

// ═══════════════════════════════════════════════════════════════════════════
// HomePage — Page Object for the NetStream home page
// ═══════════════════════════════════════════════════════════════════════════

export class HomePage extends BasePage {
  // ── Navbar ───────────────────────────────────────────────────────────────
  readonly logo: Locator
  readonly searchButton: Locator
  readonly languageToggle: Locator
  readonly navItems: Locator

  // ── Hero ─────────────────────────────────────────────────────────────────
  readonly heroSection: Locator
  readonly heroPlayButton: Locator
  readonly heroMuteButton: Locator
  readonly heroTitle: Locator

  // ── Content Rows ─────────────────────────────────────────────────────────
  readonly contentRows: Locator
  readonly continueWatchingRow: Locator
  readonly trendingRow: Locator
  readonly topImdbMoviesRow: Locator
  readonly topImdbSeriesRow: Locator

  // ── Cards ────────────────────────────────────────────────────────────────
  readonly cards: Locator
  readonly scrollArrows: Locator

  // ── Backup Sites ─────────────────────────────────────────────────────────
  readonly backupSitesSection: Locator
  readonly backupSiteLinks: Locator

  // ── Footer ───────────────────────────────────────────────────────────────
  readonly footer: Locator

  constructor(page: Page) {
    super(page)
    // Navbar
    this.logo = page.locator('[data-testid="logo"]')
    this.searchButton = page.locator('[data-testid="search-button"]')
    this.languageToggle = page.locator('[data-testid="language-toggle"]')
    this.navItems = page.locator("nav button").filter({ hasNotText: "" })

    // Hero
    this.heroSection = page.locator("section").first()
    this.heroPlayButton = page.locator("section").first().locator("button", { hasText: /play/i })
    this.heroMuteButton = page.locator("section").first().locator('button[aria-label="Unmute"], button[aria-label="Mute"]')
    this.heroTitle = page.locator("section").first().locator("h1, h2, h3").first()

    // Content rows
    this.contentRows = page.locator("section.group\\/row, section:has(h3)")
    this.continueWatchingRow = page.locator('section:has(h3:text("Continue"))')
    this.trendingRow = page.locator('section:has(h3:text("Trending"))')
    this.topImdbMoviesRow = page.locator('section:has(h3:text("IMDB Top Movies"))')
    this.topImdbSeriesRow = page.locator('section:has(h3:text("IMDB Top Series"))')

    // Cards
    this.cards = page.locator("[data-row-card]")
    this.scrollArrows = page.locator('button[aria-label="Scroll left"], button[aria-label="Scroll right"]')

    // Backup sites
    this.backupSitesSection = page.locator("section:has(h3:text('Backup'))")
    this.backupSiteLinks = this.backupSitesSection.locator("a[target='_blank']")

    // Footer
    this.footer = page.locator("footer")
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Navigate to home and wait for content to load */
  async open() {
    await this.goto("/")
    await this.waitForPageReady()
  }

  /** Click the search button to open the search overlay */
  async clickSearch() {
    await this.searchButton.click()
    await this.page.waitForTimeout(500) // Wait for overlay animation
  }

  /** Toggle language between EN and AR */
  async toggleLanguage() {
    await this.languageToggle.click()
    await this.page.waitForTimeout(300) // Wait for RTL switch
  }

  /** Click the logo to go home */
  async clickLogo() {
    await this.logo.click()
    await this.waitForPageReady()
  }

  /** Navigate to a specific nav section (home, movies, series, mylist) */
  async navigateTo(section: "home" | "movies" | "series" | "mylist") {
    // On mobile, nav items are icon-only; on desktop they have labels
    const navButton = this.page.locator(`nav button`).filter({ hasText: new RegExp(section, "i") }).first()
    // If no text match (mobile icon-only), click by index
    if (await navButton.count() === 0) {
      const sections = ["home", "series", "movies", "mylist"]
      const idx = sections.indexOf(section)
      const buttons = this.page.locator("nav button")
      await buttons.nth(idx + 1).click() // +1 because logo is first button
    } else {
      await navButton.click()
    }
    await this.page.waitForTimeout(1000) // Wait for page transition
  }

  /** Click on the first content card in a specific row */
  async clickFirstCardInRow(rowName: string) {
    const row = this.page.locator(`section:has(h3:text("${rowName}"))`)
    const card = row.locator("[data-row-card]").first()
    await card.click()
    await this.page.waitForTimeout(2000) // Wait for player/detail to open
  }

  /** Click on any card by index */
  async clickCard(rowIndex: number = 0, cardIndex: number = 0) {
    const rows = this.cards
    const row = this.page.locator("section").nth(rowIndex + 1) // +1 for hero
    const card = row.locator("[data-row-card]").nth(cardIndex)
    await card.click()
    await this.page.waitForTimeout(2000)
  }

  /** Long-press a card (mobile hover replacement) */
  async longPressCard(rowName: string, cardIndex: number = 0) {
    const row = this.page.locator(`section:has(h3:text("${rowName}"))`)
    const card = row.locator("[data-row-card]").nth(cardIndex)
    await this.longPress(card, 600)
  }

  /** Swipe a content row left or right */
  async swipeRow(rowName: string, direction: "left" | "right") {
    const row = this.page.locator(`section:has(h3:text("${rowName}")) .netflix-row-scroller`)
    await this.swipeHorizontal(row, direction)
  }

  /** Click a scroll arrow button */
  async clickScrollArrow(direction: "left" | "right") {
    const arrow = this.page.locator(`button[aria-label="Scroll ${direction}"]`).first()
    if (await arrow.isVisible()) {
      await arrow.click()
      await this.page.waitForTimeout(500) // Wait for smooth scroll
    }
  }

  /** Scroll to the backup sites section */
  async scrollToBackupSites() {
    await this.backupSitesSection.scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(500)
  }

  /** Scroll to the footer */
  async scrollToFooter() {
    await this.footer.scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(500)
  }

  // ── Assertions ───────────────────────────────────────────────────────────

  /** Assert the home page is loaded with visible navbar and hero */
  async assertLoaded() {
    await expect(this.logo).toBeVisible()
    await expect(this.searchButton).toBeVisible()
    await expect(this.heroSection).toBeVisible()
  }

  /** Assert content rows are rendered */
  async assertContentRowsVisible() {
    const count = await this.contentRows.count()
    expect(count, "Should have multiple content rows").toBeGreaterThan(2)
  }

  /** Assert the page starts at the top (scrollY = 0) */
  async assertScrollAtTop() {
    const scrollY = await this.page.evaluate(() => window.scrollY)
    expect(scrollY, "Page should load at the top").toBe(0)
  }

  /** Assert the hero mute button is visible */
  async assertHeroMuteButtonVisible() {
    // Wait for the trailer to load (3s delay + TMDB fetch)
    await this.page.waitForTimeout(5000)
    await expect(this.heroMuteButton).toBeVisible({ timeout: 10_000 })
  }

  /** Assert backup site links are present and open in new tabs */
  async assertBackupSitesPresent() {
    const count = await this.backupSiteLinks.count()
    expect(count, "Should have 4 backup site links").toBe(4)
    for (let i = 0; i < count; i++) {
      const link = this.backupSiteLinks.nth(i)
      await expect(link).toHaveAttribute("target", "_blank")
      await expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }
  }
}
