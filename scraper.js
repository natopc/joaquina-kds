const { chromium } = require('playwright');
const axios = require('axios');

/**
 * Este é um script CONCEITUAL.
 * Ele serve como base para você automatizar a extração dos pedidos no painel real.
 * Como funciona:
 * 1. O script faz o login.
 * 2. Monitora a página de pedidos.
 * 3. A cada X segundos, lê os pedidos na tela.
 * 4. Envia os pedidos via POST para a API local do KDS (http://localhost:3000/api/orders).
 */

async function startScraper() {
  let browser;
  try {
    // headless: true -> roda 100% invisível em segundo plano. Evita que fechem a janela sem querer.
    browser = await chromium.launch({ headless: true });  
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Iniciando o robô scraper...");

  // 1. Acesse a URL de login
  await page.goto('https://painel.jotaja.com.br/', { waitUntil: 'networkidle' });

    // --- ATENÇÃO: COLOQUE SEUS SELETORES REAIS E CREDENCIAIS AQUI ---
    // Seletores reais da Jotajá baseados na página deles:
    await page.fill('input[formcontrolname="email"]', 'joaquinacs@jotaja.com');
    await page.fill('input[formcontrolname="senha"]', 'joaquina123');
    await page.click('button.login-form-button');
    
    console.log("Aguardando login manual ou automático...");
    // Esperar um pouco para o login processar
    await page.waitForTimeout(5000);

    console.log("Login realizado com sucesso! Monitorando pedidos...");

    let loops = 0;
    // Loop infinito de monitoramento
    while (true) {
      loops++;
      // A cada 5 minutos (30 loops de 10s), recarrega a página para garantir que não perdeu a conexão com o Jotajá
      if (loops > 30) {
        console.log("Recarregando a página por precaução (Auto-Refresh)...");
        await page.reload({ waitUntil: 'networkidle' });
        loops = 0;
      }

      // 2. Extrai os pedidos da tela usando a função evaluate do Playwright
      const novosPedidos = await page.evaluate(() => {
        const pedidosEncontrados = [];
        
        const cards = document.querySelectorAll('.pedido.ant-card');
        cards.forEach(card => {
          // Extrair o nome do cliente
          let customer = "Desconhecido";
          const spans = Array.from(card.querySelectorAll('span'));
          const nomeSpan = spans.find(s => s.innerText && s.innerText.includes('Nome:'));
          if (nomeSpan) {
            customer = nomeSpan.innerText.replace('Nome:', '').trim();
          }

          // Extrair os itens
          const items = [];
          const divs = Array.from(card.querySelectorAll('div'));
          // Pelos prints, o nome do item fica em uma div com font-weight 700 e cor black
          const itemDivs = divs.filter(d => d.style.fontWeight === '700' && d.style.color === 'black');
          
          itemDivs.forEach(itemEl => {
            const name = itemEl.innerText.trim();
            if (name) {
              items.push({ name });
            }
          });

          // Tentar extrair o ID do pedido. Se não achar, gerar um ID fixo baseado no cliente e itens
          // para não repetir o mesmo pedido toda vez que o robô ler a tela!
          let idText = customer + items.map(i=>i.name).join('');
          let hash = 0;
          for (let i = 0; i < idText.length; i++) hash = Math.imul(31, hash) + idText.charCodeAt(i) | 0;
          let id = "PED-" + Math.abs(hash).toString().substring(0, 5);

          // Só envia se encontrou algum item válido
          if (items.length > 0) {
            pedidosEncontrados.push({ id, customer, items });
          }
        });

        return pedidosEncontrados;
      });

      // 3. Envia os pedidos encontrados para o servidor KDS local
      if (novosPedidos && novosPedidos.length > 0) {
        for (const pedido of novosPedidos) {
          try {
            // Adicionado timeout de 5 segundos para não travar o loop se o servidor KDS demorar
            await axios.post('http://localhost:3000/api/orders', pedido, { timeout: 5000 });
            console.log(`Pedido ${pedido.id} importado com sucesso!`);
          } catch (err) {
            console.error(`Erro ao salvar pedido no KDS local: ${err.message}`);
          }
        }
      }

      // Aguarda 10 segundos antes da próxima checagem
      await page.waitForTimeout(10000);
    }
  } catch (error) {
    console.error("Erro Crítico no Scraper. Ele será reiniciado em 10 segundos:", error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    // Em caso de qualquer quebra ou fechamento, reinicia o processo automaticamente!
    console.log("Reiniciando o robô...");
    setTimeout(startScraper, 10000);
  }
}

// Para iniciar, basta chamar startScraper();
startScraper();
module.exports = startScraper;
