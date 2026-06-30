const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  
  await page.goto('http://127.0.0.1:8787/#overview');
  await page.waitForSelector('.dashboard-panel, .panel-state.error', { timeout: 10000 });
  await page.waitForTimeout(500); 
  await page.screenshot({ path: path.join(__dirname, 'overview_v2.png') });

  await page.click('button[data-layout="timeline"]');
  await page.waitForSelector('.gantt-container, .panel-state.error', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'timeline_v2.png') });

  await page.click('button[data-layout="explorer"]');
  await page.waitForSelector('.poster-grid, .panel-state.error', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'explorer_v2.png') });
  
  await page.click('button[data-layout="progress"]');
  await page.waitForSelector('.collection-grid, .panel-state.error', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'progress_v2.png') });

  await browser.close();
})();
