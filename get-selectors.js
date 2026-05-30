const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  console.log("Acessando...");
  await page.goto('https://painel.jotaja.com.br/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const inputs = await page.$$eval('input', el => el.map(i => i.outerHTML));
  const buttons = await page.$$eval('button', el => el.map(b => b.outerHTML));
  console.log('INPUTS:', inputs);
  console.log('BUTTONS:', buttons);
  await browser.close();
})();
