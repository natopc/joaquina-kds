// Estado Global
let state = {
    pracas: [],
    currentPraca: 'Geral',
    currentView: 'traditional', // 'traditional' | 'aggregated' | 'settings'
    orders: [],
    config: {} // Armazena a configuração bruta das praças
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
    const btns = document.querySelectorAll('.view-btn');
    const settingsBtn = document.getElementById('btn-settings');
    const allBtns = [...btns, settingsBtn];

    allBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            allBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            state.currentView = e.target.dataset.view || 'settings';
            
            document.querySelectorAll('.view-container').forEach(c => c.classList.remove('active'));
            document.getElementById(`${state.currentView}-view`).classList.add('active');
            
            if (state.currentView === 'settings') {
                renderSettings();
            } else {
                renderCurrentView();
            }
        });
    });

    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
}

// Busca a lista de praças do servidor (agora vem a config inteira)
async function fetchPracas() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        state.config = data;
        state.pracas = ['Geral', ...(data.pracas || [])];
        renderStationsNav();
    } catch (err) {
        console.error("Erro ao buscar praças:", err);
    }
}

// Renderiza o menu superior de navegação de praças
function renderStationsNav() {
    const nav = document.getElementById('stations-nav');
    nav.innerHTML = '';
    
    state.pracas.forEach(praca => {
        const btn = document.createElement('button');
        btn.className = `station-btn ${praca === state.currentPraca ? 'active' : ''}`;
        btn.innerText = praca;
        btn.addEventListener('click', () => {
            state.currentPraca = praca;
            renderStationsNav();
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
    
    // Apenas pedidos pendentes, invertendo para o mais recente aparecer primeiro
    const pendingOrders = state.orders.filter(o => o.status === 'pending').reverse();
    
    pendingOrders.forEach(order => {
        // Filtra os itens desse pedido que pertencem à praça selecionada (ou todos se 'Geral')
        let itemsToShow = order.items.filter(i => state.currentPraca === 'Geral' || i.praca === state.currentPraca);
        
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
        card.className = 'order-card';
        
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
            if (!item.completed) {
                itemEl.addEventListener('click', () => {
                    if (item.allIds) {
                        item.allIds.forEach(id => completeItem(order.id, id));
                    } else {
                        completeItem(order.id, item.id);
                    }
                });
            }
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
        order.items.forEach(item => {
            // Conta apenas se não estiver completo e pertencer à praça selecionada
            if (!item.completed && (state.currentPraca === 'Geral' || item.praca === state.currentPraca)) {
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
            const isChecked = prato.pracas.includes(praca);
            tds += `
                <td style="text-align:center;">
                    <input type="checkbox" class="praca-checkbox" 
                           ${isChecked ? 'checked' : ''} 
                           onchange="togglePraca(${index}, '${praca}')">
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
    if (prato.pracas.includes(pracaName)) {
        prato.pracas = prato.pracas.filter(p => p !== pracaName);
    } else {
        prato.pracas.push(pracaName);
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
        const pracaIndex = prato.pracas.indexOf(oldName);
        if (pracaIndex !== -1) {
            prato.pracas[pracaIndex] = newName.trim();
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
            prato.pracas = prato.pracas.filter(p => p !== pracaName);
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
