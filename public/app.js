// Estado Global
let state = {
    currentView: localStorage.getItem('kds_currentView') || 'traditional',
    currentPraca: localStorage.getItem('kds_currentPraca') || 'Geral',
    orders: [],
    pracas: [], // [{ name: "Chapa", keywords: ["burguer", "x-bacon"] }]
    user: null
};

// Gerador de Som Beep (AudioContext)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota A5
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
}

// ====================
// ADMIN LOGIC
// ====================
let adminUsers = [];
async function renderAdmin() {
    if (!state.user || !state.user.isAdmin) return;
    try {
        const [usersRes, configRes] = await Promise.all([
            fetch('/api/users'),
            fetch('/api/config')
        ]);
        adminUsers = await usersRes.json();
        const config = await configRes.json();
        
        document.getElementById('input-scraper-interval').value = config.scraperInterval || 10;
        
        const list = document.getElementById('users-settings-list');
        list.innerHTML = `
            <table class="settings-table" style="width:100%; text-align:left;">
                <thead><tr><th>Usuário</th><th>Senha</th><th>Admin?</th><th>Views Permitidas</th><th>Praças Permitidas</th><th>Ações</th></tr></thead>
                <tbody id="users-tbody"></tbody>
            </table>
            <button class="btn-add-station" onclick="addUserRow()">+ Adicionar Usuário</button>
            <button class="btn-save-station" onclick="saveUsers()" style="margin-top:1rem; background:var(--brand); color:white; padding:0.5rem; border-radius:4px; border:none; cursor:pointer;">💾 Salvar Usuários</button>
        `;
        renderUsersTable();
    } catch(e) { console.error(e); }
}

window.renderUsersTable = function() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    
    const availableViews = [
        { id: 'traditional', label: 'Visão por Pedido' },
        { id: 'aggregated', label: 'Visão Agregada' },
        { id: 'settings', label: 'Cardápio' },
        { id: 'admin', label: 'Sistema' }
    ];

    adminUsers.forEach((u, i) => {
        let viewsHTML = availableViews.map(v => {
            const isChecked = (u.allowedViews || []).includes(v.id) ? 'checked' : '';
            return `<label style="display:block; font-size:0.85rem; margin-bottom:4px;"><input type="checkbox" ${isChecked} onchange="toggleUserArray(${i}, 'allowedViews', '${v.id}', this.checked)"> ${v.label}</label>`;
        }).join('');

        let pracasHTML = state.pracas.map(p => {
            const isChecked = (u.allowedPracas || []).includes(p.name) ? 'checked' : '';
            return `<label style="display:block; font-size:0.85rem; margin-bottom:4px;"><input type="checkbox" ${isChecked} onchange="toggleUserArray(${i}, 'allowedPracas', '${p.name}', this.checked)"> ${p.name}</label>`;
        }).join('');

        tbody.innerHTML += `
            <tr style="vertical-align: top;">
                <td><input type="text" value="${u.username}" onchange="adminUsers[${i}].username=this.value" style="width: 100%;" /></td>
                <td><input type="text" value="${u.password}" onchange="adminUsers[${i}].password=this.value" style="width: 100%;" /></td>
                <td style="text-align: center;"><input type="checkbox" ${u.isAdmin?'checked':''} onchange="adminUsers[${i}].isAdmin=this.checked" style="transform: scale(1.5); margin-top: 5px;" /></td>
                <td><div style="max-height: 120px; overflow-y: auto; background: var(--bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border);">${viewsHTML}</div></td>
                <td><div style="max-height: 120px; overflow-y: auto; background: var(--bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border);">${pracasHTML}</div></td>
                <td style="text-align: center;"><button onclick="adminUsers.splice(${i}, 1); renderUsersTable();" style="color:var(--danger); border:none; background:none; cursor:pointer; font-weight: bold; margin-top: 5px;">Excluir</button></td>
            </tr>
        `;
    });
}

window.toggleUserArray = function(userIndex, arrayName, value, isAdding) {
    if (!adminUsers[userIndex][arrayName]) adminUsers[userIndex][arrayName] = [];
    if (isAdding) {
        if (!adminUsers[userIndex][arrayName].includes(value)) {
            adminUsers[userIndex][arrayName].push(value);
        }
    } else {
        adminUsers[userIndex][arrayName] = adminUsers[userIndex][arrayName].filter(v => v !== value);
    }
}

