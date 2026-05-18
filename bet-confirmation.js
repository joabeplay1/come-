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

// API DE DADOS DE CAIXA DOS JOGADORES (Sincronização em Tempo Real)
let myFinanceId = null;
let myCurrentLocalName = "Joabe Play";
let localWalletBalance = 150.00; // Saldo de testes inicial disponível
let currentGlobalBet = 20.00;     // Valor base da rodada
let prizeClaimedForRound = false;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o ID único do usuário baseado no Nome
    syncUserFinancialIdentity();

    // Constrói dinamicamente os controles de Caixa (PIX, Saque, Estorno e Valores) no painel
    injectFinancialControlsIntoDOM();

    // Garante que o painel inicie visível no Lobby
    const centralPanel = document.getElementById('bet-central-panel');
    if (centralPanel) centralPanel.classList.remove('hidden');

    // Escuta mudanças no nome do jogador para re-sincronizar o caixa
    document.getElementById('player-name')?.addEventListener('blur', (e) => {
        if(e.target.value.trim()) syncUserFinancialIdentity();
    });

    // Configuração do seletor nativo de modos de partida
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) {
        modeSelect.onchange = (e) => {
            currentMode = e.target.value;
            updatePayoutInstructionBanner();
            if (activeRoomCode && myLocalRole === 'p1') {
                set(ref(db, `rooms/${activeRoomCode}/matchMode`), currentMode);
            } else if (isLobbyTestingMode) {
                renderDynamicFinancialGrid(null);
            }
        };
    }

    // Botão de Ação Principal (Confirmar Aposta)
    const confirmBtn = document.getElementById('btn-confirm-my-bet');
    if (confirmBtn) confirmBtn.onclick = handleLockBetFundsTransaction;

    // Loop de escuta para capturar quando o jogador entra em uma mesa ativa
    setInterval(detectRoomConnection, 1500);
});

function syncUserFinancialIdentity() {
    myCurrentLocalName = document.getElementById('player-name')?.value.trim() || "Joabe Play";
    myFinanceId = btoa(myCurrentLocalName).replace(/=/g, "");
    
    // Conecta ao nó de finanças global do Firebase para escutar saldos reais
    const financeRef = ref(db, `finances/${myFinanceId}`);
    onValue(financeRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            localWalletBalance = data.available || 0;
            const balDisplay = document.getElementById('central-balance-display');
            if (balDisplay) balDisplay.innerText = `R$ ${localWalletBalance.toFixed(2).replace('.', ',')}`;
        } else {
            // Inicializa carteira no banco se for o primeiro acesso do ID
            set(financeRef, { name: myCurrentLocalName, available: 150.00, locked: 0.00 });
        }
    });
}

