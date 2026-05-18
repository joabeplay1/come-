import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction, get, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuração oficial do seu Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCZ4rOliexofYP8vyRLzUeX3mf5uXG6WRM",
    authDomain: "aposta-96213.firebaseapp.com",
    databaseURL: "https://aposta-96213-default-rtdb.firebaseio.com",
    projectId: "aposta-96213",
    storageBucket: "aposta-96213.firebasestorage.app",
    messagingSenderId: "989060185373",
    appId: "1:989060185373:web:69bb80b2f961fe8e9d35f4",
    measurementId: "G-1LTXVCXHX5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let activeRoomCode = null;
let currentMode = "1x1";
let myLocalRole = "p1"; 
let isLobbyTestingMode = true;

document.addEventListener('DOMContentLoaded', () => {
    // Injeção dinâmica do campo de busca por Nome/ID no HTML da aba se ele não existir
    injectSearchInputIntoDOM();

    // Exibe a aba de forma pública e limpa no Lobby para testes imediatos
    document.getElementById('bet-central-panel').classList.remove('hidden');
    renderDynamicPlayersGrid(null);

    // Sistema de colapso do painel superior
    const headerToggle = document.getElementById('bet-panel-toggle');
    const bodyContent = document.getElementById('bet-panel-content');
    const minimizeBtn = document.getElementById('btn-minimize-bet-panel');

    if (headerToggle && bodyContent) {
        const togglePanel = (e) => {
            e.stopPropagation();
            bodyContent.classList.toggle('collapsed');
            if (minimizeBtn) {
                minimizeBtn.innerText = bodyContent.classList.contains('collapsed') ? '🗖' : '—';
            }
        };
        headerToggle.onclick = togglePanel;
        if (minimizeBtn) minimizeBtn.onclick = togglePanel;
    }

    // Gerenciador de Modos com Split de Lucros Dinâmicos
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.onchange = (e) => {
            currentMode = e.target.value;
            updatePayoutInstructionBanner();
            if (activeRoomCode && myLocalRole === 'p1') {
                set(ref(db, `rooms/${activeRoomCode}/matchMode`), currentMode);
            } else if (isLobbyTestingMode) {
                renderDynamicPlayersGrid(null);
            }
        };
    }

    const confirmBtn = document.getElementById('btn-confirm-my-bet');
    if (confirmBtn) confirmBtn.onclick = handleMyBetConfirmation;

    // Monitoramento contínuo da sala
    setInterval(detectActiveGameRoom, 1500);
});

// Injeta dinamicamente o input de busca por ID/Nome mantendo o visual premium
function injectSearchInputIntoDOM() {
    const body = document.getElementById('bet-panel-content');
    if (!body || document.getElementById('bet-player-search-box')) return;

    const searchBox = document.createElement('div');
    searchBox.className = "game-mode-selector-box";
    searchBox.style.marginTop = "10px";
    searchBox.innerHTML = `
        <label>BUSCAR E ADICIONAR ADVERSÁRIO POR NOME OU ID:</label>
        <div style="display:flex; gap:8px;">
            <input type="text" id="bet-player-search-box" placeholder="Digite o apelido exato (Ex: Joabe Play)" 
                   style="flex:1; background:#000; border:1px solid rgba(212,175,55,0.3); padding:0.5rem; border-radius:8px; color:#fff; font-size:0.85rem;">
            <button id="btn-bet-search-add" style="background:#d4af37; color:#000; border:none; padding:0 15px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.8rem;">Adicionar</button>
        </div>
    `;
    // Insere logo abaixo do seletor de modos de partida
    body.insertBefore(searchBox, body.children[1]);

    document.getElementById('btn-bet-search-add').onclick = performPlayerSearchAndQuery;
}

// API de Busca Atômica: Localiza o perfil financeiro do oponente e valida vaga na mesa
function performPlayerSearchAndQuery() {
    const queryName = document.getElementById('bet-player-search-box').value.trim();
    if (!queryName) return alert("Digite um apelido para buscar!");

    if (isLobbyTestingMode) {
        return alert(`Perfil de "${queryName}" localizado! Crie uma sala premium para puxar esse jogador para a mesa real.`);
    }

    const targetFinanceId = btoa(queryName).replace(/=/g, "");
    
    // Varre o nó de finanças do Firebase para verificar se o perfil buscado existe
    get(ref(db, `finances/${targetFinanceId}`)).then((snapshot) => {
        if (!snapshot.exists()) {
            return alert("Jogador não encontrado ou sem carteira ativa no sistema.");
        }
        
        const opponentFinance = snapshot.val();
        addSearchedPlayerToRoom(queryName, opponentFinance.available);
    });
}

