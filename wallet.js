import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuração do seu Firebase
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

let myFinanceId = null;
let currentRoomCode = null;
let localBetValue = 20.00; 
let lastWithdrawTime = 0;

document.addEventListener('DOMContentLoaded', () => {
    // Força o botão do saquinho de dinheiro a ficar sempre no topo e clicável
    const trigger = document.getElementById('wallet-menu-trigger');
    if (trigger) {
        trigger.style.pointerEvents = 'auto';
        trigger.style.zIndex = '99999';
    }

    setupWalletInteractions();
    autoInitLocalPlayer();
});

// Inicializa a carteira do jogador local assim que ele digita o nome
function autoInitLocalPlayer() {
    const nameInput = document.getElementById('player-name');
    
    const initAction = () => {
        const name = nameInput.value.trim() || "Joabe Play";
        myFinanceId = btoa(name).replace(/=/g, ""); // Gerador de ID Único
        
        // Salva o ID no window para o script de confirmação ler
        window.currentUniqueFinanceId = myFinanceId;
        window.currentUniquePlayerName = name;

        listenToWalletDatabase(myFinanceId, name);
    };

    if (nameInput) {
        nameInput.addEventListener('blur', initAction);
        if (nameInput.value.trim()) initAction();
    } else {
        initAction();
    }
}

function listenToWalletDatabase(financeId, playerName) {
    const financeRef = ref(db, `finances/${financeId}`);
    onValue(financeRef, (snapshot) => {
        let data = snapshot.val();
        if (!data) {
            // Se for um ID novo, cria a conta com saldo inicial de teste de R$ 150,00
            data = {
                id: financeId,
                name: playerName,
                available: 150.00,
                locked: 0.00,
                lastDeposit: 20.00,
                lastWithdraw: 0.00,
                withdrawStatus: "Nenhum"
            };
            set(financeRef, data);
        }
        updateWalletDOM(data);
    });
}

function updateWalletDOM(data) {
    document.getElementById('wallet-fin-available').innerText = `R$ ${data.available.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-fin-locked').innerText = `R$ ${data.locked.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-dep').innerText = `R$ ${data.lastDeposit.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-last-with').innerText = `R$ ${data.lastWithdraw.toFixed(2).replace('.', ',')}`;
    document.getElementById('wallet-withdrawal-status').innerText = `Status Saque: ${data.withdrawStatus}`;
}

function setupWalletInteractions() {
    const trigger = document.getElementById('wallet-menu-trigger');
    const sidebar = document.getElementById('wallet-sidebar-container');
    const minimizeBtn = document.getElementById('btn-minimize-wallet');
    const depositBtn = document.getElementById('btn-wallet-deposit-pix');
    const withdrawBtn = document.getElementById('btn-wallet-withdraw');

    // Abre e fecha a carteira lateral ao clicar no saquinho de dinheiro
    if (trigger && sidebar) {
        trigger.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.toggle('hidden');
        };
    }

    if (minimizeBtn && sidebar) {
        minimizeBtn.onclick = () => sidebar.classList.add('hidden');
    }

    // Botões de aumentar e diminuir valor da aposta na carteira
    document.getElementById('btn-bet-decrease').onclick = () => modifyBetValue(-5.00);
    document.getElementById('btn-bet-increase').onclick = () => modifyBetValue(5.00);

    if (depositBtn) depositBtn.onclick = executeMockDeposit;
    if (withdrawBtn) withdrawBtn.onclick = executeMockWithdrawal;

    makeElementDraggable(sidebar, document.getElementById('wallet-drag-handle'));
    makeElementResizable(sidebar, document.getElementById('wallet-resize-handle'));
}

function modifyBetValue(amount) {
    if (localBetValue + amount < 1.00) return;
    localBetValue += amount;
    
    document.getElementById('wallet-current-bet').innerText = `R$ ${localBetValue.toFixed(2).replace('.', ',')}`;
    
    // Força a aba central do meio a atualizar os valores na hora
    if (window.updateCentralBetDisplay) {
        window.updateCentralBetDisplay(localBetValue);
    }
}

