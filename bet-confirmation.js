import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuração padrão do seu Firebase
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
let myLocalRole = "p1"; // Define p1 por padrão no Lobby para liberar os testes locais
let isLobbyTestingMode = true;

document.addEventListener('DOMContentLoaded', () => {
    const headerToggle = document.getElementById('bet-panel-toggle');
    const bodyContent = document.getElementById('bet-panel-content');
    const minimizeBtn = document.getElementById('btn-minimize-bet-panel');

    // Força o painel a ficar visível e público de cara na tela inicial (Lobby)
    const centralPanel = document.getElementById('bet-central-panel');
    if (centralPanel) centralPanel.classList.remove('hidden');
    
    // Inicializa a grade pública exibindo as cadeiras prontas para os players
    renderDynamicPlayersGrid(null); 

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

    // Controle de troca de Modos de Jogo com exibição da divisão de prêmios
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.onchange = (e) => {
            currentMode = e.target.value;
            updatePayoutInstructionBanner();
            
            if (activeRoomCode && myLocalRole === 'p1') {
                set(ref(db, `rooms/${activeRoomCode}/matchMode`), currentMode);
            } else if (isLobbyTestingMode) {
                renderDynamicPlayersGrid(null); // Atualiza os slots públicos do lobby na hora
            }
        };
    }

    const confirmBtn = document.getElementById('btn-confirm-my-bet');
    if (confirmBtn) confirmBtn.onclick = handleMyBetConfirmation;

    // Ativa o vínculo para adicionar jogadores clicando na barra de monitoramento
    injectSidebarInviteMechanic();

    setInterval(detectActiveGameRoom, 1500);
});

// Mecanismo de Convite: Vincula a barra lateral direita de monitoramento para puxar o player para as cadeiras do meio
function injectSidebarInviteMechanic() {
    const sidebarList = document.getElementById('online-players-list');
    if (!sidebarList) return;

    sidebarList.addEventListener('click', (e) => {
        const clickedItem = e.target.closest('.player-item');
        if (!clickedItem) return;

        const invitedName = clickedItem.querySelector('.p-name')?.innerText.replace('(Você)', '').trim();
        if (!invitedName) return;

        if (isLobbyTestingMode) {
            alert(`Para convidar ${invitedName}, crie uma Mesa Premium ou entre em um código de sala primeiro.`);
            return;
        }

        if (myLocalRole === 'p1') {
            invitePlayerToFirebaseRoom(invitedName);
        }
    });
}

function invitePlayerToFirebaseRoom(playerName) {
    if (!activeRoomCode) return;
    const roomRef = ref(db, `rooms/${activeRoomCode}`);
    
    runTransaction(roomRef, (room) => {
        if (!room) return room;
        
        // Verifica se o jogador já está inserido em alguma cadeira para evitar duplicados
        for (let i = 1; i <= 4; i++) {
            if (room[`p${i}`] && room[`p${i}`].name === playerName) return;
        }

        // Procura o primeiro slot livre de p1 a p4 para sentar o jogador convidado
        const maxSlots = (currentMode === "1x1") ? 2 : 4;
        for (let i = 1; i <= maxSlots; i++) {
            if (!room[`p${i}`] || !room[`p${i}`].name) {
                room[`p${i}`] = {
                    name: playerName,
                    betIntent: parseFloat(document.getElementById('wallet-current-bet')?.innerText.replace('R$', '').replace(',', '.').trim() || "20.00"),
                    betConfirmed: false,
                    status: "Conectado"
                };
                break;
            }
        }
        return room;
    });
}