window.addUserRow = function() {
    adminUsers.push({username: 'novo', password: '123', isAdmin: false, allowedViews: ['traditional'], allowedPracas: ['Geral']});
    renderUsersTable();
}

window.saveUsers = async function() {
    await fetch('/api/users', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(adminUsers)
    });
    alert('Usuários salvos com sucesso!');
}

document.getElementById('btn-save-interval').addEventListener('click', async () => {
    const interval = parseInt(document.getElementById('input-scraper-interval').value) || 10;
    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    config.scraperInterval = interval;
    await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(config)
    });
    alert('Velocidade do robô salva com sucesso!');
});

// Relógio do Cabeçalho
function updateClock() {
    const clockEl = document.getElementById('clock');
    clockEl.innerText = new Date().toLocaleTimeString('pt-BR');
}
setInterval(updateClock, 1000);
updateClock();

// Formatar Tempo Decorrido
function getElapsedTime(isoString) {
    const start = new Date(isoString);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    let colorClass = '';
    if (diffMins >= 15) colorClass = 'danger';
    else if (diffMins >= 10) colorClass = 'warning';
    
    return { 
        text: `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`,
        colorClass
    };
}

// Iniciar a Aplicação
async function init() {
    try {
        const meRes = await fetch('/api/me');
        if (!meRes.ok) {
            window.location.href = '/login.html';
            return;
        }
        state.user = await meRes.json();
    } catch(e) {
        window.location.href = '/login.html';
        return;
    }

    // Hide unauthorized views
    const allViewBtns = document.querySelectorAll('.view-btn[data-view]');
    allViewBtns.forEach(btn => {
        const view = btn.dataset.view;
        if (!state.user.isAdmin && !state.user.allowedViews.includes(view)) {
            btn.style.display = 'none';
        }
    });

    if (state.user.isAdmin) {
        document.getElementById('btn-admin').style.display = 'inline-block';
    }

    if (!state.user.isAdmin && !state.user.allowedViews.includes(state.currentView) && state.user.allowedViews.length > 0) {
        state.currentView = state.user.allowedViews[0];
    }

    setupViewToggles();
    // Setup do botão de tema
    const btnTheme = document.getElementById('btn-theme');
    if (localStorage.getItem('kds_theme') === 'light') {
        document.body.classList.add('light-mode');
        btnTheme.innerText = '🌙';
    }
    btnTheme.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        btnTheme.innerText = isLight ? '🌙' : '☀️';
        localStorage.setItem('kds_theme', isLight ? 'light' : 'dark');
    });

    // Lógica de Tela Cheia
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Erro ao tentar entrar em tela cheia: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    // Lógica de Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login.html';
        } catch (err) {
            console.error('Erro ao sair:', err);
        }
    });

    // Iniciar
    await fetchPracas();
    connectSSE();
    
    // Loop para atualizar os cronômetros das telas a cada segundo
    setInterval(renderCurrentView, 1000);
}

// Alternar entre visões (Tradicional vs Agregada vs Config)
function setupViewToggles() {
    const allBtns = document.querySelectorAll('.view-btn[data-view]');

    allBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('[data-view]');
            if (!targetBtn) return;

            allBtns.forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            
            state.currentView = targetBtn.dataset.view;
            localStorage.setItem('kds_currentView', state.currentView);
            
            document.querySelectorAll('.view-container').forEach(c => c.classList.remove('active'));
            const container = document.getElementById(`${state.currentView}-view`);
            if (container) container.classList.add('active');
            
            if (state.currentView === 'settings') {
                renderSettings();
            } else if (state.currentView === 'admin') {
                renderAdmin();
            } else {
                renderCurrentView();
            }
        });
    });

    // Restaurar estado visual inicial
    allBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = Array.from(allBtns).find(b => b.dataset.view === state.currentView);
    if (activeBtn) activeBtn.classList.add('active');
    
    document.querySelectorAll('.view-container').forEach(c => c.classList.remove('active'));
    const activeContainer = document.getElementById(`${state.currentView}-view`);
    if (activeContainer) activeContainer.classList.add('active');

    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
}