function injectFinancialControlsIntoDOM() {
    const body = document.getElementById('bet-panel-content');
    if (!body || document.getElementById('btn-central-pix-dep')) return;

    // Gaveta 1: Ajustador de valores de lances e display de saldo disponível
    const valBox = document.createElement('div');
    valBox.className = "game-mode-selector-box";
    valBox.style.margin = "12px 0";
    valBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#8a9a92; margin-bottom:4px; font-weight:bold;">
            <span>SEU SALDO DISPONÍVEL: <b style="color:#22c55e" id="central-balance-display">R$ 150,00</b></span>
            <span>DEFINIR VALOR DA APOSTA</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:center; gap:15px; background:rgba(0,0,0,0.3); padding:8px; border-radius:8px; border:1px solid rgba(212,175,55,0.05);">
            <button id="btn-central-decrease" style="background:rgba(255,255,255,0.05); border:1px solid #d4af37; color:#d4af37; width:35px; height:35px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1rem;">—</button>
            <span id="central-bet-value-txt" style="font-size:1.3rem; font-weight:800; color:#fff; min-width:90px; text-align:center;">R$ 20,00</span>
            <button id="btn-central-increase" style="background:rgba(255,255,255,0.05); border:1px solid #d4af37; color:#d4af37; width:35px; height:35px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1rem;">+</button>
        </div>
    `;
    body.insertBefore(valBox, body.children[1]);

    // Gaveta 2: Botões de Operação de Caixa Integrados
    const actionsBox = document.createElement('div');
    actionsBox.className = "game-mode-selector-box";
    actionsBox.style.margin = "10px 0";
    actionsBox.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
            <button id="btn-central-pix-dep" style="background:linear-gradient(135deg, #d4af37 0%, #aa841b 100%); color:#000; border:none; padding:8px; border-radius:6px; font-weight:bold; font-size:0.75rem; cursor:pointer;">➕ Depositar PIX</button>
            <button id="btn-central-estorno" style="background:#111; border:1px solid #ef4444; color:#ef4444; padding:8px; border-radius:6px; font-weight:bold; font-size:0.75rem; cursor:pointer;">↩️ Solicitar Estorno</button>
            <button id="btn-central-withdraw" style="background:#111; border:1px solid #22c55e; color:#22c55e; padding:8px; border-radius:6px; font-weight:bold; font-size:0.75rem; cursor:pointer;">💰 Sacar Prêmio</button>
        </div>
    `;
    body.insertBefore(actionsBox, body.children[2]);

    // Vinculação das ações operacionais
    document.getElementById('btn-central-decrease').onclick = () => modifyCentralBetAmount(-5.00);
    document.getElementById('btn-central-increase').onclick = () => modifyCentralBetAmount(5.00);
    document.getElementById('btn-central-pix-dep').onclick = handlePixDepositAction;
    document.getElementById('btn-central-estorno').onclick = handleEstornoRefundAction;
    document.getElementById('btn-central-withdraw').onclick = handleWithdrawalAction;

    updatePayoutInstructionBanner();
    renderDynamicFinancialGrid(null);
}

function modifyCentralBetAmount(step) {
    if (localBetValue + step < 1.00) return;
    localBetValue += step;
    document.getElementById('central-bet-value-txt').innerText = `R$ ${localBetValue.toFixed(2).replace('.', ',')}`;

    if (activeRoomCode && !isLobbyTestingMode) {
        set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betIntent`), localBetValue);
    } else {
        renderDynamicFinancialGrid(null);
    }
}

// 1. SISTEMA DE DEPÓSITO VIA PIX
function handlePixDepositAction() {
    if (!myFinanceId) return alert("Identifique-se no campo de nome primeiro.");
    const depositAmount = 50.00; // Valor padrão de entrada rápida PIX

    runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
        if (!account) return account;
        account.available = (account.available || 0) + depositAmount;
        return account;
    }).then(() => {
        push(ref(db, `finances/${myFinanceId}/history`), {
            type: "Depósito PIX",
            amount: depositAmount,
            timestamp: Date.now(),
            status: "Sucesso"
        });
        alert(`✅ Pagamento Concluído! R$ ${depositAmount.toFixed(2)} inseridos com sucesso.`);
    });
}

// 2. SISTEMA DE SAQUE DO PRÊMIO
function handleWithdrawalAction() {
    if (!myFinanceId) return;
    const pixKey = prompt("Insira sua Chave PIX para transferência dos lucros:");
    if (!pixKey) return;

    const withdrawAmount = parseFloat(prompt(`Saldo Disponível para Saque: R$ ${localWalletBalance.toFixed(2)}\nDigite o valor que deseja retirar:`));
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) return alert("Valor inválido.");

    runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
        if (!account) return account;
        if (account.available < withdrawAmount) {
            alert("Saldo insuficiente na carteira para este saque.");
            return;
        }
        account.available -= withdrawAmount;
        return account;
    }).then((result) => {
        if (result.committed) {
            push(ref(db, `finances/${myFinanceId}/history`), {
                type: "Retirada PIX",
                amount: withdrawAmount,
                pixKey: pixKey,
                timestamp: Date.now(),
                status: "Concluído"
            });
            alert(`💰 Saque efetuado com sucesso! R$ ${withdrawAmount.toFixed(2)} enviados para sua chave PIX.`);
        }
    });
}

// 3. SISTEMA DE ESTORNO / REEMBOLSO (Desistência preventiva antes do jogo começar)
function handleEstornoRefundAction() {
    if (isLobbyTestingMode) return alert("Você está no modo de demonstração. Seu saldo está livre.");

    get(ref(db, `rooms/${activeRoomCode}/${myLocalRole}`)).then((snapshot) => {
        const playerState = snapshot.val();
        if (!playerState || !playerState.betConfirmed) {
            return alert("Você não possui lances presos nesta mesa para estornar.");
        }

        const betToRefund = playerState.betIntent || 20.00;

        // Estorna o valor preso devolvendo-o ao saldo disponível
        runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
            if (!account) return account;
            account.available = (account.available || 0) + betToRefund;
            return account;
        }).then(() => {
            push(ref(db, `finances/${myFinanceId}/history`), {
                type: "Estorno de Aposta",
                amount: betToRefund,
                timestamp: Date.now(),
                status: "Reembolsado"
            });

            // Altera o status na mesa do Firebase para Não Confirmado
            set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betConfirmed`), false);
            alert(`↩️ Estorno concluído! R$ ${betToRefund.toFixed(2)} retornaram para seu saldo livre.`);
        });
    });
}

