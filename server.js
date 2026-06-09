const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Endpoint de Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'delivery' && password === 'joaq123') {
    res.cookie('kds_auth', 'authenticated', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Credenciais inválidas' });
  }
});

// Endpoint de Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('kds_auth');
  res.json({ success: true });
});

// Middleware de Autenticação
app.use((req, res, next) => {
  const publicRoutes = ['/login.html', '/api/login', '/style.css'];
  
  // Libera rotas públicas
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  
  // Permite que o robô (scraper.js) faça a inserção de pedidos localmente sem cookie
  if ((req.path === '/api/orders' || req.path === '/api/sync-orders') && req.method === 'POST') {
    return next();
  }
  
  // Verifica o cookie
  if (req.cookies.kds_auth === 'authenticated') {
    return next();
  }
  
  // Se for uma requisição para a raiz ou páginas HTML, redireciona para login
  if (req.path === '/' || req.path === '/index.html' || req.path === '/mock-panel.html') {
    return res.redirect('/login.html');
  }
  
  return res.status(401).json({ error: 'Acesso Negado. Faça Login.' });
});

app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados em memória
let orders = [];
let clients = []; // SSE clients

// Carrega as configurações de praças
let configPracas = JSON.parse(fs.readFileSync(path.join(__dirname, 'config_pracas.json'), 'utf8'));

// Função para notificar todos os clientes conectados no KDS
function notifyClients() {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(orders)}\n\n`);
  });
}

// Rota SSE para o KDS (Tempo Real)
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Envia os dados atuais imediatamente
  res.write(`data: ${JSON.stringify(orders)}\n\n`);

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
});

// Retorna a lista de praças e suas palavras-chave (Para a Tela de Config)
app.get('/api/config', (req, res) => {
  res.json(configPracas);
});

// Salva as novas configurações de praças
app.post('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    fs.writeFileSync(path.join(__dirname, 'config_pracas.json'), JSON.stringify(newConfig, null, 2), 'utf8');
    configPracas = newConfig; // Atualiza em memória
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// Adiciona um novo pedido (Pode vir do Playwright ou do Mock Panel)
app.post('/api/orders', (req, res) => {
  const { id, customer, items, createdAt } = req.body;

  const finalId = id || `PED-${Date.now().toString().slice(-4)}`;

  // Deduplicação: se já existe um pedido com esse ID, ignora para não repetir
  if (orders.some(o => o.id === finalId)) {
    return res.status(200).json({ success: true, message: 'Pedido ignorado (já existe).' });
  }

  // Transforma os itens para o formato do KDS, suportando múltiplas praças!
  const formattedItems = items.flatMap(item => {
    const itemNameLower = item.name.toLowerCase();
    let assignedPracas = ['Geral'];

    if (configPracas.pratos) {
      const prato = configPracas.pratos.find(p => 
        itemNameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(itemNameLower)
      );
      if (prato && prato.pracas && prato.pracas.length > 0) {
        assignedPracas = prato.pracas;
      }
    }

    const originalItemId = Math.random().toString(36).substring(7);

    return assignedPracas.map(praca => ({
      ...item,
      name: item.name,
      praca: praca,
      completed: false,
      id: Math.random().toString(36).substring(7),
      originalItemId: originalItemId
    }));
  });

  const newOrder = {
    id: finalId,
    customer: customer,
    items: formattedItems,
    createdAt: createdAt || new Date().toISOString(),
    status: 'pending' // pending, completed
  };

  orders.push(newOrder);
  notifyClients();
  res.status(201).json({ success: true, order: newOrder });
});

// Sincroniza todos os pedidos ativos do Jotajá
app.post('/api/sync-orders', (req, res) => {
  const incomingOrders = req.body; // Array de pedidos do scraper
  const incomingIds = incomingOrders.map(o => o.id);

  // 1. Adiciona novos pedidos que ainda não estão no KDS
  incomingOrders.forEach(incomingOrder => {
    if (!orders.some(o => o.id === incomingOrder.id)) {
      // Transforma os itens para o formato do KDS
      const formattedItems = incomingOrder.items.flatMap(item => {
        const itemNameLower = item.name.toLowerCase();
        let assignedPracas = ['Geral'];

        if (configPracas.pratos) {
          const prato = configPracas.pratos.find(p => 
            itemNameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(itemNameLower)
          );
          if (prato && prato.pracas && prato.pracas.length > 0) {
            assignedPracas = prato.pracas;
          }
        }

        const originalItemId = Math.random().toString(36).substring(7);

        return assignedPracas.map(praca => ({
          ...item,
          name: item.name,
          praca: praca,
          completed: false,
          id: Math.random().toString(36).substring(7),
          originalItemId: originalItemId
        }));
      });

      orders.push({
        id: incomingOrder.id,
        customer: incomingOrder.customer,
        items: formattedItems,
        createdAt: incomingOrder.createdAt || new Date().toISOString(),
        status: 'pending'
      });
    }
  });

  // 2. Remove (ou marca como completed) os pedidos que estavam no KDS mas sumiram do Jotajá
  orders.forEach(order => {
    if (order.status === 'pending' && !incomingIds.includes(order.id) && !order.id.startsWith('PED-')) {
      // Pedidos com prefixo PED- são mocks locais, não removemos se não vieram do scraper.
      // Caso contrário, se sumiu do Jotajá (foi pra Saiu para Entrega, etc), concluímos.
      order.status = 'completed';
    }
  });

  notifyClients();
  res.status(200).json({ success: true, synced: incomingOrders.length });
});

// Rota para concluir um item de um pedido específico (Visão Tradicional)
app.post('/api/complete-item', (req, res) => {
  const { orderId, itemId } = req.body;
  
  const order = orders.find(o => o.id === orderId);
  if (order) {
    const item = order.items.find(i => i.id === itemId);
    if (item) {
      item.completed = true;
      
      // Verifica se todos os itens do pedido estão completos
      if (order.items.every(i => i.completed)) {
        order.status = 'completed';
      }
      
      notifyClients();
      return res.json({ success: true });
    }
  }
  res.status(404).json({ error: 'Pedido ou item não encontrado' });
});

// Rota para concluir 1 unidade de um item específico via FIFO (Visão Consolidada/Quantidade)
app.post('/api/complete-fifo', (req, res) => {
  const { itemName, praca } = req.body;

  // Encontra os pedidos pendentes
  const pendingOrders = orders.filter(o => o.status === 'pending');
  
  // Ordena do mais antigo para o mais novo (FIFO)
  pendingOrders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  let itemToComplete = null;
  let orderToUpdate = null;

  for (const order of pendingOrders) {
    // Procura por um item com esse nome e praça que ainda não esteja completo
    const item = order.items.find(i => i.name === itemName && i.praca === praca && !i.completed);
    if (item) {
      itemToComplete = item;
      orderToUpdate = order;
      break;
    }
  }

  if (itemToComplete) {
    itemToComplete.completed = true;
    
    // Verifica se o pedido agora está completo
    if (orderToUpdate.items.every(i => i.completed)) {
      orderToUpdate.status = 'completed';
    }
    
    notifyClients();
    return res.json({ success: true, message: 'Item concluído usando FIFO na ordem mais antiga.', orderId: orderToUpdate.id });
  }

  res.status(404).json({ error: 'Nenhum item pendente encontrado com esse nome.' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor KDS rodando em http://localhost:${PORT}`);
  console.log(`👉 Painel Simulado: http://localhost:${PORT}/mock-panel.html`);
  
  // Inicia o robô scraper em paralelo
  console.log('🤖 Iniciando o robô do Jotajá...');
  require('./scraper.js');
});
