import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuração oficial do Firebase
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

let userFinanceId = null;
let currentRoomCode = null;
let localBetValue = 1.00; // Valor inicial padrão da aposta livre
let localWalletBalance = 0.00;
let lastWithdrawTime = 0;
let localPlayerRole = null; 
let prizeClaimedForRound = false;

document.addEventListener('DOMContentLoaded', () => {
    setupInterfaceTriggers();
});

function setupInterfaceTriggers() {
    const trigger = document.getElementById('wallet-menu-trigger');
    const sidebar = document.getElementById('wallet-sidebar-container');
    const minimizeBtn = document.getElementById('btn-minimize-wallet');
    const depositBtn = document.getElementById('btn-wallet-deposit-pix');
    const withdrawBtn = document.getElementById('btn-wallet-withdraw');

    // Botões de Passo de Aposta
    document.getElementById('btn-bet-decrease').onclick = () => changeLocalBet(-0.50);
    document.getElementById('btn-bet-increase').onclick = () => changeLocalBet(0.50);

    if (trigger && sidebar) {
        trigger.onclick = () => {
            sidebar.classList.toggle('hidden');
            const currentName = document.getElementById('player-name')?.value.trim() || "Jogador Anonimo";
            initUserFinanceNode(currentName);
        };
    }

    if (minimizeBtn) minimizeBtn.onclick = () => sidebar.classList.add('hidden');
    if (depositBtn) depositBtn.onclick = handlePixDepositMock;
    if (withdrawBtn) withdrawBtn.onclick = handleWithdrawalRequest;

    makeElementDraggable(sidebar, document.getElementById('wallet-drag-handle'));
    makeElementResizable(sidebar, document.getElementById('wallet-resize-handle'));

    // Loop passivo para ler o andamento da mesa do dominó
    setInterval(syncMatchApostasAndWinner, 2000);
}

function initUserFinanceNode(name) {
    if (userFinanceId) return;
    userFinanceId = btoa(name).replace(/=/g, "");

    const financeRef = ref(db, `finances/${userFinanceId}`);
    onValue(financeRef, (snapshot) => {
        let data = snapshot.val();
        if (!data) {
            data = { name: name, available: 50.00, locked: 0.00, lastDeposit: 0.00, lastWithdraw: 0.00, withdrawStatus: "Nenhum" };
            set(financeRef, data);
        }
        localWalletBalance = data.available;
        updateWalletUI(data);
    });
}

