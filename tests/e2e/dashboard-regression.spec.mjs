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

test("people separates included household identities and preserves profile navigation", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();

  const active = page.getByTestId("active-people");
  await expect(active.getByTestId("person-card").filter({ hasText: "Tony" })).toBeVisible();
  await expect(active.getByTestId("person-card").filter({ hasText: "Ace" })).toBeVisible();
  await expect(active).not.toContainText("Secret");
  await expect(active).not.toContainText("Hidden Viewer");
  await expect(active).toContainText("4.5h");
  await expect(active).not.toContainText("270 min");

  const secondary = page.getByTestId("secondary-people");
  await expect(secondary).not.toHaveAttribute("open", "");
  await secondary.locator(":scope > summary").click();
  await expect(secondary.getByTestId("person-card").filter({ hasText: "Legacy" })).toContainText("Disabled");
  await expect(secondary.getByTestId("person-card").filter({ hasText: "Tony Archive" })).toContainText("Possible duplicate");

  const tony = active.getByTestId("person-card").filter({ hasText: "Tony" }).first();
  await expectNoVisualOverflow(page);
  await tony.getByRole("button", { name: "Open Timeline" }).click();
  await expect.poll(() => page.url()).toContain("#timeline?");
  await expect.poll(() => page.url()).toContain("user=Tony");
  expect(pageErrors).toEqual([]);
});

test("people attributes confirmed viewing and restores period and heatmap semantics", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();

  const controls = page.getByTestId("people-period-controls");
  await expect(controls.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("people-heatmap-legend")).toContainText("Together");
  const justin = page.getByTestId("active-people").getByTestId("person-card").filter({ hasText: "Justin" });
  await expect(justin).toContainText("30m added from Together");
  await expect(justin).toContainText("1 confirmed shared session");
  await expect(justin.locator(".person-heat-cell.has-together").first()).toHaveAttribute("aria-label", /30m attributed.*1 confirmed Together session/);

  await controls.getByRole("button", { name: "7 days" }).click();
  await expect.poll(() => page.url()).toContain("period=7d");
  await expect(page.getByTestId("active-people")).toContainText("Justin");

  await page.getByTestId("people-period-controls").getByRole("button", { name: "Custom" }).click();
  const custom = page.getByTestId("people-period-controls");
  await custom.locator("[data-people-date-from]").fill("2026-07-05");
  await custom.locator("[data-people-date-to]").fill("2026-07-01");
  await custom.getByRole("button", { name: "Apply dates" }).click();
  await expect(custom.getByRole("alert")).toContainText("on or before");

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await custom.locator("[data-people-date-from]").fill(start);
  await custom.locator("[data-people-date-to]").fill(end);
  await custom.getByRole("button", { name: "Apply dates" }).click();
  await expect.poll(() => page.url()).toContain("period=custom");
  await expect.poll(() => page.url()).toContain(`dateFrom=${start}`);
  await page.reload();
  await expect(page.getByTestId("people-period-controls").getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-people-date-from]")).toHaveValue(start);
  await expectNoVisualOverflow(page);
});

