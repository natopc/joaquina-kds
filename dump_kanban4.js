const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeKanban() {
  console.log("Iniciando auth pelo painel...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://painel.jotaja.com.br/', { waitUntil: 'networkidle' });
    
    // Login
    await page.fill('input[formcontrolname="email"]', 'joaquinacs@jotaja.com');
    await page.fill('input[formcontrolname="senha"]', 'joaquina123');
    await page.click('button.login-form-button');
    
    console.log("Aguardando login no painel...");
    await page.waitForTimeout(5000);
    
    // Verifica localStorage pra ver se tem token
    const ls = await page.evaluate(() => JSON.stringify(localStorage));
    console.log("LocalStorage do painel:", ls.substring(0, 200) + "...");
    
    console.log("Acessando Kanban com a mesma sessão...");
    await page.goto('https://kanban.jotaja.com/kanban', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'screenshot_kanban.png' });
    
    const html = await page.content();
    fs.writeFileSync('kanban_dump5.html', html);
    console.log("HTML salvo em kanban_dump5.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeKanban();
