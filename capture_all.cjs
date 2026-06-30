const { chromium } = require('playwright');
const path = require('path');
const outDir = path.join(__dirname, 'captures');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Overview
  await page.goto('http://127.0.0.1:8787/#overview');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, 'overview_full.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'overview_viewport.png') });

  // Timeline
  await page.click('[data-layout="timeline"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'timeline_full.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'timeline_viewport.png') });

  // Library
  await page.click('[data-layout="explorer"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'library_full.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'library_viewport.png') });

  // People & Co-Watching
  await page.click('[data-layout="people"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'people_full.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'people_viewport.png') });

  // Progress
  await page.click('[data-layout="progress"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'progress_full.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'progress_viewport.png') });

  // Also capture the detail dialog
  const firstItem = await page.$('[data-item]');
  if (firstItem) {
    await firstItem.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'detail_dialog.png') });
    await page.click('.dialog-close');
  }

  await browser.close();
  console.log('All captures saved to', outDir);
})();
