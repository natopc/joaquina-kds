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
    
    console.log("Aguardando login...");
    // Esperar um pouco para o login processar
    await page.waitForTimeout(5000);

    console.log("Acessando a página de acompanhamento...");
    await page.goto('https://painel.jotaja.com/#/relatorioAcompanhamento/false', { waitUntil: 'networkidle' });

    console.log("Monitorando pedidos com status 'Em produção'...");

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

      // 2. Extrai os pedidos iterando linha por linha com Playwright
      const rowsCount = await page.locator('tr.ant-table-row').count();
      console.log(`Verificando ${rowsCount} linhas na tabela...`);
      
      const novosPedidos = [];
      let expectedPedidos = 0;
      
      for (let i = 0; i < rowsCount; i++) {
          try {
              const tr = page.locator('tr.ant-table-row').nth(i);
              const tds = tr.locator('td');
              if (await tds.count() < 5) continue;
              
              const statusText = await tds.nth(4).innerText();
              const status = statusText.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              
              if (status.includes('em producao')) {
                  expectedPedidos++;
                  console.log(`Processando pedido da linha ${i}...`);
                  // Clica no botão da primeira coluna
                  const btn = tds.nth(0).locator('button');
                  if (await btn.count() > 0) {
                      console.log('Clicando no botão de lupa...');
                      // Usa JS puro para clicar e evitar bloqueios
                      await btn.evaluate(node => node.click());
                  } else {
                      console.log('Clicando na linha da tabela...');
                      await tr.evaluate(node => node.click());
                  }
                  
                  console.log('Aguardando a modal abrir...');
                  // Aguarda a modal abrir
                  await page.waitForTimeout(2000); 
                  console.log('Extraindo dados...');

                  // Extrai os dados do painel direito lendo os textos
                  const pedido = await page.evaluate(() => {
                      let id = '';
                      let customer = 'Desconhecido';
                      let createdAt = null;
                      const items = [];
                      
                      let lines = document.body.innerText.split('\n').map(s => s.trim()).filter(s => s);
                      
                      // Encontrar ID e Cliente e Data/Hora
                      for (const line of lines) {
                          if (line.includes('Pedido #')) {
                              id = line.match(/Pedido #(\d+)/)?.[1] || id;
                          }
                          if (line.startsWith('Nome:')) {
                              customer = line.replace('Nome:', '').split('Telefone:')[0].split('ID:')[0].trim();
                          }
                          if (line.includes('Data:') && line.includes('Hora:')) {
                              const dataMatch = line.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})/);
                              const horaMatch = line.match(/Hora:\s*(\d{2}):(\d{2}):(\d{2})/);
                              if (dataMatch && horaMatch) {
                                  createdAt = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}T${horaMatch[1]}:${horaMatch[2]}:${horaMatch[3]}-03:00`;
                              }
                          }
                      }
                      
                      // Encontrar os Itens abaixo de "RESUMO DO PEDIDO" ou "Resumo"
                      let resumoIdx = lines.findIndex(l => l.toUpperCase().includes('RESUMO DO PEDIDO') || l.toUpperCase() === 'RESUMO');
                      if (resumoIdx !== -1) {
                         for (let i = resumoIdx + 1; i < lines.length; i++) {
                            const line = lines[i];
                            if (line.startsWith('Qtd:')) {
                               let nextLineIdx = i + 1;
                               while (nextLineIdx < lines.length && (
                                   lines[nextLineIdx].startsWith('Valor:') || 
                                   lines[nextLineIdx].startsWith('R$') || 
                                   lines[nextLineIdx].trim() === ''
                               )) {
                                  nextLineIdx++;
                               }
                               const itemName = lines[nextLineIdx];
                               if (itemName && !itemName.startsWith('Qtd:') && !itemName.toUpperCase().includes('TOTAL')) {
                                  let observacao = '';
                                  let obsLineIdx = nextLineIdx + 1;
                                  while (obsLineIdx < lines.length && (lines[obsLineIdx].startsWith('-') || lines[obsLineIdx].toLowerCase().includes('obs'))) {
                                     observacao += lines[obsLineIdx].trim() + ' ';
                                     obsLineIdx++;
                                  }
                                  items.push({ name: itemName, observacao: observacao.trim() });
                                  i = obsLineIdx - 1; 
                               }
                            }
                            if (line.toUpperCase().includes('TOTAL')) {
                               break;
                            }
                         }
                      }
                      
                      // O fechamento será feito pelo Playwright, logo abaixo
                      if (!id) {
                          id = "PED-" + Math.floor(Math.random()*10000);
                      }
                      if (items.length > 0) {
                          return { id, customer, createdAt, items };
                      }
                      return null;
                  });
                  
                  console.log('Tentando fechar a modal...');
                  // Força o fechamento da modal usando evaluate para ter 100% de certeza que não será bloqueado
                  await page.evaluate(() => {
                      const closeBtn = document.querySelector('.ant-modal-close');
                      if (closeBtn) closeBtn.click();
                  });
                  console.log('Fechado.');
                  
                  if (pedido) {
                      console.log("Pedido extraído:\n", JSON.stringify(pedido, null, 2));
                      novosPedidos.push(pedido);
                  } else {
                      console.log("A linha foi clicada, mas o painel direito não retornou os dados (sem RESUMO DO PEDIDO?).");
                  }
                  
                  // Espera um pouco para a modal fechar
                  await page.waitForTimeout(1000);
              }
          } catch(e) {
              console.error("Erro ao processar linha " + i + ":", e.message);
          }
      }

      // 3. Envia os pedidos encontrados para o servidor KDS local
      if (novosPedidos.length === expectedPedidos) {
          try {
              await fetch('http://localhost:3000/api/sync-orders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(novosPedidos)
              });
              console.log(`${novosPedidos.length} pedidos sincronizados com sucesso!`);
          } catch (err) {
              console.error("Erro ao enviar para API local:", err);
          }
      } else {
          console.log(`Aviso: Encontrados ${expectedPedidos} pedidos na tela, mas apenas ${novosPedidos.length} foram extraídos corretamente. Pulando sync para evitar perda de dados.`);
      }

      let waitTime = 10000;
      try {
          const cfgRes = await axios.get('http://localhost:3000/api/config');
          if (cfgRes.data && cfgRes.data.scraperInterval) {
              waitTime = cfgRes.data.scraperInterval * 1000;
          }
      } catch(e) {}
      
      console.log(`Aguardando ${waitTime / 1000} segundos para a próxima verificação...`);
      await page.waitForTimeout(waitTime);
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
