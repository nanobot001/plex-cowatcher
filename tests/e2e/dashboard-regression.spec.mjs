import { test, expect } from "playwright/test";

const watchedByNames = async (card) => {
  const label = await card.getByTestId("viewer-badge").getAttribute("aria-label");
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

const readDetailCore = async (dialog) => ({
  key: await dialog.getByTestId("detail-workspace-key").textContent(),
  title: await dialog.locator("#detail-workspace-heading").textContent(),
  category: await dialog.getByTestId("detail-workspace-category").textContent(),
  people: await dialog.getByTestId("detail-people").textContent(),
  progress: await dialog.getByTestId("detail-workspace-progress").textContent(),
  source: await dialog.getByTestId("detail-workspace-source").textContent()
});

test("participant evidence stays consistent from recent card to detail", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const card = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId("viewer-badge")).toHaveAttribute("title", "Together Justin, Tony");
  await expect(card.getByTestId("viewer-badge")).toHaveAttribute("aria-label", "Together Justin, Tony");
  await expect(card.getByTestId("watched-by")).toHaveCount(0);
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

test("overview recent cards represent sessions and keep one participant expression", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const sessionCards = page.getByTestId("recent-playback-card").filter({ hasText: "Session Regression" });
  await expect(sessionCards).toHaveCount(1);
  const sessionCard = sessionCards.first();
  await expect(sessionCard.locator(".cw-meta")).toContainText("–");
  await expect(sessionCard.getByTestId("viewer-badge")).toHaveAttribute("aria-label", "Watched by Tony");
  await expect(sessionCard.getByTestId("watched-by")).toHaveCount(0);
  await expect(page.getByTestId("recent-playback-card").filter({ hasText: "Session Other Item" })).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("overview merges audiobook sessions when Plex changes the item key", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const rekeyedCards = page.getByTestId("recent-playback-card").filter({ has: page.getByText("Fixture Audiobook", { exact: true }) });
  await expect(rekeyedCards).toHaveCount(1);
  await expect(rekeyedCards.locator(".cw-meta")).toContainText("–");
  await expect(rekeyedCards).toContainText("Fixture Audiobook");
  expect(pageErrors).toEqual([]);
});

test("overview hides metadata gaps because ingestion repairs them automatically", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(page.locator('.overview-attention-row[data-action="refresh-metadata"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Plex item needs details");
  await expect(page.locator("body")).not.toContainText("Check this Plex library");
  await expect(page.locator("body")).not.toContainText("Refresh from Plex");
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
  await expect.poll(() => page.url()).toContain("detail=series%3Atv%3Ashow-regression");
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
  await expect(card).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("detail loads the selected canonical TV hierarchy with watcher evidence", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const requests = [];
  page.on("request", request => {
    if (request.url().includes("/api/dashboard/detail-workspace/")) requests.push(request.url());
  });
  await page.goto("/");

  const card = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await card.click();

  const dialog = page.locator("#detail-dialog");
  await expect(dialog).toBeVisible();
  const detailResponse = await page.request.get("/api/dashboard/detail-workspace/series%3Atv%3Ashow-regression");
  const detailData = (await detailResponse.json()).data;
  expect(detailData.posterUrl).toContain("variant=poster");
  expect(detailData.backdropUrl).toContain("variant=backdrop");
  expect(detailData.people.every(person => Number.isInteger(person.id))).toBeTruthy();
  expect(detailData.watcherPeople.every(person => Number.isInteger(person.id))).toBeTruthy();
  expect(JSON.stringify(detailData)).not.toContain("X-Plex-Token");
  await expect(dialog.getByTestId("detail-workspace-hero")).toBeVisible();

  await expect(dialog.getByTestId("detail-workspace-main")).toBeVisible();
  const seasonHeader = dialog.getByTestId("detail-hierarchy-group").first().locator("summary");
  await expect(seasonHeader).toBeVisible();
  await expect(seasonHeader).toContainText("Season 1");
  await seasonHeader.click();
  const epRow = dialog.getByTestId("detail-hierarchy-node").first();
  await expect(epRow).toBeVisible();
  const watcherGrid = epRow.getByTestId("detail-watcher-grid");
  await expect(watcherGrid).toBeVisible();
  const watcherMarkers = watcherGrid.locator("[data-detail-watcher-lane]");
  await expect(watcherMarkers).toHaveCount(detailData.watcherPeople.length);
  const firstWatcher = watcherMarkers.first();
  await firstWatcher.hover();
  await expect(firstWatcher.locator(".watcher-lane-tooltip")).toBeVisible();
  const selectedPersonId = await firstWatcher.getAttribute("data-person-id");
  await firstWatcher.click();
  await expect(dialog.getByTestId("detail-watcher-selection")).toBeVisible();
  await expect(firstWatcher).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog.getByTestId("detail-watcher-selection")).toHaveCount(0);
  await expect(dialog.locator(`[data-person-id="${selectedPersonId}"]`).first()).toHaveAttribute("aria-pressed", "false");
  const layout = await dialog.evaluate(element => {
    const reference = element.querySelector('[data-testid="detail-workspace-reference"]').getBoundingClientRect();
    const main = element.querySelector('[data-testid="detail-workspace-main"]').getBoundingClientRect();
    const hierarchy = element.querySelector('[data-testid="detail-workspace-hierarchy"]').getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      reference: { right: reference.right, bottom: reference.bottom, width: reference.width },
      main: { left: main.left, top: main.top },
      hierarchy: { width: hierarchy.width }
    };
  });
  if (layout.viewportWidth >= 768) {
    expect(layout.main.left).toBeGreaterThanOrEqual(layout.reference.right);
    expect(layout.hierarchy.width).toBeGreaterThan(layout.reference.width);
  } else {
    expect(layout.main.top).toBeGreaterThanOrEqual(layout.reference.bottom - 1);
  }
  expect(requests.filter(url => url.endsWith("/hierarchy"))).toHaveLength(1);
  expect(requests.filter(url => !url.endsWith("/hierarchy"))).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("non-Progress surfaces normalize to one canonical detail contract", async ({ page }) => {
  const legacyDetailRequests = [];
  page.on("request", request => {
    if (/\/api\/dashboard\/detail\/(?!workspace)/.test(request.url())) legacyDetailRequests.push(request.url());
  });
  await page.goto("/");

  const overviewCard = page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first();
  await overviewCard.click();
  const dialog = page.locator("#detail-dialog");
  await expect(dialog).toHaveAttribute("data-detail-key", "series:tv:show-regression");
  await expect.poll(() => page.url()).toContain("detail=series%3Atv%3Ashow-regression");
  const overviewCore = await readDetailCore(dialog);
  await dialog.locator(".dialog-close").click();

  await page.getByRole("button", { name: "Media Explorer" }).click();
  const libraryCard = page.locator('[data-section="tv"]').getByTestId("library-card").filter({ hasText: "Regression Show" });
  await libraryCard.evaluate(element => {
    const value = JSON.parse(decodeURIComponent(element.dataset.libraryItem));
    element.dataset.libraryItem = encodeURIComponent(JSON.stringify({
      ...value,
      title: "Wrong card title",
      displayTitle: "Wrong card title",
      category: "movie",
      displayNames: ["Wrong Person"],
      percentComplete: 1
    }));
  });
  await libraryCard.click();
  await expect(dialog).toHaveAttribute("data-detail-key", "series:tv:show-regression");
  const libraryCore = await readDetailCore(dialog);
  expect(libraryCore).toEqual(overviewCore);
  expect(libraryCore.title).toBe("Regression Show");
  expect(libraryCore.people).not.toContain("Wrong Person");
  expect(legacyDetailRequests).toEqual([]);
});

test("shared detail shell renders explicit presenters for all dashboard categories", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Media Explorer" }).click();
  const cases = [
    ["movie", "movie"],
    ["tv", "tv"],
    ["classic_tv", "classic-tv"],
    ["anime", "anime"],
    ["audiobook", "audiobook"]
  ];
  const dialog = page.locator("#detail-dialog");
  for (const [section, presenter] of cases) {
    const card = page.locator(`[data-section="${section}"]`).getByTestId("library-card").first();
    await expect(card).toBeVisible();
    const encodedItem = await card.getAttribute("data-library-item");
    const item = JSON.parse(decodeURIComponent(encodedItem || ""));
    expect(item.detailKey).toBeTruthy();
    expect(item.detailKey).toContain(section === "classic_tv" ? "series:classic_tv:" : section === "tv" ? "series:tv:" : section === "anime" ? "series:anime:" : section === "movie" ? "movie:" : "audiobook:");
    await card.click();
    await expect.poll(() => page.url()).toContain(`detail=${encodeURIComponent(item.detailKey)}`);
    await expect(dialog.getByTestId(`detail-presenter-${presenter}`)).toBeVisible();
    if (section === "movie") {
      await expect(dialog.getByTestId("detail-movie-overview")).toBeVisible();
      await expect(dialog.getByTestId("detail-movie-evidence")).toBeVisible();
      await expect(dialog.getByRole("progressbar", { name: /observed progress/i })).toBeVisible();
      await expect(dialog.getByTestId("detail-movie-overview").locator(".detail-movie-facts")).toBeVisible();
    }
    await expect(dialog.getByTestId("detail-workspace-category")).toHaveText(section === "classic_tv" ? "Classic TV" : section === "tv" ? "TV" : section === "movie" ? "Movies" : section === "anime" ? "Anime" : "Audiobooks");
    await dialog.locator(".dialog-close").click();
    await expect(dialog).not.toBeVisible();
  }
});

test("hierarchy failure remains section-local and retries without blanking detail", async ({ page }) => {
  let failHierarchy = true;
  await page.route(/\/api\/dashboard\/detail-workspace\/.+\/hierarchy$/, route => failHierarchy ? route.abort() : route.continue());
  await page.goto("/");
  await page.getByTestId("recent-playback-card").filter({ hasText: "Regression Show" }).first().click();
  const dialog = page.locator("#detail-dialog");
  await expect(dialog.locator("#detail-workspace-heading")).toHaveText("Regression Show");
  await expect(dialog.getByTestId("detail-workspace-main")).toBeVisible();
  await expect(dialog.getByTestId("detail-workspace-hierarchy-error")).toBeVisible();
  failHierarchy = false;
  await dialog.getByRole("button", { name: "Try hierarchy again" }).click();
  await expect(dialog.getByTestId("detail-hierarchy-group").first()).toBeVisible();
  await expect(dialog.getByTestId("detail-workspace-main")).toBeVisible();
});

test("detail shell owns one scroller and stays content-first across required widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit viewport matrix runs once in the desktop project.");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/#overview?detail=${encodeURIComponent("movie:movie-regression")}`);
    const dialog = page.locator("#detail-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#detail-workspace-heading")).toHaveText("Fixture Movie");
    const metrics = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector('[data-testid="detail-workspace-body"]');
      const bodyRect = body.getBoundingClientRect();
      const scrollOwners = [...element.querySelectorAll("*")]
        .filter(node => ["auto", "scroll"].includes(getComputedStyle(node).overflowY))
        .map(node => node.getAttribute("data-testid") || node.className);
      const reference = element.querySelector('[data-testid="detail-workspace-reference"]');
      return {
        rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        bodyOverflow: getComputedStyle(document.body).overflow,
        dialogOverflow: getComputedStyle(element).overflowY,
        scrollOwners,
        unusedRatio: Math.max(0, rect.bottom - bodyRect.bottom) / Math.max(1, rect.height),
        referencePosition: getComputedStyle(reference).position
      };
    });
    expect(metrics.rect.left).toBeGreaterThanOrEqual(0);
    expect(metrics.rect.top).toBeGreaterThanOrEqual(0);
    expect(metrics.rect.right).toBeLessThanOrEqual(metrics.viewport.width + 0.5);
    expect(metrics.rect.bottom).toBeLessThanOrEqual(metrics.viewport.height + 0.5);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport.width);
    expect(metrics.bodyOverflow).toBe("hidden");
    expect(metrics.dialogOverflow).toBe("hidden");
    expect(metrics.scrollOwners).toEqual(["detail-workspace-scroll"]);
    expect(metrics.unusedRatio).toBeLessThan(0.25);
    expect(metrics.referencePosition).toBe(width >= 768 ? "sticky" : "static");
    await dialog.locator(".dialog-close").click();
    await expect(page.locator("#view-title")).toBeFocused();
  }
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
  let peopleReadCount = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/dashboard/people") peopleReadCount += 1;
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "People" }).click();

  const orderControls = page.getByTestId("people-order-controls");
  await expect(orderControls.getByRole("button", { name: "Default" })).toHaveAttribute("aria-pressed", "true");

  const activePeople = page.getByTestId("active-people");
  const activeCards = activePeople.getByTestId("person-card");
  await expect(activeCards.first()).toBeVisible();
  const initialNames = await activeCards.locator("h4").allTextContents();
  expect(initialNames.length).toBeGreaterThan(1);
  const readsBeforeOrdering = peopleReadCount;
  await orderControls.getByRole("button", { name: "Custom" }).click();
  await expect.poll(() => peopleReadCount).toBe(readsBeforeOrdering);
  await expect(activeCards.first().locator("[data-person-order-controls]")).not.toContainText("Move earlier");

  const secondaryPeople = page.getByTestId("secondary-people");
  await secondaryPeople.locator(":scope > summary").click();
  const secondaryNames = await secondaryPeople.getByTestId("person-card").locator("h4").allTextContents();

  const firstCard = activeCards.nth(0);
  const secondCard = activeCards.nth(1);
  const dragHandle = secondCard.locator("[data-person-drag-handle]");
  await dragHandle.scrollIntoViewIfNeeded();
  const handleBox = await dragHandle.boundingBox();
  const sourceBox = await secondCard.boundingBox();
  const targetBox = await firstCard.boundingBox();
  if (!handleBox || !targetBox || !sourceBox) throw new Error("Missing drag geometry for People cards.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 24, handleBox.y + handleBox.height / 2 + 20, { steps: 4 });
  const dragGhost = page.getByTestId("people-drag-ghost");
  await expect(dragGhost).toBeVisible();
  const ghostBox = await dragGhost.boundingBox();
  if (!ghostBox) throw new Error("Missing drag ghost geometry for People cards.");
  expect(ghostBox.x).toBeGreaterThanOrEqual(sourceBox.x - 24);
  expect(ghostBox.y).toBeGreaterThanOrEqual(sourceBox.y - 24);
  expect(ghostBox.x).toBeLessThan(sourceBox.x + 160);
  expect(ghostBox.y).toBeLessThan(sourceBox.y + 160);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(activeCards.locator("h4").first()).toHaveText(initialNames[1]);
  await expect(page.getByTestId("people-order-live")).toContainText("moved to position");
  await expect.poll(() => peopleReadCount).toBe(readsBeforeOrdering);
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
  await expect(page.getByTestId("operations-panel")).toContainText("Waiting for a co-watch answer");
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

test("Progress shell renders bounded sections with correct cards and no page errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Progress", exact: true }).click();

  // Wait for the progress sections to load
  await expect(page.getByTestId("progress-continue-list")).toBeVisible();
  await expect(page.getByTestId("progress-active-list")).toBeVisible();
  await expect(page.getByTestId("progress-completed-list")).toBeVisible();

  // Assert cards are present and bounded
  const cards = page.getByTestId("progress-card");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(12);
  await expect(page.getByTestId("progress-hierarchy")).toHaveCount(0);

  // Assert TV Show cards display correct details and progress bar
  const tvCard = page.getByTestId("progress-continue-list").getByTestId("progress-card").filter({ hasText: "Regression Show" }).first();
  await expect(tvCard).toBeVisible();
  await expect(tvCard.getByTestId("progress-dots")).toBeVisible();
  await expect(tvCard).toContainText("S1 (2 eps)");

  // Assert Hidden user is excluded
  await expect(tvCard).not.toContainText("Hidden");

  // Assert Movies do not render season summaries
  const movieCard = cards.filter({ hasText: "Fixture Movie" }).first();
  if (await movieCard.count() > 0) {
    await expect(movieCard).toBeVisible();
    await expect(movieCard.locator(".progress-card-summary")).not.toBeVisible();
  }

  // Assert no visual overflow
  await expectNoVisualOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("Progress hierarchy expands lazily, caches responses, and preserves route state", async ({ page }) => {
  const pageErrors = [];
  const expansionRequests = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("/api/dashboard/progress/expand/")) {
      expansionRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByTestId("progress-continue-list")).toBeVisible();
  await expect(page.getByTestId("progress-hierarchy")).toHaveCount(0);

  const cardFor = title => page.getByTestId("progress-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).first();
  const tvCard = cardFor("Regression Show");
  await expect(tvCard).toBeVisible();
  await tvCard.click();
  
  const progressDialog = page.locator("#progress-dialog");
  await expect(progressDialog).toBeVisible();
  await expect(page.locator("#detail-dialog")).not.toBeVisible();
  const dialogBox = await progressDialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  if (viewport.width >= 1025) {
    expect(dialogBox.width).toBeGreaterThanOrEqual(1000);
    expect(dialogBox.width).toBeLessThanOrEqual(viewport.width * 0.95);
  } else {
    expect(dialogBox.width).toBeGreaterThanOrEqual(viewport.width - 2);
  }
  await expect(progressDialog.getByTestId("progress-dialog-summary")).toContainText("Overall progress");
  await expect(progressDialog.getByTestId("progress-dialog-summary")).toContainText("Source");
  await expect(progressDialog.getByTestId("progress-dialog-summary")).toContainText("Latest activity");
  await expect(progressDialog.getByTestId("progress-season").first()).toContainText("Season 1");
  await expect(progressDialog.getByTestId("progress-episode").filter({ hasText: "Confirmed Episode" }).first()).toBeVisible();
  await expect.poll(() => expansionRequests.length).toBe(1);
  const expandedTvUrl = page.url();
  expect(expandedTvUrl).toContain("progressDetail=");

  await progressDialog.locator(".dialog-close").click();
  await expect(progressDialog).not.toBeVisible();
  expect(expansionRequests.length).toBe(1);

  const regressionCards = page.getByTestId("progress-card").filter({ hasText: "Regression Show" });
  const duplicateTvCard = regressionCards.nth(Math.min(1, await regressionCards.count() - 1));
  await duplicateTvCard.click();
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-hierarchy")).toBeVisible();
  expect(expansionRequests.length).toBe(1);

  await page.reload();
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-episode").filter({ hasText: "Confirmed Episode" }).first()).toBeVisible();
  await progressDialog.locator(".dialog-close").click();

  const audiobookCard = cardFor("Fixture Audiobook");
  await expect(audiobookCard).toBeVisible();
  // Its cached proof belongs to an older media revision, so the safe track/file fallback is durable UI behavior.
  await expect(audiobookCard.locator(".progress-card-source")).toContainText("Plex track/file evidence");
  await expect(audiobookCard.getByTestId("progress-summary")).toContainText("total unknown");
  await expect(audiobookCard.getByTestId("progress-summary")).not.toContainText("%");
  await audiobookCard.click();
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-chapter").filter({ hasText: "Chapter 1" }).first()).toBeVisible();
  await expect.poll(() => expansionRequests.length).toBeGreaterThanOrEqual(3);
  await progressDialog.locator(".dialog-close").click();

  const verifiedAudiobookCard = cardFor("Verified Fixture Audiobook");
  await expect(verifiedAudiobookCard).toBeVisible();
  await expect(verifiedAudiobookCard.locator(".progress-card-source")).toContainText("Verified audiobook chapters");
  await expect(verifiedAudiobookCard.getByTestId("progress-summary")).toContainText("2 of 3 chapters · 50%");
  await expect(verifiedAudiobookCard.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await verifiedAudiobookCard.click();
  await expect(progressDialog).toBeVisible();
  const verifiedOverview = progressDialog.getByTestId("progress-dialog-summary");
  await expect(verifiedOverview).toContainText("2 of 3 chapters · 50%");
  await expect(verifiedOverview).toContainText("Verified audiobook chapters");
  await expect(verifiedOverview).toContainText("Plays");
  await expect(verifiedOverview).toContainText("Observed");
  await expect(verifiedOverview.getByTestId("progress-dialog-plays")).toHaveText("1");
  await expect(verifiedOverview.getByTestId("progress-dialog-people")).toContainText("Tony");
  await expect(verifiedOverview.getByTestId("progress-dialog-people")).not.toContainText("Hidden");
  await expect(progressDialog.getByTestId("progress-chapter").filter({ hasText: "Verified Chapter 1" }).first()).toContainText("watched");
  await expect(progressDialog.getByTestId("progress-chapter").filter({ hasText: "Verified Chapter 2" }).first()).toContainText("partial");

  await page.goBack(); // Should go back to Fixture Audiobook
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-chapter").filter({ hasText: "Chapter 1" }).first()).toBeVisible();
  
  await page.goForward(); // Should go to Verified Fixture Audiobook
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-chapter").filter({ hasText: "Verified Chapter 1" }).first()).toBeVisible();
  await progressDialog.locator(".dialog-close").click();

  for (const title of ["Classic Regression", "Anime Regression"]) {
    const card = cardFor(title);
    await expect(card).toBeVisible();
    await card.click();
    await expect(progressDialog).toBeVisible();
    await expect(progressDialog.getByTestId("progress-episode").first()).toBeVisible();
    await progressDialog.locator(".dialog-close").click();
  }

  const movieCard = cardFor("Fixture Movie");
  await expect(movieCard).toBeVisible();
  await movieCard.click();
  await expect(page.locator("#detail-dialog")).toBeVisible();
  await expect(page.locator("#progress-dialog")).not.toBeVisible();
  await expect(page.getByTestId("detail-people")).toContainText("Tony");
  await page.locator("#detail-dialog .dialog-close").click();

  const keyboardCard = cardFor("Anime Regression");
  await keyboardCard.focus();
  await page.keyboard.press("Enter");
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByTestId("progress-hierarchy")).toBeVisible();

  await expectNoVisualOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("Progress URL state survives reload, Back, and Forward", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Progress", exact: true }).click();

  // Filter by category
  await page.locator("select[name='category']").selectOption("movie");
  await expect.poll(() => page.url()).toContain("category=movie");
  const filteredUrl = page.url();

  // Reload page
  await page.reload();
  await expect(page.locator("select[name='category']")).toHaveValue("movie");

  // Go back
  await page.goBack();
  await expect.poll(() => page.url()).not.toBe(filteredUrl);

  // Go forward
  await page.goForward();
  await expect.poll(() => page.url()).toBe(filteredUrl);
  await expect(page.locator("select[name='category']")).toHaveValue("movie");

  expect(pageErrors).toEqual([]);
});


