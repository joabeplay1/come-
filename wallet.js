import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
let lastWithdrawTime = 0; // Proteção contra múltiplos cliques rápidos

document.addEventListener('DOMContentLoaded', () => {
    setupInterfaceTriggers();
    fetchSecurityMetadata();
});

function setupInterfaceTriggers() {
    const trigger = document.getElementById('wallet-menu-trigger');
    const sidebar = document.getElementById('wallet-sidebar-container');
    const minimizeBtn = document.getElementById('btn-minimize-wallet');
    const depositBtn = document.getElementById('btn-wallet-deposit-pix');
    const withdrawBtn = document.getElementById('btn-wallet-withdraw');

    // Abre/Fecha Menu Lateral
    if (trigger && sidebar) {
        trigger.onclick = () => {
            sidebar.classList.toggle('hidden');
            // Inicializa a carteira vinculando ao nome configurado no dominó
            const currentName = document.getElementById('player-name')?.value.trim() || "Jogador Anonimo";
            initUserFinanceNode(currentName);
        };
    }

    if (minimizeBtn && sidebar) {
        minimizeBtn.onclick = () => sidebar.classList.add('hidden');
    }

    // Ações de Caixa
    if (depositBtn) depositBtn.onclick = handlePixDepositMock;
    if (withdrawBtn) withdrawBtn.onclick = handleWithdrawalRequest;

    // Vincula Motores de Arraste e Redimensionamento
    makeElementDraggable(sidebar, document.getElementById('wallet-drag-handle'));
    makeElementResizable(sidebar, document.getElementById('wallet-resize-handle'));
}

// Inicializa ou escuta a carteira do usuário de forma atômica
function initUserFinanceNode(name) {
    if (userFinanceId) return;
    userFinanceId = btoa(name).replace(/=/g, ""); // Cria um ID limpo determinístico baseado no apelido

    const financeRef = ref(db, `finances/${userFinanceId}`);
    onValue(financeRef, (snapshot) => {
        let data = snapshot.val();
        if (!data) {
            // Conta nova criada com R$ 50,00 de bônus teste para apostar
            data = {
                name: name,
                available: 50.00,
                locked: 0.00,
                lastDeposit: 0.00,
                lastWithdraw: 0.00,
                withdrawStatus: "Nenhum"
            };
            set(financeRef, data);
        }
        updateWalletUI(data);
    });

    // Escuta mudanças de apostas se o jogador estiver em uma sala ativa de dominó
    setInterval(detectActiveRoomBets, 3000);
}

function updateWalletUI(data) {
    document.getElementById('wallet-fin-available').innerText = `R$ ${data.available.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-fin-locked').innerText = `R$ ${data.locked.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-dep').innerText = `R$ ${data.lastDeposit.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-with').innerText = `R$ ${data.lastWithdraw.toFixed(2).replace('.', ',')}`;
    
    const badge = document.getElementById('wallet-withdrawal-status');
    badge.innerText = `Status Saque: ${data.withdrawStatus}`;
    if (data.withdrawStatus === "Concluído") badge.style.color = "#22c55e";
    if (data.withdrawStatus === "Pendente") badge.style.color = "#eab308";
}

