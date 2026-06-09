const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeKanban() {
  console.log("Iniciando...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://painel.jotaja.com.br/', { waitUntil: 'networkidle' });
    await page.fill('input[formcontrolname="email"]', 'joaquinacs@jotaja.com');
    await page.fill('input[formcontrolname="senha"]', 'joaquina123');
    await page.click('button.login-form-button');
    console.log("Aguardando login...");
    await page.waitForTimeout(5000);

    console.log("Acessando Kanban...");
    await page.goto('https://kanban.jotaja.com/kanban', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // Wait for kanban to load

    const html = await page.content();
    fs.writeFileSync('kanban_dump.html', html);
    console.log("HTML salvo em kanban_dump.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeKanban();
