const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', error => console.log('ERR:', error.message));
  page.on('request', request => console.log('REQ:', request.url()));
  page.on('response', response => console.log('RES:', response.url(), response.status()));

  await page.goto('http://127.0.0.1:8787');
  await page.waitForTimeout(3000);
  await browser.close();
})();