function updatePayoutInstructionBanner() {
    const titleMode = document.getElementById('bet-prize-title-mode');
    if (!titleMode) return;
    if (currentMode === '1x1') titleMode.innerHTML = "⚔️ MODO 1x1 — VENCEDOR LEVA TUDO <br><small style='color:#8a9a92;'>O vencedor leva 100% dos fundos acumulados na rodada.</small>";
    if (currentMode === 'solo') titleMode.innerHTML = "💀 MATA-MATA SOLO — CAMPEÃO LEVA TUDO <br><small style='color:#8a9a92;'>4 Competidores individuais. Aquele que bater leva a bolada toda.</small>";
    if (currentMode === 'duplas') titleMode.innerHTML = "👑 CLÁSSICO EM DUPLAS — DIVISÃO AUTOMÁTICA <br><small style='color:#8a9a92;'>Premiação dividida igualmente (50% / 50%) para a dupla campeã.</small>";
}

function detectRoomConnection() {
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
        prizeClaimedForRound = false;

        onValue(ref(db, `rooms/${activeRoomCode}`), (snapshot) => {
            const room = snapshot.val();
            if (room) syncPanelStateWithRoom(room);
        });
    }
}

function syncPanelStateWithRoom(room) {
    // Varredura de cadeiras dinâmicas para alinhar a role do jogador local
    myLocalRole = "p1";
    for (let i = 1; i <= 4; i++) {
        if (room[`p${i}`] && room[`p${i}`].name === myCurrentLocalName) {
            myLocalRole = `p${i}`; break;
        }
    }

    currentMode = room.matchMode || "1x1";
    const modeSelect = document.getElementById('select-match-mode');
    if (modeSelect) { 
        modeSelect.value = currentMode; 
        modeSelect.disabled = (myLocalRole !== 'p1'); 
    }

    updatePayoutInstructionBanner();
    renderDynamicFinancialGrid(room);
    checkMatchCompletionAndPayout(room);
}

