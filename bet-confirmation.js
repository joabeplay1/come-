import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
let myLocalRole = "p1"; // Define p1 por padrão no Lobby para liberar os testes da aba

document.addEventListener('DOMContentLoaded', () => {
    const headerToggle = document.getElementById('bet-panel-toggle');
    const bodyContent = document.getElementById('bet-panel-content');
    const minimizeBtn = document.getElementById('btn-minimize-bet-panel');

    // EXIBE MANDATORIAMENTE A ABA CENTRAL NO LOBBY PARA TESTE VISUAL
    document.getElementById('bet-central-panel').classList.remove('hidden');
    renderMockPlayersGrid(); // Renderiza dados de demonstração iniciais imediatamente

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

    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.onchange = (e) => {
            currentMode = e.target.value;
            const titleMode = document.getElementById('bet-prize-title-mode');
            if (currentMode === '1x1') titleMode.innerText = "⚔️ MODO 1x1 — VENCEDOR LEVA TUDO";
            if (currentMode === 'solo') titleMode.innerText = "💀 MODO MATA-MATA — VENCEDOR LEVA TUDO";
            if (currentMode === 'duplas') titleMode.innerText = "👑 MODO CLÁSSICO — PRÊMIO DIVIDIDO ENTRE A DUPLA";
            
            if (activeRoomCode) {
                set(ref(db, `rooms/${activeRoomCode}/matchMode`), currentMode);
            } else {
                renderMockPlayersGrid(); // Atualiza a visualização do mock no lobby
            }
        };
    }

    const confirmBtn = document.getElementById('btn-confirm-my-bet');
    if (confirmBtn) confirmBtn.onclick = handleMyBetConfirmation;

    setInterval(detectActiveGameRoom, 2000);
});

function detectActiveGameRoom() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") return; // Mantém no modo de demonstração do lobby

    if (activeRoomCode !== code) {
        activeRoomCode = code;
        onValue(ref(db, `rooms/${activeRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (room) syncBetPanelState(room);
        });
    }
}

function syncBetPanelState(room) {
    const currentName = document.getElementById('player-name')?.value.trim();
    if (room.p1 && room.p1.name === currentName) myLocalRole = 'p1';
    else if (room.p2 && room.p2.name === currentName) myLocalRole = 'p2';
    else if (room.p3 && room.p3.name === currentName) myLocalRole = 'p3';
    else if (room.p4 && room.p4.name === currentName) myLocalRole = 'p4';

    currentMode = room.matchMode || "1x1";
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.value = currentMode;
        modeSelect.disabled = (myLocalRole !== 'p1');
    }

    const titleMode = document.getElementById('bet-prize-title-mode');
    if (currentMode === '1x1') titleMode.innerText = "⚔️ MODO 1x1 — VENCEDOR LEVA TUDO";
    if (currentMode === 'solo') titleMode.innerText = "💀 MODO MATA-MATA — VENCEDOR LEVA TUDO";
    if (currentMode === 'duplas') titleMode.innerText = "👑 MODO CLÁSSICO — PRÊMIO DIVIDIDO ENTRE A DUPLA";

    renderPlayersGrid(room);
}

// Renderizador de Demonstração (Ativo no Lobby para você visualizar as mudanças de modo imediatamente)
function renderMockPlayersGrid() {
    const container = document.getElementById('bet-grid-players-container');
    container.innerHTML = '';
    const slotsCount = (currentMode === '1x1') ? 2 : 4;
    const mockName = document.getElementById('player-name')?.value.trim() || "Joabe Play";

    for (let i = 1; i <= slotsCount; i++) {
        const card = document.createElement('div');
        card.className = "bet-player-card";
        
        if(i === 1) {
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name">${mockName} (Você)</span>
                    <span class="p-grid-bet">Aposta: R$ 20,00</span>
                    <span class="p-grid-status" style="color:#ef4444">Aguardando Confirmação</span>
                </div>
                <div class="status-indicator-icon">❌</div>
            `;
        } else {
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name" style="color:#8a9a92">Aguardando Player...</span>
                    <span class="p-grid-bet">R$ 0,00</span>
                </div>
                <div class="status-indicator-icon">⏳</div>
            `;
        }
        container.appendChild(card);
    }
    document.getElementById('bet-prize-total-val').innerText = `PRÊMIO TOTAL: R$ ${(slotsCount * 20).toFixed(2).replace('.', ',')}`;
    document.getElementById('bet-panel-validation-banner').innerText = "Aba rodando em modo de espera no lobby. Digite um código de mesa ou crie uma sala para parear.";
}

function renderPlayersGrid(room) {
    const container = document.getElementById('bet-grid-players-container');
    container.innerHTML = '';

    const slotsCount = (currentMode === '1x1') ? 2 : 4;
    let totalAccumulatedPrize = 0;
    let allBetsEqual = true;
    let referenceBet = null;
    let pendingConfirmations = 0;
    let totalPlayersConnected = 0;

    for (let i = 1; i <= slotsCount; i++) {
        const player = room[`p${i}`];
        const card = document.createElement('div');
        card.className = "bet-player-card";

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
                    <span class="p-grid-name">${player.name}</span>
                    <span class="p-grid-bet">Aposta: R$ ${betVal.toFixed(2)}</span>
                    <span class="p-grid-status" style="color:${isConfirmed ? '#22c55e' : '#ef4444'}">
                        ${isConfirmed ? 'Aposta Confirmada' : 'Aguardando Confirmação'}
                    </span>
                </div>
                <div class="status-indicator-icon">${isConfirmed ? '✅' : '❌'}</div>
            `;
        } else {
            allBetsEqual = false;
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name" style="color:#555">Vago</span>
                    <span class="p-grid-bet">R$ 0,00</span>
                </div>
                <div class="status-indicator-icon">⏳</div>
            `;
        }
        container.appendChild(card);
    }

    document.getElementById('bet-prize-total-val').innerText = `PRÊMIO TOTAL: R$ ${totalAccumulatedPrize.toFixed(2).replace('.', ',')}`;

    const banner = document.getElementById('bet-panel-validation-banner');
    const mainStartBtn = document.getElementById('btn-create-room');

    if (totalPlayersConnected < slotsCount) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Aguardando todos os ${slotsCount} jogadores entrarem na mesa...`;
    } else if (!allBetsEqual) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Os jogadores precisam apostar o mesmo valor para iniciar a partida.";
    } else if (pendingConfirmations > 0) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Valores compatíveis! Aguardando ${pendingConfirmations} confirmações manuais...`;
    } else {
        banner.className = "bet-banner-status bet-banner-success";
        banner.innerText = "✅ Tudo pronto! Todos os jogadores confirmaram. A mesa está liberada para começar.";
    }

    const myBtn = document.getElementById('btn-confirm-my-bet');
    if (myBtn && myLocalRole) {
        const iHaveConfirmed = room[myLocalRole]?.betConfirmed;
        myBtn.disabled = !allBetsEqual || (totalPlayersConnected < slotsCount) || iHaveConfirmed;
        myBtn.innerText = iHaveConfirmed ? "Você Confirmou a Aposta" : "Confirmar Minha Aposta";
    }
}

function handleMyBetConfirmation() {
    if (!activeRoomCode || !myLocalRole) return alert("Você precisa estar dentro de uma sala pareada para confirmar!");

    const currentBetString = document.getElementById('wallet-current-bet')?.innerText || "R$ 20,00";
    const betAmount = parseFloat(currentBetString.replace('R$', '').replace(',', '.').trim());

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
