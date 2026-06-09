const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeKanban() {
  console.log("Iniciando...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://kanban.jotaja.com/login', { waitUntil: 'networkidle' }).catch(() => page.goto('https://kanban.jotaja.com/'));
    
    // Tenta encontrar os campos de login
    await page.fill('input[type="text"], input[placeholder*="email" i]', 'joaquinacs@jotaja.com');
    await page.fill('input[type="password"]', 'joaquina123');
    await page.click('div.login_AcessarBtn__jUfT5, div:has-text("Acessar")');
    
    console.log("Aguardando login no Kanban...");
    await page.waitForTimeout(6000);

    const html = await page.content();
    fs.writeFileSync('kanban_dump2.html', html);
    console.log("HTML salvo em kanban_dump2.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeKanban();
