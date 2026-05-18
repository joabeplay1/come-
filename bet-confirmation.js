import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuração padrão do Firebase
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
let myLocalRole = null;

document.addEventListener('DOMContentLoaded', () => {
    const headerToggle = document.getElementById('bet-panel-toggle');
    const bodyContent = document.getElementById('bet-panel-content');
    const minimizeBtn = document.getElementById('btn-minimize-bet-panel');

    // SISTEMA DE MINIMIZAR INTELIGENTE (Fecha clicando no cabeçalho ou no botão de traço)
    if (headerToggle && bodyContent) {
        const togglePanel = (e) => {
            e.stopPropagation(); // Impede conflitos de clique
            bodyContent.classList.toggle('collapsed');
            
            if (minimizeBtn) {
                // Se estiver colapsado mostra o ícone de expandir, senão o de traço
                minimizeBtn.innerText = bodyContent.classList.contains('collapsed') ? '🗖' : '—';
            }
        };

        headerToggle.onclick = togglePanel;
        if (minimizeBtn) minimizeBtn.onclick = togglePanel;
    }

    // Escuta de alteração de modo de jogo (Apenas o p1 altera no Firebase)
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.onchange = (e) => {
            if (myLocalRole === 'p1' && activeRoomCode) {
                set(ref(db, `rooms/${activeRoomCode}/matchMode`), e.target.value);
            }
        };
    }

    // Ação do Botão Confirmar Aposta
    const confirmBtn = document.getElementById('btn-confirm-my-bet');
    if (confirmBtn) {
        confirmBtn.onclick = handleMyBetConfirmation;
    }

    // Loop de monitoramento para engajar o painel quando entrar em uma mesa
    setInterval(detectActiveGameRoom, 2000);
});

function detectActiveGameRoom() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") {
        document.getElementById('bet-central-panel').classList.add('hidden');
        return;
    }

    if (activeRoomCode !== code) {
        activeRoomCode = code;
        document.getElementById('bet-central-panel').classList.remove('hidden');

        // Escuta as alterações na sala ativa do Firebase
        onValue(ref(db, `rooms/${activeRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (room) syncBetPanelState(room);
        });
    }
}

function syncBetPanelState(room) {
    const currentName = document.getElementById('player-name')?.value.trim();
    
    // Determina a cadeira (Role) do jogador local
    if (room.p1 && room.p1.name === currentName) myLocalRole = 'p1';
    else if (room.p2 && room.p2.name === currentName) myLocalRole = 'p2';
    else if (room.p3 && room.p3.name === currentName) myLocalRole = 'p3';
    else if (room.p4 && room.p4.name === currentName) myLocalRole = 'p4';

    // Atualiza o modo de jogo baseado no Firebase
    currentMode = room.matchMode || "1x1";
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.value = currentMode;
        modeSelect.disabled = (myLocalRole !== 'p1');
    }

    // Ajusta o título do prêmio baseado no modo
    const titleMode = document.getElementById('bet-prize-title-mode');
    if (currentMode === '1x1') titleMode.innerText = "🏆 MODO 1x1 — VENCEDOR LEVA TUDO";
    if (currentMode === 'solo') titleMode.innerText = "💀 MOTO MATA-MATA — VENCEDOR LEVA TUDO";
    if (currentMode === 'duplas') titleMode.innerText = "👑 MODO CLÁSSICO — PRÊMIO DIVIDIDO ENTRE A DUPLA";

    renderPlayersGrid(room);
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
            const betVal = player.betIntent || 1.00;
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
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (!allBetsEqual) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Os jogadores precisam apostar o mesmo valor para iniciar a partida.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (pendingConfirmations > 0) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Valores compatíveis! Aguardando ${pendingConfirmations} confirmações manuais...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else {
        banner.className = "bet-banner-status bet-banner-success";
        banner.innerText = "✅ Tudo pronto! Todos os jogadores confirmaram. A mesa está liberada para começar.";
        if (mainStartBtn) mainStartBtn.disabled = false;
    }

    const myBtn = document.getElementById('btn-confirm-my-bet');
    if (myBtn && myLocalRole) {
        const iHaveConfirmed = room[myLocalRole]?.betConfirmed;
        myBtn.disabled = !allBetsEqual || (totalPlayersConnected < slotsCount) || iHaveConfirmed;
        myBtn.innerText = iHaveConfirmed ? "Você Confirmou a Aposta" : "Confirmar Minha Aposta";
    }
}

function handleMyBetConfirmation() {
    if (!activeRoomCode || !myLocalRole) return;

    const currentBetString = document.getElementById('wallet-current-bet')?.innerText || "R$ 1,00";
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