function addSearchedPlayerToRoom(playerName, availableBalance) {
    const roomRef = ref(db, `rooms/${activeRoomCode}`);
    
    runTransaction(roomRef, (room) => {
        if (!room) return room;

        // Proteção antifraude: Impede duplicidade do mesmo jogador na mesa
        for (let i = 1; i <= 4; i++) {
            if (room[`p${i}`] && room[`p${i}`].name === playerName) return;
        }

        const maxSlots = (currentMode === "1x1") ? 2 : 4;
        for (let i = 1; i <= maxSlots; i++) {
            if (!room[`p${i}`] || !room[`p${i}`].name) {
                room[`p${i}`] = {
                    name: playerName,
                    betIntent: parseFloat(document.getElementById('wallet-current-bet')?.innerText.replace('R$', '').replace(',', '.').trim() || "20.00"),
                    betConfirmed: false,
                    cachedBalance: availableBalance, // Espelha o saldo disponível para auditoria pública da mesa
                    status: "Conectado"
                };
                break;
            }
        }
        return room;
    }).then(() => {
        document.getElementById('bet-player-search-box').value = '';
    });
}

function updatePayoutInstructionBanner() {
    const titleMode = document.getElementById('bet-prize-title-mode');
    if (!titleMode) return;
    
    if (currentMode === '1x1') titleMode.innerHTML = "⚔️ MODO 1x1 — VENCEDOR LEVA TUDO <br><small style='color:#8a9a92; font-weight:normal;'>O ganhador da mesa recebe 100% do prêmio. Fundos retornam se houver cancelamento.</small>";
    if (currentMode === 'solo') titleMode.innerHTML = "💀 MATA-MATA (TODOS CONTRA TODOS) — CAMPEÃO LEVA TUDO <br><small style='color:#8a9a92; font-weight:normal;'>4 Jogadores individuais. O vencedor recebe o montante integral na carteira.</small>";
    if (currentMode === 'duplas') titleMode.innerHTML = "👑 CLÁSSICO EM DUPLAS (2x2) — DIVISÃO AUTOMÁTICA <br><small style='color:#8a9a92; font-weight:normal;'>Prêmio total somado e dividido igualmente (50% / 50%) para a dupla vencedora.</small>";
}