function renderDynamicFinancialGrid(room) {
    const container = document.getElementById('bet-grid-players-container');
    if (!container) return;
    container.innerHTML = '';

    const slotsCount = (currentMode === "1x1") ? 2 : 4;
    let totalPrize = 0;
    let allBetsEqual = true;
    let referenceBet = null;
    let pendingConfirmations = 0;
    let totalPlayersConnected = 0;
    let fundsErrorDetected = false;

    for (let i = 1; i <= slotsCount; i++) {
        const card = document.createElement('div');
        card.className = "bet-player-card";

        // MODO DESIGN LOBBY: Exibição visual simulada pré-jogo
        if (isLobbyTestingMode) {
            if (i === 1) {
                totalPlayersConnected++;
                totalPrize += localBetValue;
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name">👤 Slot 1: ${myCurrentLocalName} (Você)</span>
                        <span class="p-grid-bet">Aposta Escolhida: R$ ${localBetValue.toFixed(2).replace('.', ',')}</span>
                        <span class="p-grid-status" style="color:#ef4444">Aguardando Confirmação Manual</span>
                    </div>
                    <div class="status-indicator-icon">❌</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="p-meta-data">
                        <span class="p-grid-name" style="color:#555">👤 Slot ${i}: Livre para Pareamento</span>
                        <span class="p-grid-bet">Valor: R$ 0,00</span>
                    </div>
                    <div class="status-indicator-icon">⏳</div>
                `;
            }
            container.appendChild(card);
            continue;
        }

        // MODO SINCRONIZADO REAL: Lê as contas de p1 a p4 conectadas à mesa
        const player = room ? room[`p${i}`] : null;

        if (player && player.name) {
            totalPlayersConnected++;
            const betVal = player.betIntent || 20.00;
            totalPrize += betVal;

            if (referenceBet === null) referenceBet = betVal;
            else if (betVal !== referenceBet) allBetsEqual = false;

            const isConfirmed = !!player.betConfirmed;
            if (!isConfirmed) pendingConfirmations++;

            // Auditoria de Caixa em tempo real: bloqueia se o jogador tentar dar OK sem ter o saldo
            const currentWalletRef = player.cachedBalance || 0;
            const hasFunds = currentWalletRef >= betVal || isConfirmed;
            if (!hasFunds) fundsErrorDetected = true;

            if (isConfirmed) card.classList.add('confirmed');

            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name">👤 Slot ${i}: ${player.name} ${player.name === myCurrentLocalName ? '(Você)' : ''}</span>
                    <span class="p-grid-bet">Aposta: R$ ${betVal.toFixed(2)} | Carteira: R$ ${pBalance.toFixed(2)}</span>
                    <span class="p-grid-status" style="color:${!hasFunds ? '#ef4444' : isConfirmed ? '#22c55e' : '#eab308'}">
                        ${!hasFunds ? '❌ Bloqueado: Sem Saldo Suficiente' : isConfirmed ? 'Lance Confirmado e Pago ✅' : 'Aguardando Pagamento/Confirmação'}
                    </span>
                </div>
                <div class="status-indicator-icon">${!hasFunds ? '⚠️' : isConfirmed ? '✅' : '❌'}</div>
            `;
        } else {
            allBetsEqual = false;
            card.innerHTML = `
                <div class="p-meta-data">
                    <span class="p-grid-name" style="color:#6b7280">👤 Slot ${i}: Vago</span>
                    <span class="p-grid-bet">Aguardando entrada de oponente...</span>
                </div>
                <div class="status-indicator-icon">⏳</div>
            `;
        }
        container.appendChild(card);
    }

    // Renderiza a soma automática do prêmio visível no centro da aba
    const prizeDisplay = document.getElementById('bet-prize-total-val');
    if (prizeDisplay) {
        const finalValue = isLobbyTestingMode ? (slotsCount * localBetValue) : totalPrize;
        prizeDisplay.innerText = `PRÊMIO TOTAL ACUMULADO: R$ ${finalValue.toFixed(2).replace('.', ',')}`;
    }

    const banner = document.getElementById('bet-panel-validation-banner');
    const mainStartBtn = document.getElementById('btn-create-room');

    if (isLobbyTestingMode) return;

    // SISTEMA DE VALIDAÇÕES AUTOMÁTICAS ANTES DO START
    if (totalPlayersConnected < slotsCount) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Aguardando entrada de todos os ${slotsCount} jogadores nos slots...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (fundsErrorDetected) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Bloqueio Automático: Existem jogadores sem saldo PIX suficiente para cobrir o lance.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (!allBetsEqual) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = "Divergência de Aposta: Todos os jogadores precisam escolher o mesmo valor.";
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else if (pendingConfirmations > 0) {
        banner.className = "bet-banner-status bet-banner-error";
        banner.innerText = `Apostas compatíveis! Aguardando a confirmação manual de ${pendingConfirmations} jogadores...`;
        if (mainStartBtn) mainStartBtn.disabled = true;
    } else {
        // CONDIÇÃO EXCLUSIVA DE SUCESSO: Remove o painel e starta a partida automaticamente
        banner.className = "bet-banner-status bet-banner-success";
        banner.innerText = "✅ Tudo pronto! Todos confirmaram e pagaram. Iniciando partida...";
        if (mainStartBtn) mainStartBtn.disabled = false;

        setTimeout(() => {
            const centralPanel = document.getElementById('bet-central-panel');
            const gameScreen = document.getElementById('game-screen');
            if (centralPanel) centralPanel.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden'); // Exibe a tela do jogo
        }, 1200);
    }

    const myBtn = document.getElementById('btn-confirm-my-bet');
    if (myBtn && myLocalRole && room) {
        const iHaveConfirmed = room[myLocalRole]?.betConfirmed;
        myBtn.disabled = !allBetsEqual || (totalPlayersConnected < slotsCount) || fundsErrorDetected || iHaveConfirmed;
        myBtn.innerText = iHaveConfirmed ? "Seu Lance está Confirmado ✅" : "Confirmar Minha Aposta";
    }
}

// RESERVA DE FUNDOS DAS CARTEIRAS DIGITAIS
function handleLockBetFundsTransaction() {
    if (isLobbyTestingMode) return alert("Aposta simulada ativada com sucesso!");

    if (localWalletBalance < localBetValue) {
        return alert("❌ Erro de Caixa: Saldo insuficiente. Faça um depósito via PIX clicando no botão acima.");
    }

    // Retira do saldo disponível da conta
    runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
        if (!account) return account;
        account.available -= localBetValue;
        return account;
    }).then(() => {
        push(ref(db, `finances/${myFinanceId}/history`), {
            type: "Aposta Presa em Mesa",
            amount: localBetValue,
            timestamp: Date.now(),
            room: activeRoomCode,
            status: "Reservado"
        });

        // Envia confirmação real para a sala
        set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betConfirmed`), true);
        set(ref(db, `rooms/${activeRoomCode}/${myLocalRole}/betIntent`), localBetValue);
    });
}

// 4. DIVISÃO E PAGAMENTO AUTOMÁTICO DE PRÊMIOS NO FIM DA PARTIDA
function checkMatchCompletionAndPayout(room) {
    if (prizeClaimedForRound || !room.chain || room.chain.length === 0) return;

    const p1Pieces = room.p1?.hand ? room.p1.hand.length : 7;
    const p2Pieces = room.p2?.hand ? room.p2.hand.length : 7;
    const p3Pieces = room.p3?.hand ? room.p3.hand.length : 7;
    const p4Pieces = room.p4?.hand ? room.p4.hand.length : 7;

    const slotsCount = (currentMode === "1x1") ? 2 : 4;
    let matchEnded = false;
    let winnerRole = null;

    if (slotsCount === 2 && (p1Pieces === 0 || p2Pieces === 0)) {
        matchEnded = true; winnerRole = (p1Pieces === 0) ? 'p1' : 'p2';
    } else if (slotsCount === 4 && (p1Pieces === 0 || p2Pieces === 0 || p3Pieces === 0 || p4Pieces === 0)) {
        matchEnded = true;
        if (p1Pieces === 0) winnerRole = 'p1';
        else if (p2Pieces === 0) winnerRole = 'p2';
        else if (p3Pieces === 0) winnerRole = 'p3';
        else winnerRole = 'p4';
    }

    if (matchEnded && !prizeClaimedForRound) {
        prizeClaimedForRound = true;

        // Calcula o montante total somando o lance de todos
        let totalPrizePool = 0;
        for(let i = 1; i <= slotsCount; i++) {
            totalPrizePool += (room[`p${i}`]?.betIntent || 20.00);
        }

        // Executa as regras de distribuição com base no Modo Escolhido
        if (currentMode === '1x1' || currentMode === 'solo') {
            // Modos Individuais: Campeão leva 100% da bolada sozinho
            if (myLocalRole === winnerRole) {
                executePayoutTransfer(totalPrizePool, "Vitória Solo Dominó");
            }
        } else if (currentMode === 'duplas') {
            // Modo Clássico Duplas: Divide 50/50 entre os parceiros da equipe vitoriosa
            // Dupla A: p1 + p3 | Dupla B: p2 + p4
            let isWinnerInMyTeam = false;
            if ((winnerRole === 'p1' || winnerRole === 'p3') && (myLocalRole === 'p1' || myLocalRole === 'p3')) isWinnerInMyTeam = true;
            if ((winnerRole === 'p2' || winnerRole === 'p4') && (myLocalRole === 'p2' || myLocalRole === 'p4')) isWinnerInMyTeam = true;

            if (isWinnerInMyTeam) {
                const splitPrize = totalPrizePool / 2;
                executePayoutTransfer(splitPrize, "Vitória em Dupla (Split 50%)");
            }
        }
    }
}

function executePayoutTransfer(prizeValue, motiveText) {
    runTransaction(ref(db, `finances/${myFinanceId}`), (account) => {
        if (!account) return account;
        account.available = (account.available || 0) + prizeValue;
        return account;
    }).then(() => {
        push(ref(db, `finances/${myFinanceId}/history`), {
            type: "Premiação Recebida",
            amount: prizeValue,
            motive: motiveText,
            timestamp: Date.now(),
            status: "Creditado"
        });
        
        // Dispara a animação premium de vitória na tela
        triggerVictoryScreenAnimation(prizeValue, motiveText);
    });
}

function triggerVictoryScreenAnimation(amountWon, typeText) {
    const overlay = document.createElement('div');
    overlay.style = "position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:99999; display:flex; justify-content:center; align-items:center; color:#fff; text-align:center; font-family:sans-serif;";
    overlay.innerHTML = `
        <div style="background:#111; border:2px solid #d4af37; padding:2.5rem; border-radius:16px; box-shadow:0 0 40px rgba(212,175,55,0.4); max-width:420px; width:90%;">
            <h1 style="color:#d4af37; margin-bottom:5px;">🏆 PARABÉNS!</h1>
            <p style="color:#8a9a92; font-size:0.9rem; margin-bottom:20px;">${typeText}</p>
            <div style="background:#000; border:1px dashed #22c55e; padding:1.5rem; border-radius:12px; margin-bottom:20px;">
                <span style="font-size:0.8rem; color:#8a9a92; display:block; font-weight:bold;">VALOR ENVIADO PARA A CARTEIRA</span>
                <span style="font-size:2rem; font-weight:900; color:#22c55e;">R$ ${amountWon.toFixed(2).replace('.', ',')}</span>
            </div>
            <button id="btn-close-victory" style="width:100%; background:linear-gradient(135deg, #d4af37 0%, #aa841b 100%); color:#000; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">Voltar ao Lobby</button>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('btn-close-victory').onclick = () => {
        overlay.remove();
        window.location.reload(); // Recarrega para limpar os nós e preparar novas rodadas
    };
}
