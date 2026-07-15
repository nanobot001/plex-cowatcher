import { chromium } from "playwright";

const baseURL = process.env.DASHBOARD_LIVE_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => failures.push(`${viewport.width}px page error: ${error.message}`));
    const response = await page.goto(baseURL, { waitUntil: "networkidle" });
    if (!response?.ok()) failures.push(`${viewport.width}px dashboard returned ${response?.status() ?? "no response"}`);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    if (dimensions.scrollWidth > dimensions.clientWidth) failures.push(`${viewport.width}px dashboard overflows horizontally`);

    const cards = page.getByTestId("recent-playback-card");
    const cardCount = await cards.count();
    const badgeCount = await cards.getByTestId("viewer-badge").count();
    if (cardCount !== badgeCount) failures.push(`${viewport.width}px recent cards/badges differ: ${cardCount}/${badgeCount}`);
    const duplicateParticipantLines = await cards.getByTestId("watched-by").count();
    if (duplicateParticipantLines !== 0) failures.push(`${viewport.width}px Overview cards still render duplicate participant lines`);

    for (let index = 0; index < cardCount; index += 1) {
      const card = cards.nth(index);
      const label = await card.getByTestId("viewer-badge").getAttribute("aria-label");
      const badgeTitle = await card.getByTestId("viewer-badge").getAttribute("title");
      if (label !== badgeTitle) failures.push(`${viewport.width}px card ${index + 1} badge accessible label and title differ`);
    }

    for (let index = 0; index < cardCount; index += 1) {
      const card = cards.nth(index);
      const label = await card.getByTestId("viewer-badge").getAttribute("aria-label");
      if (!label?.includes(",")) continue;
      const cardCategory = await card.getAttribute("data-cat");
      await card.click();
      const cleanLabel = label.replace(/^(Watched by|Together|Likely together) /, "");
      const expectedNames = cleanLabel.split(",").map((name) => name.trim()).filter(Boolean);
      const detailPeople = page.getByTestId("detail-people");
      try {
        await page.waitForFunction(
          ({ testId, expected }) => {
            const actual = (document.querySelector(`[data-testid="${testId}"]`)?.textContent || "")
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean);
            return expected.every((name) => actual.includes(name));
          },
          { testId: "detail-people", expected: expectedNames },
          { timeout: 5_000 }
        );
      } catch {}
      const people = await detailPeople.innerText();
      const peopleNames = people.split(",").map((name) => name.trim()).filter(Boolean);
      const missingNames = expectedNames.filter((name) => !peopleNames.includes(name));
      const detailCategory = await page.getByTestId("detail-workspace-body").getAttribute("data-category");
      if (missingNames.length) {
        const encodedItem = await card.getAttribute("data-item");
        let context = "";
        try {
          const item = JSON.parse(decodeURIComponent(encodedItem || ""));
          context = ` for "${item.displayTitle || item.title}" (${item.ratingKey})`;
        } catch {}
        failures.push(`${viewport.width}px canonical detail omitted card participants${context}: missing "${missingNames.join(", ")}", received "${people}"`);
      }
      if (cardCategory !== detailCategory) failures.push(`${viewport.width}px canonical detail category differs from the entry card: expected "${cardCategory}", received "${detailCategory}"`);
      await page.locator("#detail-dialog").evaluate((dialog) => dialog.close());
      break;
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Live dashboard smoke verification passed.\n");