function detectActiveGameRoom() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") {
        isLobbyTestingMode = true;
        return;
    }

    if (activeRoomCode !== code) {
        activeRoomCode = code;
        isLobbyTestingMode = false;
        
        onValue(ref(db, `rooms/${activeRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (room) syncBetPanelState(room);
        });
    }
}

function syncBetPanelState(room) {
    const currentName = document.getElementById('player-name')?.value.trim();
    
    myLocalRole = null;
    for (let i = 1; i <= 4; i++) {
        if (room[`p${i}`] && room[`p${i}`].name === currentName) {
            myLocalRole = `p${i}`;
            break;
        }
    }

    currentMode = room.matchMode || "1x1";
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.value = currentMode;
        modeSelect.disabled = (myLocalRole !== 'p1'); 
    }

    updatePayoutInstructionBanner();
    renderDynamicPlayersGrid(room);
}

function renderDynamicPlayersGrid(room) {
    const container = document.getElementById('bet-grid-players-container');
    if (!container) return;
    container.innerHTML = '';

    const slotsCount = (currentMode === "1x1") ? 2 : 4;
    let totalAccumulatedPrize = 0;
    let allBetsEqual = true;
    let referenceBet = null;
    let pendingConfirmations = 0;
    let totalPlayersConnected = 0;
    let balanceErrorDetected = false;

    const mockName = document.getElementById('player-name')?.value.trim() || "Joabe Play";
    const currentWalletBetStr = document.getElementById('wallet-current-bet')?.innerText || "R$ 20,00";
    const currentBetNum = parseFloat(currentWalletBetStr.replace('R$', '').replace(',', '.').trim());

    for (let i = 1; i <= slotsCount; i++) {
        const card = document.createElement('div');
        card.className = "bet-player-card";

        if (isLobbyTestingMode) {
            if (i === 1) {
                totalPlayersConnected++;
                totalAccumulatedPrize += currentBetNum;
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name">👤 Slot 1: ${mockName} (Você)</span>
                        <span class="p-grid-bet">Aposta: R$ ${currentBetNum.toFixed(2).replace('.', ',')}</span>
                        <span class="p-grid-status" style="color:#ef4444">Falta Confirmar</span>
                    </div>
                    <div class="status-indicator-icon">❌</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name" style="color:#555">👤 Slot ${i}: Livre para Busca</span>
                        <span class="p-grid-bet">R$ 0,00</span>
                    </div>
                    <div class="status-indicator-icon">⏳</div>
                `;
            }
            container.appendChild(card);
            continue;
        }

        const player = room ? room[`p${i}`] : null;

        if (player && player.name) {
            totalPlayersConnected++;
            const betVal = player.betIntent || 20.00;
            totalAccumulatedPrize += betVal;

            if (referenceBet === null) referenceBet = betVal;
            else if (betVal !== referenceBet) allBetsEqual = false;

            const isConfirmed = !!player.betConfirmed;
            if (!isConfirmed) pendingConfirmations++;
            
            // VERIFICAÇÃO EM TEMPO REAL DE SALDO DA CARTEIRA
            const pBalance = player.cachedBalance || 0;
            const hasSufficientFunds = pBalance >= betVal || isConfirmed;
            if (!hasSufficientFunds) balanceErrorDetected = true;

            if (isConfirmed) card.classList.add('confirmed');

            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name">👤 Slot ${i}: ${player.name} ${player.name === mockName ? '(Você)' : ''}</span>
                    <span class="p-grid-bet">Saldo Disp: <b style="color:#22c55e">R$ ${pBalance.toFixed(2)}</b> | Aposta: R$ ${betVal.toFixed(2)}</span>
                    <span class="p-grid-status" style="color:${!hasSufficientFunds ? '#ef4444' : isConfirmed ? '#22c55e' : '#eab308'}">
                        ${!hasSufficientFunds ? '❌ Saldo Insuficiente para Entrada' : isConfirmed ? 'Fundo Bloqueado/Confirmado ✅' : 'Aguardando Bloqueio de Fundo'}
                    </span>
                </div>
                <div class="status-indicator-icon">${!hasSufficientFunds ? '⚠️' : isConfirmed ? '✅' : '❌'}</div>
            `;
        } else {
            allBetsEqual = false;
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name" style="color:#6b7280">👤 Slot ${i}: Vago</span>
                    <span class="p-grid-bet">Aguardando entrada por busca...</span>
                </div>
                <div class="status-indicator-icon">⏳</div>
            `;
        }
        container.appendChild(card);
    }

    const prizeDisplay = document.getElementById('bet-prize-total-val');
    if (prizeDisplay) {
        const finalPrizeValue = isLobbyTestingMode ? (slotsCount * currentBetNum) : totalAccumulatedPrize;
        prizeDisplay.innerText = `PRÊMIO TOTAL ACUMULADO: R$ ${finalPrizeValue.toFixed(2).replace('.', ',')}`;
    }

    const banner = document.getElementById('bet-panel-validation-banner');
    const mainStartBtn = document.getElementById('btn-create-room');

    if (isLobbyTestingMode) return;

    if (totalPlayersConnected < slotsCount) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Aguardando inclusão de todos os ${slotsCount} jogadores via busca para processar caixa...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (balanceErrorDetected) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Operação Bloqueada: Existem jogadores com saldo insuficiente para cobrir o valor dessa aposta.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (!allBetsEqual) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Incompatibilidade de Valores: Todos os participantes precisam parear e casar a mesma quantia.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (pendingConfirmations > 0) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Fundos auditados! Aguardando o bloqueio temporário e confirmação manual de ${pendingConfirmations} jogadores...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else {
        banner.className = "bet-banner-status bet-banner-success";
        banner.innerText = "✅ Perfeito! Todos os saldos foram reservados/bloqueados em segurança. Mesa pronta.";
        if (mainStartBtn) mainStartBtn.disabled = false;
    }

    const myBtn = document.getElementById('btn-confirm-my-bet');
    if (myBtn && myLocalRole && room) {
        const iHaveConfirmed = room[myLocalRole]?.betConfirmed;
        myBtn.disabled = !allBetsEqual || (totalPlayersConnected < slotsCount) || balanceErrorDetected || iHaveConfirmed;
        myBtn.innerText = iHaveConfirmed ? "Fundo Reservado com Sucesso" : "Confirmar e Bloquear Aposta";
    }
}

// RESERVA DE FUNDOS ATÔMICA COM HISTÓRICO DE AUDITORIA COMPLETO
function handleMyBetConfirmation() {
    if (isLobbyTestingMode) return alert("Simulação de confirmação concluída com sucesso no Lobby!");
    if (!activeRoomCode || !myLocalRole) return;

    const currentBetString = document.getElementById('wallet-current-bet')?.innerText || "R$ 20,00";
    const betAmount = parseFloat(currentBetString.replace('R$', '').replace(',', '.').trim());

    const currentName = document.getElementById('player-name')?.value.trim();
    const myFinanceId = btoa(currentName).replace(/=/g, "");

    const financeRef = ref(db, `finances/${myFinanceId}`);
    const logsRef = ref(db, `finances/${myFinanceId}/history`);

    runTransaction(financeRef, (account) => {
        if (!account) return account;
        if (account.available < betAmount) {
            alert("Saldo insuficiente na carteira para realizar o bloqueio do fundo.");
            return;
        }
        // Executa o bloqueio preventivo de segurança na carteira digital
        account.available -= betAmount;
        account.locked += betAmount;
        return account;
    }).then((result) => {
        if (result.committed) {
            // Registra a operação detalhada no histórico de transações da carteira do perfil
            const logEntry = push(logsRef);
            set(logEntry, {
                type: "Confirmação/Bloqueio Aposta",
                amount: betAmount,
                timestamp: Date.now(),
                room: activeRoomCode,
                status: "Reservado"
            });

            // Atualiza a mesa no nó da partida
            set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betConfirmed`), true);
        }
    });
}