// Busca a lista de praças do servidor (agora vem a config inteira)
async function fetchPracas() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        state.config = data;
        state.pracas = [{ name: 'Geral' }, ...(data.pracas || []).map(p => ({ name: p }))];
        renderPracaNav();
    } catch (err) {
        console.error("Erro ao buscar praças:", err);
    }
}

// Renderiza o menu superior de navegação de praças
function renderPracaNav() {
    const nav = document.getElementById('praca-nav');
    if (!nav) return;
    nav.innerHTML = '';
    
    const allowed = state.user && state.user.isAdmin ? state.pracas : state.pracas.filter(p => state.user && state.user.allowedPracas && state.user.allowedPracas.includes(p.name));
    
    allowed.forEach(praca => {
        const btn = document.createElement('button');
        btn.className = `station-btn ${praca.name === state.currentPraca ? 'active' : ''}`;
        btn.innerText = praca.name;
        btn.addEventListener('click', () => {
            state.currentPraca = praca.name;
            localStorage.setItem('kds_currentPraca', state.currentPraca);
            renderPracaNav();
            renderCurrentView();
        });
        nav.appendChild(btn);
    });
}

// Conecta ao Server-Sent Events para receber pedidos em tempo real
let lastOrderCount = 0;
function connectSSE() {
    const evtSource = new EventSource('/api/stream');
    evtSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        state.orders = data;
        
        // Verifica se há novos pedidos pendentes para tocar o beep
        const pendingOrders = state.orders.filter(o => o.status === 'pending').length;
        if (pendingOrders > lastOrderCount) {
            playBeep();
        }
        lastOrderCount = pendingOrders;

        if (state.currentView !== 'settings') {
            renderCurrentView();
        }
    };
    
    evtSource.onerror = function() {
        console.log("Reconectando KDS Server...");
    };
}

// Função de roteamento de renderização
function renderCurrentView() {
    if (state.currentView === 'traditional') {
        renderTraditional();
    } else if (state.currentView === 'aggregated') {
        renderAggregated();
    }
}

// Completa um item via Card Tradicional
async function completeItem(orderId, itemId) {
    await fetch('/api/complete-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, itemId })
    });
}

// Desmarca um item (volta a ser pendente)
async function uncompleteItem(orderId, itemId) {
    await fetch('/api/uncomplete-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, itemId })
    });
}

// Completa 1 unidade de um insumo específico via FIFO
async function completeFifo(itemName) {
    // Para dar baixa, precisamos saber de qual praça é (pegamos do estado atual, se for "Geral" pegaremos a primeira correspondência no servidor)
    const pracaToComplete = state.currentPraca === 'Geral' ? getPracaFallback(itemName) : state.currentPraca;
    
    await fetch('/api/complete-fifo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName, praca: pracaToComplete })
    });
}

// Fallback se estiver na aba "Geral"
function getPracaFallback(itemName) {
    // Procura no array pendente qualquer item com esse nome e retorna a praça dele
    for(let o of state.orders) {
        if(o.status==='pending') {
            for(let i of o.items) {
                if(i.name === itemName) return i.praca;
            }
        }
    }
    return 'Geral';
}

