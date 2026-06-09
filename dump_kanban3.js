const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeKanban() {
  console.log("Iniciando screenshot...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://kanban.jotaja.com/login', { waitUntil: 'networkidle' }).catch(() => page.goto('https://kanban.jotaja.com/'));
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshot_before_login.png' });
    
    const html = await page.content();
    fs.writeFileSync('kanban_dump3.html', html);
    
    // Tenta encontrar os campos de login
    await page.fill('input[type="text"], input[placeholder*="email" i]', 'joaquinacs@jotaja.com');
    await page.fill('input[type="password"]', 'joaquina123');
    
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('div, button, span, a')).find(el => el.textContent.trim() === 'Entrar');
        if (btn) btn.click();
    });
    
    console.log("Aguardando login no Kanban...");
    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'screenshot_after_login.png' });
    
    const html2 = await page.content();
    fs.writeFileSync('kanban_dump4.html', html2);
    console.log("HTML salvo em kanban_dump4.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeKanban();