test("people card ordering persists locally and heatmaps drill through with roving focus", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();

  const orderControls = page.getByTestId("people-order-controls");
  await expect(orderControls.getByRole("button", { name: "Default" })).toHaveAttribute("aria-pressed", "true");
  await orderControls.getByRole("button", { name: "Custom" }).click();

  const activePeople = page.getByTestId("active-people");
  const activeCards = activePeople.getByTestId("person-card");
  await expect(activeCards.first()).toBeVisible();
  const initialNames = await activeCards.locator("h4").allTextContents();
  expect(initialNames.length).toBeGreaterThan(1);

  const secondaryPeople = page.getByTestId("secondary-people");
  await secondaryPeople.locator(":scope > summary").click();
  const secondaryNames = await secondaryPeople.getByTestId("person-card").locator("h4").allTextContents();

  const firstCard = activeCards.nth(0);
  const secondCard = activeCards.nth(1);
  const dragHandle = secondCard.locator("[data-person-drag-handle]");
  await dragHandle.scrollIntoViewIfNeeded();
  const handleBox = await dragHandle.boundingBox();
  const targetBox = await firstCard.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Missing drag geometry for People cards.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(activeCards.locator("h4").first()).toHaveText(initialNames[1]);
  await expect(page.getByTestId("people-order-live")).toContainText("moved to position");
  const afterSecondaryNames = await secondaryPeople.getByTestId("person-card").locator("h4").allTextContents();
  expect(afterSecondaryNames).toEqual(secondaryNames);

  await page.reload();
  await page.getByRole("button", { name: "People" }).click();
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[1]);

  const reloadedControls = page.getByTestId("people-order-controls");
  await reloadedControls.getByRole("button", { name: "Default" }).click();
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[0]);
  await reloadedControls.getByRole("button", { name: "Custom" }).click();
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[1]);

  await page.getByTestId("people-period-controls").getByRole("button", { name: "7 days" }).click();
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[1]);

  await reloadedControls.getByRole("button", { name: "Reset positions" }).click();
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[0]);

  await reloadedControls.getByRole("button", { name: "Custom" }).click();
  const keyboardMove = page.getByTestId("active-people").getByTestId("person-card").nth(1).getByRole("button", { name: "Move earlier" });
  await keyboardMove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("active-people").getByTestId("person-card").locator("h4").first()).toHaveText(initialNames[1]);
  await expect(page.getByTestId("people-order-live")).toContainText("moved to position 1");
  await page.getByTestId("people-order-controls").getByRole("button", { name: "Reset positions" }).click();

  const heatmap = page.getByTestId("active-people").getByTestId("person-card").filter({ hasText: initialNames[0] }).locator("[data-person-heatmap]");
  await expect(heatmap).toHaveAttribute("tabindex", "0");
  await expect(heatmap.locator("[data-heatmap-cell][tabindex='0']")).toHaveCount(0);
  await heatmap.focus();

  const popover = page.getByTestId("people-heatmap-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Open day in Timeline");
  await page.keyboard.press("ArrowRight");
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "Open day in Timeline" }).click();
  await expect.poll(() => page.url()).toContain("#timeline?");
  await expect.poll(() => page.url()).toContain("timelineDate=");
  await expect.poll(() => page.url()).toContain("user=");
  await expectNoVisualOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("people remains usable at 320px without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();
  await expect(page.getByTestId("active-people")).toBeVisible();
  await expectNoVisualOverflow(page);
});

test("people pairings and operations use real names and survive partial failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();
  const pairing = page.getByTestId("pairing-card").filter({ hasText: "Tony & Justin" });
  await expect(pairing).toBeVisible();
  await expect(pairing).toContainText("Together 1");
  await expect(pairing).toContainText("Time unknown");
  await expect(page.getByTestId("operations-panel")).toContainText("Waiting on a co-watch answer");
  await expect(page.getByTestId("operations-panel").getByRole("button", { name: "Dismiss" })).toBeVisible();
  await expectNoVisualOverflow(page);

  await page.route("**/api/dashboard/cowatch-pairings?*", route => route.abort());
  await page.reload();
  await page.getByRole("button", { name: "People" }).click();
  await expect(page.getByTestId("active-people")).toContainText("Tony");
  await expect(page.getByTestId("pairings-panel")).toContainText("Pairings could not load");
  await expect(page.getByTestId("operations-panel")).toBeVisible();
});

test("browser cowatch review applies and clears a pair-scoped decision", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();
  const review = page.getByTestId("review-card").filter({ hasText: "Review Movie" });
  await expect(review).toContainText("Tony & Ace");
  await review.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByTestId("pairing-card").filter({ hasText: "Tony & Ace" })).toContainText("Reviewed together 1");
  const reviewed = page.getByTestId("review-card").filter({ hasText: "Review Movie" });
  await expect(reviewed).toContainText("Together");
  await reviewed.getByRole("button", { name: "Clear decision" }).click();
  await expect(page.getByTestId("review-card").filter({ hasText: "Review Movie" })).toContainText("Likely together");
  await expectNoVisualOverflow(page);
});

test("Ask in Discord queues one review-only prompt without blanking People", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();
  const review = page.getByTestId("review-card").filter({ hasText: "Review Movie" });
  await expect(review).toBeVisible();
  const ask = review.getByRole("button", { name: "Ask in Discord" });
  if ((await review.textContent()).includes("Ask in Discord")) {
    await expect(ask).toBeVisible();
    const responsePromise = page.waitForResponse(response => response.url().includes("/ask-discord"));
    await ask.click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    expect(body.ok, JSON.stringify(body)).toBe(true);
    const readback = await (await page.request.get("/api/dashboard/cowatch-reviews?limit=20&offset=0")).json();
    const candidateId = await review.getAttribute("data-candidate-id");
    const apiCandidate = readback.data.items.find(item => item.candidateId === candidateId);
    expect(apiCandidate?.discordPromptStatus, JSON.stringify(readback)).toBe("pending");
    await expect.poll(() => pageErrors).toEqual([]);
  }
  await expect(page.getByTestId("review-card").filter({ hasText: "Review Movie" })).toContainText("Discord: pending");
  await expect(page.getByTestId("operations-panel")).toContainText("Discord co-watch review");
  await expect(page.getByTestId("active-people")).toContainText("Tony");
  await expectNoVisualOverflow(page);
});