// Renderiza a visão Tradicional (Cards)
function renderTraditional() {
    const grid = document.getElementById('orders-grid');
    grid.innerHTML = '';
    
    // Apenas pedidos pendentes, ordenados por data de criação (mais recente primeiro)
    const pendingOrders = state.orders
        .filter(o => o.status === 'pending')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    pendingOrders.forEach(order => {
        // Filtra os itens desse pedido que pertencem à praça selecionada (ou todos se 'Geral')
        let itemsToShow = order.items.filter(i => state.currentPraca === 'Geral' || i.praca === state.currentPraca);
        
        // Filtra itens cujo tempo de atraso (delay) ainda não passou (ignora na visão Geral e Agregada)
        if (state.currentPraca !== 'Geral') {
            const now = Date.now();
            const orderTime = new Date(order.createdAt).getTime();
            itemsToShow = itemsToShow.filter(i => {
                const itemDelayMs = (i.delay || 0) * 1000;
                return (now - orderTime) >= itemDelayMs;
            });
        }
        
        if (state.currentPraca === 'Geral') {
            const grouped = {};
            itemsToShow.forEach(i => {
                const key = i.originalItemId || i.id;
                if (!grouped[key]) {
                    grouped[key] = { ...i, allIds: [i.id], allCompleted: i.completed };
                } else {
                    grouped[key].allIds.push(i.id);
                    if (!i.completed) grouped[key].allCompleted = false;
                }
            });
            itemsToShow = Object.values(grouped).map(g => ({ ...g, completed: g.allCompleted }));
        }
        
        // Se este pedido não tiver itens para esta praça e não estivermos em "Geral", pula ele
        if (itemsToShow.length === 0 && state.currentPraca !== 'Geral') return;
        
        const timeInfo = getElapsedTime(order.createdAt);
        
        // Monta o HTML do Card
        const card = document.createElement('div');
        card.className = `order-card batch-color-${order.batchColorIndex !== undefined ? order.batchColorIndex : 0}`;
        
        // Se todos os itens daquela PRAÇA específica do pedido estiverem completos, deixa opaco
        const allLocalItemsDone = itemsToShow.length > 0 && itemsToShow.every(i => i.completed);
        if(allLocalItemsDone) card.classList.add('completed');
        
        card.innerHTML = `
            <div class="order-header">
                <span class="order-id">#${order.id}</span>
                <span class="order-time ${timeInfo.colorClass}">${timeInfo.text}</span>
            </div>
            <div class="order-customer">${order.customer}</div>
            <div class="order-items"></div>
        `;
        
        const itemsContainer = card.querySelector('.order-items');
        
        itemsToShow.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = `item-row ${item.completed ? 'done' : ''}`;
            
            const obsText = item.observacao || item.observation || item.obs || item.observacoes || item.notes || item.observações || '';
            const obsHtml = obsText ? `<div class="item-obs" style="font-size: 0.85em; color: var(--warning); margin-top: 4px; font-weight: normal;">Obs: ${obsText}</div>` : '';
            
            itemEl.style.flexDirection = 'column';
            itemEl.style.alignItems = 'flex-start';

            itemEl.innerHTML = `
                <span class="item-name">${item.name}</span>
                ${obsHtml}
            `;
            
            itemEl.addEventListener('click', () => {
                if (item.completed) {
                    if (item.allIds) {
                        item.allIds.forEach(id => uncompleteItem(order.id, id));
                    } else {
                        uncompleteItem(order.id, item.id);
                    }
                } else {
                    if (item.allIds) {
                        item.allIds.forEach(id => completeItem(order.id, id));
                    } else {
                        completeItem(order.id, item.id);
                    }
                }
            });
            
            itemsContainer.appendChild(itemEl);
        });
        
        grid.appendChild(card);
    });
}

// Renderiza a visão Consolidada (Quantidade / FIFO)
function renderAggregated() {
    const list = document.getElementById('items-list');
    list.innerHTML = '';
    
    // Dicionário para agregar quantidades: { "Filé Mignon": 5 }
    const agg = {};
    
    state.orders.filter(o => o.status === 'pending').forEach(order => {
        const processedOriginalIds = new Set();
        
        order.items.forEach(item => {
            // Conta apenas se não estiver completo e pertencer à praça selecionada
            if (!item.completed && (state.currentPraca === 'Geral' || item.praca === state.currentPraca)) {
                
                // Evita contar o mesmo item múltiplas vezes na aba 'Geral' se ele foi quebrado em várias praças
                if (state.currentPraca === 'Geral') {
                    const key = item.originalItemId || item.id;
                    if (processedOriginalIds.has(key)) return;
                    processedOriginalIds.add(key);
                }
                
                if (!agg[item.name]) agg[item.name] = 0;
                agg[item.name]++;
            }
        });
    });
    
    // Converte para Array e ordena por quantidade (maior primeiro)
    const sortedItems = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    
    if (sortedItems.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted)">Nenhum insumo pendente para esta praça no momento.</p>';
        return;
    }
    
    sortedItems.forEach(([name, qty]) => {
        const row = document.createElement('div');
        row.className = 'ag-item';
        
        row.innerHTML = `
            <div class="ag-info">
                <div class="ag-qty">${qty}</div>
                <div class="ag-name">${name}</div>
            </div>
            <div class="ag-actions">
                <button class="btn-decrease" title="Dar baixa em 1 unidade (FIFO)">-</button>
            </div>
        `;
        
        row.querySelector('.btn-decrease').addEventListener('click', () => {
            completeFifo(name);
        });
        
        list.appendChild(row);
    });
}

