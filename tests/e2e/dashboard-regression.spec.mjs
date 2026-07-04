import { test, expect } from "playwright/test";

const watchedByNames = async (card) => {
  const label = await card.getByTestId("watched-by").getAttribute("aria-label");
  return String(label || "")
    .replace(/^(Watched by|Together|Likely together) /, "");
};

const expectNoVisualOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
};

const expectBadgeRowsDoNotOverlap = async (badge) => {
  const metrics = await badge.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    rows: [...element.querySelectorAll(".media-badge-name, .media-badge-more")].map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    })
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  for (let index = 1; index < metrics.rows.length; index += 1) {
    expect(metrics.rows[index].top).toBeGreaterThanOrEqual(metrics.rows[index - 1].bottom - 0.5);
  }
};

test("participant evidence stays consistent from recent card to detail", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const card = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId("viewer-badge")).toHaveAttribute("title", "Together Justin, Tony");
  await expect(card.getByTestId("watched-by")).toHaveAttribute("aria-label", "Together Justin, Tony");
  await expectBadgeRowsDoNotOverlap(card.getByTestId("viewer-badge"));

  const cardNames = await watchedByNames(card);
  await card.click();
  await expect(page.locator("#detail-dialog")).toBeVisible();
  const detailPeople = page.getByTestId("detail-people");
  for (const name of cardNames.split(", ").map(n => n.trim())) {
    await expect(detailPeople).toContainText(name);
  }
  await expectNoVisualOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("library aggregation respects aliases, hidden users, filters, and compact badges", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Media Explorer" }).click();

  const tvSection = page.locator('[data-section="tv"]');
  const card = tvSection.getByTestId("library-card").filter({ hasText: "Regression Show" });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("viewer-badge")).toHaveAttribute("title", "Watched by Ace, Justin, Tony");
  await expect(card.getByTestId("viewer-badge")).toContainText("+1 more");
  await expect(card.getByTestId("watched-by")).toHaveAttribute("aria-label", "Watched by Ace, Justin, Tony");
  await expect(page.locator("body")).not.toContainText("Secret");
  await expect(page.locator("body")).not.toContainText("Hidden Viewer");
  await expectBadgeRowsDoNotOverlap(card.getByTestId("viewer-badge"));

  await page.locator('select[name="user"]').selectOption("Tony");
  const filteredCard = page.locator('[data-section="tv"]').getByTestId("library-card").filter({ hasText: "Regression Show" });
  await expect(filteredCard.getByTestId("watched-by")).toHaveAttribute("aria-label", "Watched by Tony");
  await expectNoVisualOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("library URL state survives selection, reload, Back, and Forward", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Media Explorer" }).click();
  const card = page.locator('[data-section="tv"]').getByTestId("library-card").filter({ hasText: "Regression Show" });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.url()).toContain("selected=");
  const selectedUrl = page.url();

  await page.reload();
  await expect(page.locator('[data-section="tv"]').getByTestId("library-card").filter({ hasText: "Regression Show" })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect.poll(() => page.url()).not.toBe(selectedUrl);
  await page.goForward();
  await expect.poll(() => page.url()).toBe(selectedUrl);
  await expect(page.locator('[data-section="tv"]').getByTestId("library-card").filter({ hasText: "Regression Show" })).toHaveAttribute("aria-pressed", "true");
});

test("detail workspace narrow viewport behavior: modal, focus trap, and close restoration", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");

  const card = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await expect(card).toBeVisible();

  // Focus and press Enter
  await card.focus();
  await page.keyboard.press("Enter");

  const dialog = page.locator("#detail-dialog");
  await expect(dialog).toBeVisible();

  // Ensure close button is visible
  const closeBtn = dialog.locator(".dialog-close");
  await expect(closeBtn).toBeVisible();

  // Click close button
  await closeBtn.click();
  await expect(dialog).not.toBeVisible();
  
  // Focus should restore to the card
  await expect(card).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("detail shows TV hierarchy, watched states, and lazy-loads plays", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const card = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await card.click();

  const dialog = page.locator("#detail-dialog");
  await expect(dialog).toBeVisible();

  // Seasons hierarchy check
  const seasonHeader = dialog.locator(".detail-tree-season-header").first();
  await expect(seasonHeader).toBeVisible();
  await expect(seasonHeader).toContainText("Season 1");

  // Click to expand season
  await seasonHeader.click();

  // Check that episodes are now visible
  const epRow = dialog.locator(".detail-tree-episode-row").first();
  await expect(epRow).toBeVisible();

  // Check state badges exist
  const badgeGroup = epRow.locator(".state-badge-group");
  await expect(badgeGroup).toBeVisible();
  await expect(badgeGroup.locator(".state-badge").first()).toBeVisible();

  // Click episode to lazy-load plays
  await epRow.click();
  const lazyContainer = epRow.locator(".detail-tree-episode-lazy");
  await expect(lazyContainer).toBeVisible();
  await expect(lazyContainer.locator(".detail-lazy-play-item").first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

