const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  await page.goto('http://127.0.0.1:8787');
  
  // wait until there is no 'Loading' text
  try {
    await page.waitForFunction(() => !document.querySelector('#dashboard-content').textContent.includes('Loading'), { timeout: 3000 });
  } catch (e) {
    console.log("Timeout waiting for render");
  }

  await browser.close();
})();
