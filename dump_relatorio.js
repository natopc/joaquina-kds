const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeRelatorio() {
  console.log("Iniciando auth...");
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
    
    console.log("Acessando relatorio...");
    await page.goto('https://painel.jotaja.com/#/relatorioAcompanhamento/false', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const html = await page.content();
    fs.writeFileSync('relatorio_dump.html', html);
    console.log("HTML salvo em relatorio_dump.html");
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scrapeRelatorio();