function updatePayoutInstructionBanner() {
    const titleMode = document.getElementById('bet-prize-title-mode');
    if (!titleMode) return;
    
    if (currentMode === '1x1') titleMode.innerHTML = "⚔️ 1x1 — VENCEDOR LEVA TUDO <br><small style='color:#8a9a92; font-weight:normal;'>O ganhador da mesa recebe 100% do prêmio acumulado.</small>";
    if (currentMode === 'solo') titleMode.innerHTML = "💀 MATA-MATA SOLO — VENCEDOR LEVA TUDO <br><small style='color:#8a9a92; font-weight:normal;'>Partida individual de 4 players. O campeão raspa a mesa sozinho.</small>";
    if (currentMode === 'duplas') titleMode.innerHTML = "👑 CLÁSSICO EM DUPLAS — DIVISÃO 50/50 <br><small style='color:#8a9a92; font-weight:normal;'>Aposta dividida igualmente (50% para cada) entre os parceiros da dupla vitoriosa.</small>";
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

    const mockName = document.getElementById('player-name')?.value.trim() || "Joabe Play";
    const currentWalletBetStr = document.getElementById('wallet-current-bet')?.innerText || "R$ 20,00";
    const currentBetNum = parseFloat(currentWalletBetStr.replace('R$', '').replace(',', '.').trim());

    for (let i = 1; i <= slotsCount; i++) {
        const card = document.createElement('div');
        card.className = "bet-player-card";

        // MODO LOBBY PÚBLICO: Abre as cadeiras vinculadas à sua carteira lateral para testes imediatos
        if (isLobbyTestingMode) {
            if (i === 1) {
                totalPlayersConnected++;
                totalAccumulatedPrize += currentBetNum;
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name">👤 Slot 1: ${mockName} (Você)</span>
                        <span class="p-grid-bet">Valor da Chave: R$ ${currentBetNum.toFixed(2).replace('.', ',')}</span>
                        <span class="p-grid-status" style="color:#ef4444">Aguardando Confirmação</span>
                    </div>
                    <div class="status-indicator-icon">❌</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name" style="color:#8a9a92">👤 Slot ${i}: Aguardando Jogador...</span>
                        <span class="p-grid-bet">R$ 0,00</span>
                    </div>
                    <div class="status-indicator-icon">⏳</div>
                `;
            }
            container.appendChild(card);
            continue;
        }

        // MODO DE JOGO REAL SINCRONIZADO: Mapeia as 4 cadeiras reais do Firebase Room (p1, p2, p3, p4)
        const player = room ? room[`p${i}`] : null;

        if (player && player.name) {
            totalPlayersConnected++;
            const betVal = player.betIntent || 20.00;
            totalAccumulatedPrize += betVal;

            if (referenceBet === null) referenceBet = betVal;
            else if (betVal !== referenceBet) allBetsEqual = false;

            const isConfirmed = !!player.betConfirmed;
            if (!isConfirmed) pendingConfirmations++;
            if (isConfirmed) card.classList.add('confirmed');

            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name">👤 Slot ${i}: ${player.name} ${player.name === mockName ? '(Você)' : ''}</span>
                    <span class="p-grid-bet">Retirado da Carteira: R$ ${betVal.toFixed(2).replace('.', ',')}</span>
                    <span class="p-grid-status" style="color:${isConfirmed ? '#22c55e' : '#eab308'}">
                        ${isConfirmed ? 'Aposta Confirmada' : 'Pendente de Confirmação'}
                    </span>
                </div>
                <div class="status-indicator-icon">${isConfirmed ? '✅' : '❌'}</div>
            `;
        } else {
            allBetsEqual = false;
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name" style="color:#6b7280">👤 Slot ${i}: Vago</span>
                    <span class="p-grid-bet">Aguardando entrada de jogador...</span>
                </div>
                <div class="status-indicator-icon">⏳</div>
            `;
        }
        container.appendChild(card);
    }

    // Sincroniza e atualiza o Prêmio Total Acumulado no display central da aba do meio
    const prizeDisplay = document.getElementById('bet-prize-total-val');
    if (prizeDisplay) {
        const finalPrizeValue = isLobbyTestingMode ? (slotsCount * currentBetNum) : totalAccumulatedPrize;
        prizeDisplay.innerText = `PRÊMIO TOTAL: R$ ${finalPrizeValue.toFixed(2).replace('.', ',')}`;
    }

    // BANNER DE REGRAS E BLOQUEIOS MECÂNICOS DE VALIDAÇÃO
    const banner = document.getElementById('bet-panel-validation-banner');
    const mainStartBtn = document.getElementById('btn-create-room');

    if (isLobbyTestingMode) {
        if (banner) {
            banner.className = "bet-banner-status bet-banner-error";
            banner.innerText = "Painel Público Ativo! Modifique o valor na sua carteira lateral (💰) para espelhar e alterar o prêmio aqui.";
        }
        return;
    }

    if (totalPlayersConnected < slotsCount) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Aguardando entrada de todos os ${slotsCount} jogadores na mesa para liberar as confirmações...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (!allBetsEqual) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Incompatibilidade de Aposta: Os jogadores precisam definir exatamente o mesmo valor na carteira para liberar a mesa.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (pendingConfirmations > 0) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Apostas compatíveis! Falta a confirmação manual de ${pendingConfirmations} jogadores.`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else {
        banner.className = "bet-banner-status bet-banner-success";
        banner.innerText = "✅ Excelente! Todos os jogadores confirmaram os fundos. Partida liberada para o Start.";
        if (mainStartBtn) mainStartBtn.disabled = false;
    }

    // Trata desabilitação do botão de confirmação individual local
    const myBtn = document.getElementById('btn-confirm-my-bet');
    if (myBtn && myLocalRole && room) {
        const iHaveConfirmed = room[myLocalRole]?.betConfirmed;
        myBtn.disabled = !allBetsEqual || (totalPlayersConnected < slotsCount) || iHaveConfirmed;
        myBtn.innerText = iHaveConfirmed ? "Você Confirmou seu Lance ✅" : "Confirmar Minha Aposta";
    }
}

function handleMyBetConfirmation() {
    const currentBetString = document.getElementById('wallet-current-bet')?.innerText || "R$ 20,00";
    const betAmount = parseFloat(currentBetString.replace('R$', '').replace(',', '.').trim());

    if (isLobbyTestingMode) {
        // Mock de verificação imediata para testes visuais rápidos no Lobby público
        const firstCheck = document.querySelector('.bet-player-card .status-indicator-icon');
        if(firstCheck) firstCheck.innerText = "✅";
        const firstStatusText = document.querySelector('.bet-player-card .p-grid-status');
        if(firstStatusText) { firstStatusText.innerText = "Aposta Confirmada"; firstStatusText.style.color = "#22c55e"; }
        alert(`Aposta de R$ ${betAmount.toFixed(2)} confirmada e deduzida no ambiente de testes públicos do Lobby!`);
        return;
    }

    if (!activeRoomCode || !myLocalRole) return;

    const currentName = document.getElementById('player-name')?.value.trim();
    const myFinanceId = btoa(currentName).replace(/=/g, "");

    runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
        if (!account) return account;
        if (account.available < betAmount) {
            alert("Saldo insuficiente na carteira para confirmar essa aposta!");
            return;
        }
        account.available -= betAmount;
        account.locked += betAmount;
        return account;
    }).then((result) => {
        if (result.committed) {
            set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betConfirmed`), true);
        }
    });
}