function updateWalletUI(data) {
    document.getElementById('wallet-fin-available').innerText = `R$ ${data.available.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-fin-locked').innerText = `R$ ${data.locked.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-dep').innerText = `R$ ${data.lastDeposit.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-with').innerText = `R$ ${data.lastWithdraw.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-withdrawal-status').innerText = `Status Saque: ${data.withdrawStatus}`;
}

function changeLocalBet(step) {
    if (localBetValue + step < 0.50) return; // Mínimo R$ 0,50
    localBetValue += step;
    document.getElementById('wallet-current-bet').innerText = `R$ ${localBetValue.toFixed(2).replace('.', ',')}`;
    
    // Sincroniza a intenção de valor de aposta na sala ativa do Firebase imediatamente
    if (currentRoomCode && localPlayerRole) {
        set(ref(db, `rooms/${currentRoomCode}/${localPlayerRole}/betIntent`), localBetValue);
    }
}

// ==========================================================================
// MOTOR CENTRAL DE SINCRONIZAÇÃO DE VALORES E VERIFICAÇÃO OBRIGATÓRIA
// ==========================================================================
function syncMatchApostasAndWinner() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") return;

    // Vincula a Role local olhando os nomes do Placar Principal do jogo
    if (!localPlayerRole) {
        const p1Name = document.getElementById('score-p1-name')?.innerText;
        const currentName = document.getElementById('player-name')?.value.trim();
        localPlayerRole = (p1Name === currentName) ? 'p1' : 'p2';
    }

    if (currentRoomCode !== code) {
        currentRoomCode = code;
        prizeClaimedForRound = false;
        
        // Aplica escuta em tempo real no nó da sala
        onValue(ref(db, `rooms/${currentRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (!room) return;

            const b1 = room.p1?.betIntent || 1.00;
            const b2 = room.p2?.betIntent || 1.00;
            const totalPrize = b1 + b2;

            document.getElementById('wallet-match-bet-val').innerText = `R$ ${b1.toFixed(2).replace('.', ',')}`;
            document.getElementById('wallet-match-prize').innerText = `R$ ${totalPrize.toFixed(2).replace('.', ',')}`;

            const banner = document.getElementById('wallet-bet-status-banner');
            const playBtnp1 = document.getElementById('btn-create-room'); // Bloqueadores visuais nativos
            
            // REGRA OBRIGATÓRIA: Checa se os valores batem de ambos os lados
            if (b1 !== b2) {
                banner.className = "bet-alert-banner";
                banner.innerText = `Os dois jogadores precisam apostar o mesmo valor para iniciar a partida. (P1: R$${b1.toFixed(2)} / P2: R$${b2.toFixed(2)})`;
                if(playBtnp1) playBtnp1.disabled = true; // Trava segurança mecânica
            } else {
                banner.className = "bet-success-banner";
                banner.innerText = `Apostas combinadas! Prêmio total: R$ ${totalPrize.toFixed(2).replace('.', ',')}`;
                if(playBtnp1) playBtnp1.disabled = false;
            }

            // DETECTOR DE VITÓRIA AUTOMÁTICO: Olha a estrutura de mãos vazias do script principal
            const p1HandCount = room.p1?.hand ? room.p1.hand.length : 7;
            const p2HandCount = room.p2?.hand ? room.p2.hand.length : 7;

            if ((p1HandCount === 0 || p2HandCount === 0) && !prizeClaimedForRound && room.chain && room.chain.length > 0) {
                const winnerRole = (p1HandCount === 0) ? 'p1' : 'p2';
                prizeClaimedForRound = true; // Proteção antifraude contra loops de pagamentos
                
                if (localPlayerRole === winnerRole) {
                    executePrizePayoutTransaction(totalPrize);
                }
            }
        });
    }
}