// ------------------------------------------------------------------
// LÓGICA DE CONFIGURAÇÕES (Modo Aprendizado Automático)
// ------------------------------------------------------------------

function renderSettings() {
    const list = document.getElementById('stations-settings-list');
    const unknownList = document.getElementById('unknown-items-list');
    list.innerHTML = '';
    unknownList.innerHTML = '';

    // 1. Identificar insumos desconhecidos
    const knownWords = (state.config.pratos || []).map(p => p.name.toLowerCase());
    const unknownItems = new Set();
    
    state.orders.forEach(order => {
        order.items.forEach(item => {
            const nameLower = item.name.toLowerCase();
            const hasMatch = knownWords.some(kw => nameLower.includes(kw) || kw.includes(nameLower));
            if (!hasMatch) {
                unknownItems.add(item.name);
            }
        });
    });

    if (unknownItems.size === 0) {
        unknownList.innerHTML = '<span class="item-tag" style="background:transparent;border:none">Nenhum item desconhecido no momento. 🎉</span>';
    } else {
        unknownItems.forEach(item => {
            const tag = document.createElement('span');
            tag.className = 'item-tag unknown';
            tag.innerHTML = `${item} <button class="add-btn" title="Adicionar ao Cardápio" onclick="addUnknownToMenu('${item}')">+</button>`;
            unknownList.appendChild(tag);
        });
    }

    // 2. Renderizar a Tabela do Cardápio
    const table = document.createElement('table');
    table.className = 'menu-table';
    
    // Cabeçalho da tabela (Nome do prato + Praças)
    let ths = `<th>Nome do Prato</th>`;
    const pracasCols = state.config.pracas || [];
    pracasCols.forEach(praca => {
        ths += `<th style="text-align: center;">
            <div class="praca-header">
                <input type="text" class="praca-name-input" value="${praca}" onchange="updatePracaName('${praca}', this.value)">
                <button class="remove-btn mini" onclick="removePraca('${praca}')" title="Excluir Praça">×</button>
            </div>
        </th>`;
    });
    ths += `<th style="text-align: center;">Ações <button class="add-btn" onclick="addPraca()" title="Adicionar Nova Praça">+</button></th>`;
    
    table.innerHTML = `
        <thead>
            <tr>${ths}</tr>
        </thead>
        <tbody>
        </tbody>
    `;
    
    const tbody = table.querySelector('tbody');

    // Ordenar os pratos alfabeticamente antes de exibir
    if (state.config.pratos) {
        state.config.pratos.sort((a, b) => a.name.localeCompare(b.name));
    }

    (state.config.pratos || []).forEach((prato, index) => {
        const tr = document.createElement('tr');
        
        let tds = `<td>
            <input type="text" class="prato-name-input" value="${prato.name}" onchange="updatePratoName(${index}, this.value)">
        </td>`;
        
        pracasCols.forEach(praca => {
            const pracaObj = prato.pracas.find(p => (typeof p === 'string' ? p : p.name) === praca);
            const isChecked = !!pracaObj;
            const delayVal = pracaObj && typeof pracaObj !== 'string' ? (pracaObj.delay || 0) : 0;
            
            tds += `
                <td style="text-align:center;">
                    <input type="checkbox" class="praca-checkbox" 
                           ${isChecked ? 'checked' : ''} 
                           onchange="togglePraca(${index}, '${praca}')">
                    <br/>
                    <input type="number" placeholder="s" 
                           style="width: 50px; font-size: 0.8rem; margin-top: 4px; display: ${isChecked ? 'inline-block' : 'none'};"
                           value="${delayVal}"
                           title="Atraso em Segundos"
                           onchange="updatePracaDelay(${index}, '${praca}', this.value)">
                </td>
            `;
        });
        
        tds += `<td><button class="remove-btn" onclick="removePrato(${index})">🗑️</button></td>`;
        tr.innerHTML = tds;
        tbody.appendChild(tr);
    });

    list.appendChild(table);

    // Formulário para adicionar prato novo
    const addForm = document.createElement('div');
    addForm.className = 'add-item-form';
    addForm.innerHTML = `
        <input type="text" id="new-prato-name" placeholder="Ex: Risoto de Camarão" onkeydown="if(event.key==='Enter') addPrato()">
        <button onclick="addPrato()">+ Novo Prato</button>
    `;
    list.appendChild(addForm);
}