// Mock seguro de PIX Copy-Paste (Adiciona R$ 20,00 reais direto)
function handlePixDepositMock() {
    if (!userFinanceId) return alert("Identifique-se no jogo primeiro!");
    
    const financeRef = ref(db, `finances/${userFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        account.available += 20.00;
        account.lastDeposit = 20.00;
        return account;
    }).then(() => {
        showPremiumNotification("Depósito PIX de R$ 20,00 Confirmado!");
    });
}

// Solicitação de Saque com Validação de Segurança Antifraude
function handleWithdrawalRequest() {
    if (!userFinanceId) return alert("Identifique-se no jogo primeiro!");
    
    const now = Date.now();
    if (now - lastWithdrawTime < 10000) { // Trava antifraude de 10 segundos contra múltiplos saques rápidos
        return alert("Atividade suspeita: Evite saques repetidos em curto espaço de tempo.");
    }

    const pixKey = document.getElementById('wallet-pix-key').value.trim();
    const amount = parseFloat(document.getElementById('wallet-withdraw-amount').value);

    if (!pixKey) return alert("Informe uma chave PIX válida para transferência!");
    if (isNaN(amount) || amount <= 0) return alert("Informe um valor de saque válido!");

    const financeRef = ref(db, `finances/${userFinanceId}`);
    
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        
        if (account.available < amount) {
            alert("Saldo insuficiente para retirada.");
            return; // Aborta transação financeira
        }

        // Deduz do saldo disponível instantaneamente
        account.available -= amount;
        account.lastWithdraw = amount;
        account.withdrawStatus = "Pendente";
        return account;
    }).then((result) => {
        if (result.committed) {
            lastWithdrawTime = Date.now();
            showPremiumNotification(`Saque de R$ ${amount.toFixed(2)} solicitado com sucesso!`);
            
            // Simula aprovação automática da API bancária após 4 segundos
            setTimeout(() => {
                runTransaction(ref(db, `finances/${userFinanceId}`), (acc) => {
                    if (acc && acc.withdrawStatus === "Pendente") acc.withdrawStatus = "Concluído";
                    return acc;
                }).then(() => showPremiumNotification("Saque via PIX Concluído!"));
            }, 4000);
        }
    });
}

// Integração de Auditoria: Monitora as salas de dominó para calcular prêmios e rankings
function detectActiveRoomBets() {
    const roomIdElement = document.getElementById('game-room-id');
    if (!roomIdElement) return;

    const code = roomIdElement.innerText.replace('#', '').trim();
    if (!code || code === "000000") return;

    if (currentRoomCode !== code) {
        currentRoomCode = code;
        // Escuta os dados da partida do dominó principal de forma passiva para alimentar a carteira
        onValue(ref(db, `rooms/${currentRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (!room) return;

            // Simulação de regras de apostas: R$ 10,00 por jogador fixado
            const playersCount = room.playersOrder ? room.playersOrder.length : 2;
            const betValue = 10.00;
            const totalPrize = playersCount * betValue;

            document.getElementById('wallet-match-bet-val').innerText = `R$ ${betValue.toFixed(2)}`;
            document.getElementById('wallet-match-prize').innerText = `R$ ${totalPrize.toFixed(2)}`;

            // Renderiza Ranking com base nos scores atuais do dominó
            const rankingList = document.getElementById('wallet-ranking-list');
            rankingList.innerHTML = '';
            
            let rankArr = [];
            if (room.p1) rankArr.push({ name: room.p1.name, score: room.p1.score || 0 });
            if (room.p2) rankArr.push({ name: room.p2.name, score: room.p2.score || 0 });
            if (room.p3) rankArr.push({ name: room.p3.name, score: room.p3.score || 0 });
            if (room.p4) rankArr.push({ name: room.p4.name, score: room.p4.score || 0 });

            rankArr.sort((a,b) => b.score - a.score);
            rankArr.forEach(p => {
                const li = document.createElement('li');
                li.innerHTML = `<b>${p.name}</b> — ${p.score} pts`;
                rankingList.appendChild(li);
            });
        });
    }
}

// Emissão de Toasts modernos na tela
function showPremiumNotification(text) {
    const area = document.getElementById('wallet-notification-container');
    if (!area) return;

    const toast = document.createElement('div');
    toast.className = 'wallet-notif-toast';
    toast.innerText = text;

    area.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function fetchSecurityMetadata() {
    // Simula coleta de dados de IP local para fins de auditoria antifraude na blockchain do jogo
    document.getElementById('wallet-sec-ip').innerText = `IP Registrado: 189.124.${Math.floor(100 + Math.random()*150)}.${Math.floor(10 + Math.random()*80)}`;
}

// ==========================================================================
// CENTRAL DE MÁQUINAS: COMPONENTES DE ARRASTE E REDIMENSIONAMENTO ACELERADOS
// ==========================================================================
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
        initialX = clientX - xOffset;
        initialY = clientY - yOffset;

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
        currentX = clientX - initialX;
        currentY = clientY - initialY;
        xOffset = currentX; yOffset = currentY;

        requestAnimationFrame(() => {
            elmnt.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        });
    }

    function dragEnd() {
        active = false;
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", dragEnd);
        document.removeEventListener("touchmove", drag);
        document.removeEventListener("touchend", dragEnd);
    }
}

function makeElementResizable(elmnt, handle) {
    if (!elmnt || !handle) return;
    handle.addEventListener('mousedown', initResize, false);
    handle.addEventListener('touchstart', initResize, false);

    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', StartResize, false);
        window.addEventListener('mouseup', StopResize, false);
        window.addEventListener('touchmove', StartResize, false);
        window.addEventListener('touchend', StopResize, false);
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

    function StopResize() {
        window.removeEventListener('mousemove', StartResize, false);
        window.removeEventListener('mouseup', StopResize, false);
        window.removeEventListener('touchmove', StartResize, false);
        window.removeEventListener('touchend', StopResize, false);
    }
}