// Injeção Atômica de Ganhos na Carteira + Invocação de Animação
function executePrizePayoutTransaction(prizeAmount) {
    if (!userFinanceId) return;

    const financeRef = ref(db, `finances/${userFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        account.available += prizeAmount; // Adiciona os ganhos direto na conta do campeão
        return account;
    }).then(() => {
        triggerVictoryScreenAnimation(prizeAmount);
    });
}

function triggerVictoryScreenAnimation(amountWon) {
    // Cria elemento de Overlay flutuante premium por cima do tabuleiro inteiro
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay-screen';
    
    overlay.innerHTML = `
        <div class="victory-card-glow">
            <h2>🏆 VOCÊ GANHOU!</h2>
            <p>Sua aposta no Domino Aposta foi vitoriosa</p>
            <div class="victory-prize-box">
                <span class="v-label">Valor Recebido</span>
                <span class="v-amount">R$ ${amountWon.toFixed(2).replace('.', ',')}</span>
            </div>
            <div class="victory-wallet-updated">
                Saldo Carteira: <b>R$ ${(localWalletBalance).toFixed(2).replace('.', ',')}</b>
            </div>
            <button id="btn-close-victory-screen" class="btn-wallet-primary">Continuar Jogando</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('btn-close-victory-screen').onclick = () => overlay.remove();
}

// Mocks de Operações Financeiras de Caixa Seguras
function handlePixDepositMock() {
    if (!userFinanceId) return alert("Abra a carteira clicando no ícone para se identificar primeiro!");
    runTransaction(ref(db, `finances/${userFinanceId}`), (account) => {
        if (!account) return account;
        account.available += 20.00; account.lastDeposit = 20.00;
        return account;
    }).then(() => showPremiumNotification("Depósito PIX de R$ 20,00 Confirmado!"));
}

function handleWithdrawalRequest() {
    if (!userFinanceId) return alert("Abra a carteira clicando no ícone para se identificar primeiro!");
    const now = Date.now();
    if (now - lastWithdrawTime < 10000) return alert("Aguarde o processamento da última retirada.");

    const pixKey = document.getElementById('wallet-pix-key').value.trim();
    const amount = parseFloat(document.getElementById('wallet-withdraw-amount').value);

    if (!pixKey || isNaN(amount) || amount <= 0) return alert("Preencha os dados de retirada corretamente!");

    const financeRef = ref(db, `finances/${userFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        if (account.available < amount) {
            alert("Saldo insuficiente para retirada.");
            return;
        }
        account.available -= amount; account.lastWithdraw = amount; account.withdrawStatus = "Pendente";
        return account;
    }).then((result) => {
        if (result.committed) {
            lastWithdrawTime = Date.now();
            showPremiumNotification(`Saque de R$ ${amount.toFixed(2)} solicitado!`);
            setTimeout(() => {
                runTransaction(ref(db, `finances/${userFinanceId}`), (acc) => {
                    if (acc && acc.withdrawStatus === "Pendente") acc.withdrawStatus = "Concluído";
                    return acc;
                }).then(() => showPremiumNotification("Saque via PIX Concluído!"));
            }, 4000);
        }
    });
}

function showPremiumNotification(text) {
    const area = document.getElementById('wallet-notification-container');
    if (!area) return;
    const toast = document.createElement('div');
    toast.className = 'wallet-notif-toast';
    toast.innerText = text;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Componentes Estáveis de Movimento e Redimensionamento
function makeElementDraggable(elmnt, dragHandle) {
    if (!elmnt) return;
    let currentX = 0, currentY = 0, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;
    let active = false;
    const handle = dragHandle || elmnt;
    handle.addEventListener("mousedown", dragStart, { passive: false });
    handle.addEventListener("touchstart", dragStart, { passive: false });

    function dragStart(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
        active = true;
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        initialX = clientX - xOffset; initialY = clientY - yOffset;
        if (e.type === "touchstart") {
            document.addEventListener("touchend", dragEnd, { passive: true });
            document.addEventListener("touchmove", drag, { passive: false });
        } else {
            e.preventDefault();
            document.addEventListener("mouseup", dragEnd, { passive: true });
            document.addEventListener("mousemove", drag, { passive: false });
        }
    }
    function drag(e) {
        if (!active) return;
        e.preventDefault();
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        currentX = clientX - initialX; currentY = clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        requestAnimationFrame(() => { elmnt.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`; });
    }
    function dragEnd() { active = false; document.removeEventListener("mousemove", drag); document.removeEventListener("mouseup", dragEnd); document.removeEventListener("touchmove", drag); document.removeEventListener("touchend", dragEnd); }
}

function makeElementResizable(elmnt, handle) {
    if (!elmnt || !handle) return;
    handle.addEventListener('mousedown', initResize, false);
    handle.addEventListener('touchstart', initResize, false);
    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', StartResize, false); window.addEventListener('mouseup', StopResize, false);
        window.addEventListener('touchmove', StartResize, false); window.addEventListener('touchend', StopResize, false);
    }
    function StartResize(e) {
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const width = clientX - elmnt.getBoundingClientRect().left;
        const height = clientY - elmnt.getBoundingClientRect().top;
        requestAnimationFrame(() => {
            if (width > 260 && width < 500) elmnt.style.width = width + 'px';
            if (height > 300 && height < window.innerHeight - 40) elmnt.style.height = height + 'px';
        });
    }
    function StopResize() { window.removeEventListener('mousemove', StartResize, false); window.removeEventListener('mouseup', StopResize, false); window.removeEventListener('touchmove', StartResize, false); window.removeEventListener('touchend', StopResize, false); }
}
