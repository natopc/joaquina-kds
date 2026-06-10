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
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessions[sessionId] = username;
    res.cookie('kds_auth', sessionId, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
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
  if (req.cookies.kds_auth && sessions[req.cookies.kds_auth]) {
    req.user = sessions[req.cookies.kds_auth];
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
let currentBatchColorIndex = 0; // Para as cores de lote
let sessions = {}; // sessionId -> username

// Funções de manipulação de Usuários
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            const defaultUsers = [{ username: 'delivery', password: 'joaq123', isAdmin: true, allowedViews: ['traditional', 'aggregated', 'settings', 'admin'], allowedPracas: ['Geral'] }];
            fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf8');
            return defaultUsers;
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveUsers(usersList) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2), 'utf8');
}

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
  res.json({ ...configPracas, scraperInterval: configPracas.scraperInterval || 10 });
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

// Rota para o Frontend buscar as próprias permissões
app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({error: 'Não logado'});
    const users = loadUsers();
    const user = users.find(u => u.username === req.user);
    if (!user) return res.status(401).json({error: 'Usuário não encontrado'});
    
    res.json({
        username: user.username,
        isAdmin: user.isAdmin,
        allowedViews: user.allowedViews || [],
        allowedPracas: user.allowedPracas || ['Geral']
    });
});

// Rotas de Gestão de Usuários (Apenas Admin)
app.get('/api/users', (req, res) => {
    const users = loadUsers();
    const currentUser = users.find(u => u.username === req.user);
    if (!currentUser || !currentUser.isAdmin) return res.status(403).json({error: 'Acesso negado'});
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const users = loadUsers();
    const currentUser = users.find(u => u.username === req.user);
    if (!currentUser || !currentUser.isAdmin) return res.status(403).json({error: 'Acesso negado'});
    
    saveUsers(req.body);
    res.json({success: true});
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

    return assignedPracas.map(praca => {
      const pracaName = typeof praca === 'string' ? praca : praca.name;
      const delay = typeof praca === 'string' ? 0 : (praca.delay || 0);
      return {
        ...item,
        name: item.name,
        praca: pracaName,
        delay: delay,
        completed: false,
        id: Math.random().toString(36).substring(7),
        originalItemId: originalItemId
      };
    });
  });

  const newOrder = {
    id: finalId,
    customer: customer,
    items: formattedItems,
    createdAt: createdAt || new Date().toISOString(),
    status: 'pending', // pending, completed
    batchColorIndex: currentBatchColorIndex
  };

  orders.push(newOrder);
  currentBatchColorIndex = (currentBatchColorIndex + 1) % 5; // Rotaciona para mock panel
  notifyClients();
  res.status(201).json({ success: true, order: newOrder });
});

// Sincroniza todos os pedidos ativos do Jotajá
app.post('/api/sync-orders', (req, res) => {
  const incomingOrders = req.body; // Array de pedidos do scraper
  const incomingIds = incomingOrders.map(o => o.id);
  let hasNewOrders = false;

  // 1. Adiciona novos pedidos que ainda não estão no KDS
  incomingOrders.forEach(incomingOrder => {
    const existingOrder = orders.find(o => o.id === incomingOrder.id);
    
    if (!existingOrder) {
      hasNewOrders = true;
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

        return assignedPracas.map(praca => {
          const pracaName = typeof praca === 'string' ? praca : praca.name;
          const delay = typeof praca === 'string' ? 0 : (praca.delay || 0);
          return {
            ...item,
            name: item.name,
            praca: pracaName,
            delay: delay,
            completed: false,
            id: Math.random().toString(36).substring(7),
            originalItemId: originalItemId
          };
        });
      });

      orders.push({
        id: incomingOrder.id,
        customer: incomingOrder.customer,
        items: formattedItems,
        createdAt: incomingOrder.createdAt || new Date().toISOString(),
        status: 'pending',
        batchColorIndex: currentBatchColorIndex
      });
    } else if (existingOrder.status === 'completed') {
      // O pedido já existia mas estava concluído. Se ele veio do Jotajá novamente (em produção), reativamos!
      existingOrder.status = 'pending';
      existingOrder.items.forEach(i => i.completed = false);
      hasNewOrders = true; // Para disparar notificação
    }
  });

  if (hasNewOrders) {
    currentBatchColorIndex = (currentBatchColorIndex + 1) % 5;
  }

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

// Rota para desmarcar (voltar atrás) um item concluído
app.post('/api/uncomplete-item', (req, res) => {
  const { orderId, itemId } = req.body;
  
  const order = orders.find(o => o.id === orderId);
  if (order) {
    const item = order.items.find(i => i.id === itemId);
    if (item) {
      item.completed = false;
      
      // Se o pedido estava concluído, volta para pendente
      if (order.status === 'completed') {
        order.status = 'pending';
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