window.togglePraca = function(pratoIndex, pracaName) {
    const prato = state.config.pratos[pratoIndex];
    const existingIndex = prato.pracas.findIndex(p => (typeof p === 'string' ? p : p.name) === pracaName);
    
    if (existingIndex >= 0) {
        prato.pracas.splice(existingIndex, 1);
    } else {
        prato.pracas.push({ name: pracaName, delay: 0 });
    }
    renderSettings();
};

window.updatePracaDelay = function(pratoIndex, pracaName, delayValue) {
    const prato = state.config.pratos[pratoIndex];
    const existingIndex = prato.pracas.findIndex(p => (typeof p === 'string' ? p : p.name) === pracaName);
    
    if (existingIndex >= 0) {
        if (typeof prato.pracas[existingIndex] === 'string') {
            prato.pracas[existingIndex] = { name: pracaName, delay: parseInt(delayValue) || 0 };
        } else {
            prato.pracas[existingIndex].delay = parseInt(delayValue) || 0;
        }
    }
};

window.removePrato = function(index) {
    state.config.pratos.splice(index, 1);
    renderSettings();
};

window.updatePratoName = function(index, newName) {
    if (!newName.trim()) return;
    state.config.pratos[index].name = newName.trim();
};

window.updatePracaName = function(oldName, newName) {
    if (!newName.trim() || oldName === newName) return;
    
    const index = state.config.pracas.indexOf(oldName);
    if (index !== -1) {
        state.config.pracas[index] = newName.trim();
    }
    
    state.config.pratos.forEach(prato => {
        const pracaIndex = prato.pracas.findIndex(p => (typeof p === 'string' ? p : p.name) === oldName);
        if (pracaIndex !== -1) {
            if (typeof prato.pracas[pracaIndex] === 'string') {
                prato.pracas[pracaIndex] = newName.trim();
            } else {
                prato.pracas[pracaIndex].name = newName.trim();
            }
        }
    });
    
    renderSettings();
};

window.addPraca = function() {
    const name = prompt("Nome da nova Praça:");
    if (name && name.trim()) {
        if (!state.config.pracas) state.config.pracas = [];
        if (!state.config.pracas.includes(name.trim())) {
            state.config.pracas.push(name.trim());
            renderSettings();
        }
    }
};

window.removePraca = function(pracaName) {
    if (confirm(`Tem certeza que deseja excluir a praça "${pracaName}"?`)) {
        state.config.pracas = state.config.pracas.filter(p => p !== pracaName);
        state.config.pratos.forEach(prato => {
            prato.pracas = prato.pracas.filter(p => (typeof p === 'string' ? p : p.name) !== pracaName);
        });
        renderSettings();
    }
};

window.addPrato = function(name = null) {
    let pratoName = name;
    if (!pratoName) {
        const input = document.getElementById('new-prato-name');
        pratoName = input.value.trim();
        input.value = '';
    }
    
    if (pratoName) {
        if (!state.config.pratos) state.config.pratos = [];
        state.config.pratos.push({ name: pratoName, pracas: [] });
        renderSettings();
    }
};

window.addUnknownToMenu = function(itemName) {
    addPrato(itemName);
};

async function saveSettings() {
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = "⏳ Salvando...";
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.config)
        });
        if (res.ok) {
            btn.innerText = "✅ Salvo com Sucesso!";
            setTimeout(() => { btn.innerText = "💾 Salvar Configurações"; }, 2000);
            await fetchPracas(); // Atualiza os menus do topo
            renderSettings(); // Re-renderiza a tela para garantir sync visual
        }
    } catch (err) {
        alert('Erro ao salvar as configurações.');
        btn.innerText = "💾 Salvar Configurações";
    }
}

// Inicia
init();
