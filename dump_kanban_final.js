const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeKanban() {
  console.log("Iniciando...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://kanban.jotaja.com/kanban', { waitUntil: 'networkidle' });
    
    // Preenche login
    await page.fill('input[type="text"]', 'joaquinacs@jotaja.com');
    await page.fill('input[type="password"]', 'joaquina123');
    
    // Clica em Entrar usando o locator robusto do Playwright
    await page.locator('text="Entrar"').click();
    
    console.log("Aguardando login no Kanban...");
    await page.waitForTimeout(6000); // tempo de sobra para logar e carregar pedidos

    await page.screenshot({ path: 'screenshot_kanban_final.png' });
    
    const html = await page.content();
    fs.writeFileSync('kanban_dump_final.html', html);
    console.log("HTML salvo em kanban_dump_final.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeKanban();