function executeMockDeposit() {
    if (!myFinanceId) return alert("Defina seu nome de jogador primeiro!");
    
    const financeRef = ref(db, `finances/${myFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        account.available += 20.00;
        account.lastDeposit = 20.00;
        return account;
    }).then(() => {
        push(ref(db, `finances/${myFinanceId}/history`), {
            type: "Depósito via PIX",
            amount: 20.00,
            timestamp: Date.now(),
            status: "Concluído"
        });
        showWalletToast("Depósito PIX de R$ 20,00 aprovado!");
    });
}

function executeMockWithdrawal() {
    if (!myFinanceId) return alert("Defina seu nome de jogador primeiro!");
    
    const now = Date.now();
    if (now - lastWithdrawTime < 10000) return alert("Proteção Antifraude: Aguarde 10 segundos entre saques.");

    const pixKey = document.getElementById('wallet-pix-key').value.trim();
    const amount = parseFloat(document.getElementById('wallet-withdraw-amount').value);

    if (!pixKey || isNaN(amount) || amount <= 0) return alert("Preencha a chave PIX e o valor corretamente!");

    const financeRef = ref(db, `finances/${myFinanceId}`);
    runTransaction(financeRef, (account) => {
        if (!account) return account;
        if (account.available < amount) {
            alert("Saldo insuficiente para retirada.");
            return;
        }
        account.available -= amount;
        account.lastWithdraw = amount;
        account.withdrawStatus = "Pendente";
        return account;
    }).then((result) => {
        if (result.committed) {
            lastWithdrawTime = Date.now();
            showWalletToast(`Saque de R$ ${amount.toFixed(2)} solicitado!`);
            
            push(ref(db, `finances/${myFinanceId}/history`), {
                type: "Retirada PIX",
                amount: amount,
                timestamp: Date.now(),
                status: "Pendente"
            });

            setTimeout(() => {
                runTransaction(ref(db, `finances/${myFinanceId}`), (acc) => {
                    if (acc && acc.withdrawStatus === "Pendente") acc.withdrawStatus = "Concluído";
                    return acc;
                }).then(() => showWalletToast("Saque via PIX enviado para o banco!"));
            }, 4000);
        }
    });
}

function showWalletToast(msg) {
    const area = document.getElementById('wallet-notification-container');
    if (!area) return;
    const toast = document.createElement('div');
    toast.className = 'wallet-notif-toast';
    toast.innerText = msg;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Motores mecânicos de movimentação e redimensionamento
function makeElementDraggable(elmnt, dragHandle) {
    if (!elmnt) return;
    let currentX = 0, currentY = 0, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;
    let active = false;
    const handle = dragHandle || elmnt;
    handle.onmousedown = dragStart; handle.ontouchstart = dragStart;

    function dragStart(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        active = true;
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        initialX = clientX - xOffset; initialY = clientY - yOffset;
        if (e.type === "touchstart") {
            document.ontouchend = () => active = false; document.ontouchmove = drag;
        } else {
            document.onmouseup = () => active = false; document.onmousemove = drag;
        }
    }
    function drag(e) {
        if (!active) return;
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        currentX = clientX - initialX; currentY = clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        requestAnimationFrame(() => { elmnt.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`; });
    }
}

function makeElementResizable(elmnt, handle) {
    if (!elmnt || !handle) return;
    handle.onmousedown = initResize; handle.ontouchstart = initResize;
    function initResize(e) {
        e.preventDefault();
        window.onmousemove = startResize; window.onmouseup = stopResize;
        window.ontouchmove = startResize; window.ontouchend = stopResize;
    }
    function startResize(e) {
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const width = clientX - elmnt.getBoundingClientRect().left;
        const height = clientY - elmnt.getBoundingClientRect().top;
        requestAnimationFrame(() => {
            if (width > 260 && width < 500) elmnt.style.width = width + 'px';
            if (height > 300 && height < window.innerHeight - 40) elmnt.style.height = height + 'px';
        });
    }
    function stopResize() { window.onmousemove = null; window.onmouseup = null; window.ontouchmove = null; window.ontouchend = null; }
}
