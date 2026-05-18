import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

let userFinanceId = null;
let currentRoomCode = null;
let localBetValue = 20.00; // Iniciando com o valor padrão do painel central
let localWalletBalance = 0.00;
let lastWithdrawTime = 0;
let localPlayerRole = "p1"; 
let prizeClaimedForRound = false;

document.addEventListener('DOMContentLoaded', () => {
    setupInterfaceTriggers();
    
    // Força identificação imediata para liberar o banco de dados
    const currentName = document.getElementById('player-name')?.value.trim() || "Joabe Play";
    initUserFinanceNode(currentName);
    
    document.getElementById('player-name')?.addEventListener('blur', (e) => {
        if(e.target.value.trim()) initUserFinanceNode(e.target.value.trim());
    });

    // GARANTIA DE CLIQUE LIVRE: Força o botão da carteira a ficar clicável por cima de qualquer outra camada
    const trigger = document.getElementById('wallet-menu-trigger');
    if (trigger) {
        trigger.style.pointerEvents = 'auto';
        trigger.style.zIndex = '99999';
    }
});

function setupInterfaceTriggers() {
    const trigger = document.getElementById('wallet-menu-trigger');
    const sidebar = document.getElementById('wallet-sidebar-container');
    const minimizeBtn = document.getElementById('btn-minimize-wallet');
    const depositBtn = document.getElementById('btn-wallet-deposit-pix');
    const withdrawBtn = document.getElementById('btn-wallet-withdraw');

    // Cliques de controle do valor de aposta
    if (document.getElementById('btn-bet-decrease')) {
        document.getElementById('btn-bet-decrease').onclick = () => changeLocalBet(-5.00);
    }
    if (document.getElementById('btn-bet-increase')) {
        document.getElementById('btn-bet-increase').onclick = () => changeLocalBet(5.00);
    }

    // CORREÇÃO DO CLIQUE: Abre e fecha a carteira perfeitamente sem travar
    if (trigger && sidebar) {
        trigger.onclick = (e) => {
            sidebar.classList.toggle('hidden');
            
            // Garante que o banco de dados carregue o saldo atualizado ao abrir
            const currentName = document.getElementById('player-name')?.value.trim() || "Joabe Play";
            if (typeof initUserFinanceNode === "function") {
                initUserFinanceNode(currentName);
            }
        };
    }

    if (minimizeBtn && sidebar) {
        minimizeBtn.onclick = () => {
            sidebar.classList.add('hidden');
        };
    }

    if (depositBtn) depositBtn.onclick = handlePixDepositMock;
    if (withdrawBtn) withdrawBtn.onclick = handleWithdrawalRequest;

    makeElementDraggable(sidebar, document.getElementById('wallet-drag-handle'));
    makeElementResizable(sidebar, document.getElementById('wallet-resize-handle'));

    setInterval(syncMatchApostasAndWinner, 2000);
}

function initUserFinanceNode(name) {
    userFinanceId = btoa(name).replace(/=/g, "");
    const financeRef = ref(db, `finances/${userFinanceId}`);
    
    onValue(financeRef, (snapshot) => {
        let data = snapshot.val();
        if (!data) {
            data = { name: name, available: 150.00, locked: 0.00, lastDeposit: 20.00, lastWithdraw: 0.00, withdrawStatus: "Nenhum" };
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

// API INTEGRADA: Altera o valor na carteira e joga direto para a tela do meio (Aba Central)
function changeLocalBet(step) {
    if (localBetValue + step < 1.00) return;
    localBetValue += step;
    
    // Atualiza o texto na carteira lateral
    document.getElementById('wallet-current-bet').innerText = `R$ ${localBetValue.toFixed(2).replace('.', ',')}`;
    
    // Ponte de API: Altera em tempo real o Firebase da sala e a interface provisória do Lobby
    if (activeRoomCode && localPlayerRole) {
        set(ref(db, `rooms/${activeRoomCode}/${localPlayerRole}/betIntent`), localBetValue);
    } else {
        // Se estiver no lobby sem sala, força a atualização visual imediata no painel central
        const myPrizeText = document.getElementById('bet-prize-total-val');
        if (myPrizeText) {
            const slotsCount = (document.getElementById('select-match-mode')?.value === '1x1') ? 2 : 4;
            myPrizeText.innerText = `PRÊMIO TOTAL: R$ ${(slotsCount * localBetValue).toFixed(2).replace('.', ',')}`;
        }
        // Atualiza o texto do primeiro jogador no grid simulado do meio
        const firstPlayerBetGrid = document.querySelector('.bet-player-card .p-grid-bet');
        if (firstPlayerBetGrid) {
            firstPlayerBetGrid.innerText = `Aposta: R$ ${localBetValue.toFixed(2).replace('.', ',')}`;
        }
    }
}

function syncMatchApostasAndWinner() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") return;

    if (currentRoomCode !== code) {
        currentRoomCode = code;
        prizeClaimedForRound = false;
        
        onValue(ref(db, `rooms/${currentRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (!room) return;

            const b1 = room.p1?.betIntent || 20.00;
            const b2 = room.p2?.betIntent || 20.00;
            const totalPrize = b1 + b2;

            document.getElementById('wallet-match-bet-val').innerText = `R$ ${b1.toFixed(2).replace('.', ',')}`;
            document.getElementById('wallet-match-prize').innerText = `R$ ${totalPrize.toFixed(2).replace('.', ',')}`;

            const p1HandCount = room.p1?.hand ? room.p1.hand.length : 7;
            const p2HandCount = room.p2?.hand ? room.p2.hand.length : 7;

            if ((p1HandCount === 0 || p2HandCount === 0) && !prizeClaimedForRound && room.chain && room.chain.length > 0) {
                const winnerRole = (p1HandCount === 0) ? 'p1' : 'p2';
                prizeClaimedForRound = true;
                const currentName = document.getElementById('player-name')?.value.trim();
                if (room[winnerRole]?.name === currentName) {
                    executePrizePayoutTransaction(totalPrize);
                }
            }
        });
    }
}

function executePrizePayoutTransaction(prizeAmount) {
    if (!userFinanceId) return;
    const financeRef = ref(db, `finances/${userFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        account.available += prizeAmount;
        return account;
    }).then(() => {
        triggerVictoryScreenAnimation(prizeAmount);
    });
}

function triggerVictoryScreenAnimation(amountWon) {
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

function handlePixDepositMock() {
    if (!userFinanceId) return alert("Identifique-se primeiro!");
    runTransaction(ref(db, `finances/${userFinanceId}`), (account) => {
        if (!account) return account;
        account.available += 20.00; account.lastDeposit = 20.00;
        return account;
    }).then(() => showPremiumNotification("Depósito PIX de R$ 20,00 Confirmado!"));
}

function handleWithdrawalRequest() {
    if (!userFinanceId) return alert("Identifique-se primeiro!");
    const now = Date.now();
    if (now - lastWithdrawTime < 10000) return alert("Aguarde o processamento.");

    const pixKey = document.getElementById('wallet-pix-key').value.trim();
    const amount = parseFloat(document.getElementById('wallet-withdraw-amount').value);

    if (!pixKey || isNaN(amount) || amount <= 0) return alert("Preencha os dados corretamente!");

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
