import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const roomCode = localStorage.getItem("roomCode");
const myPlayerId = localStorage.getItem("myPlayerId"); // 'p1' ou 'p2'

let roomRef = null;
let gameState = null;
let minhaMao = [];

// Inicialização de áudio nativo (Sons reais sem precisar de arquivos externos pesados)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playDominoSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.12);
}

if (!roomCode) {
    alert("Sessão inválida. Voltando ao lobby.");
    window.location.href = "index.html";
} else {
    roomRef = doc(db, "rooms", roomCode);
    document.getElementById("roomInfo").innerText = "SALA: " + roomCode;
    initGameListener();
}

// Ouvinte em tempo real do Firebase (Sincronização Absoluta)
function initGameListener() {
    onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) return;
        gameState = snapshot.data();
        
        // Gerencia reconexão e atribuição das peças iniciais se p1 detectar início
        if (gameState.status === "ready" && myPlayerId === "p1") {
            distribuirPecasIniciais();
            return;
        }

        renderizarMesa();
        atualizarChat();
    });
}

// Lógica de Geração e Distribuição das 28 Peças Oficiais Brasileiras
async function distribuirPecasIniciais() {
    const pool = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            pool.push([i, j]);
        }
    }
    // Embaralhar
    pool.sort(() => Math.random() - 0.5);

    const maoP1 = pool.splice(0, 7);
    const maoP2 = pool.splice(0, 7);

    // O jogador que tiver a maior bucha (geralmente [6,6]) começa. Vamos simplificar definindo p1 inicialmente
    await updateDoc(roomRef, {
        deck: pool,
        "player1.hand": maoP1,
        "player2.hand": maoP2,
        status: "playing",
        currentTurn: "p1"
    });
}

function renderizarMesa() {
    const p1 = gameState.player1;
    const p2 = gameState.player2;

    if (!p2) return;

    // Atualiza Placar e Cabeçalho
    document.getElementById("p1-status").innerText = `${p1.avatar} ${p1.name}: ${p1.points} pts`;
    document.getElementById("p2-status").innerText = `${p2.avatar} ${p2.name}: ${p2.points} pts`;
    document.getElementById("painelAposta").innerText = `Aposta: ${gameState.bet} 🪙`;
    document.getElementById("carroCount").innerText = `Carro (Compra): ${gameState.deck ? gameState.deck.length : 0} pçs`;

    // Informar de quem é o turno
    const oponenteNome = myPlayerId === "p1" ? p2.name : p1.name;
    if (gameState.currentTurn === myPlayerId) {
        document.getElementById("statusVez").innerText = "SUA VEZ DE JOGAR!";
        document.getElementById("statusVez").style.color = "#00ffcc";
    } else {
        document.getElementById("statusVez").innerText = `Vez de ${oponenteNome}`;
        document.getElementById("statusVez").style.color = "#ff5555";
    }

    // Renderizar Tabuleiro central
    const boardDiv = document.getElementById("gameBoard");
    boardDiv.innerHTML = "";
    
    gameState.board.forEach((piece) => {
        const pieceEl = criarElementoPeca(piece[0], piece[1], false);
        boardDiv.appendChild(pieceEl);
    });

    // Renderizar Minha Mão
    const minhaMaoDados = myPlayerId === "p1" ? p1.hand : p2.hand;
    minhaMao = minhaMaoDados || [];
    
    const handDiv = document.getElementById("playerHand");
    handDiv.innerHTML = "";
    
    minhaMao.forEach((piece, index) => {
        const pieceEl = criarElementoPeca(piece[0], piece[1], true, index);
        handDiv.appendChild(pieceEl);
    });

    // Ativar/Desativar botões de compra e passagem baseados nas regras
    const podeJogar = gameState.currentTurn === myPlayerId && gameState.status === "playing";
    document.getElementById("btnComprar").disabled = !(podeJogar && gameState.deck.length > 0);
    document.getElementById("btnPassar").disabled = !(podeJogar && gameState.deck.length === 0 && !verificarSeTemJogadaPossivel());
}

// Cria visual estruturado em CSS para simular a peça real
function criarElementoPeca(ladoA, ladoB, interativa, index = null) {
    const el = document.createElement("div");
    el.className = "domino-piece";
    if (ladoA !== ladoB) el.className += " horizontal";

    el.innerHTML = `
        <div class="domino-half">${ladoA}</div>
        <div class="domino-line"></div>
        <div class="domino-half">${ladoB}</div>
    `;

    if (interativa && index !== null) {
        el.addEventListener("click", () => tentarJogarPeca(index));
    }
    return el;
}

function verificarSeTemJogadaPossivel() {
    if (gameState.board.length === 0) return true;
    const pontaEsquerda = gameState.board[0][0];
    const pontaDireita = gameState.board[gameState.board.length - 1][1];

    return minhaMao.some(p => p[0] === pontaEsquerda || p[1] === pontaEsquerda || p[0] === pontaDireita || p[1] === pontaDireita);
}

// Validação de Regras do Dominó Brasileiro
async function tentarJogarPeca(index) {
    if (gameState.currentTurn !== myPlayerId || gameState.status !== "playing") return;

    const peca = minhaMao[index];
    let novoBoard = [...gameState.board];

    if (novoBoard.length === 0) {
        novoBoard.push(peca);
    } else {
        const pontaEsquerda = novoBoard[0][0];
        const pontaDireita = novoBoard[novoBoard.length - 1][1];

        // Tenta encaixar na direita ou esquerda fazendo o giro automático dos lados se necessário
        if (peca[0] === pontaDireita) {
            novoBoard.push(peca);
        } else if (peca[1] === pontaDireita) {
            novoBoard.push([peca[1], peca[0]]);
        } else if (peca[1] === pontaEsquerda) {
            novoBoard.unshift(peca);
        } else if (peca[0] === pontaEsquerda) {
            novoBoard.unshift([peca[1], peca[0]]);
        } else {
            alert("Esta peça não se encaixa em nenhuma das pontas da mesa!");
            return;
        }
    }

    playDominoSound();
    minhaMao.splice(index, 1);

    const proximoTurno = myPlayerId === "p1" ? "p2" : "p1";
    const campoMaoUpdate = myPlayerId === "p1" ? "player1.hand" : "player2.hand";

    // Checagem de Vitória por Batida
    if (minhaMao.length === 0) {
        gameState.status = "finished";
        alert("Parabéns! Você bateu o jogo e ganhou as moedas!");
    }

    await updateDoc(roomRef, {
        board: novoBoard,
        [campoMaoUpdate]: minhaMao,
        currentTurn: proximoTurno,
        status: gameState.status
    });
}

// Ação de Comprar do Carro
document.getElementById("btnComprar").addEventListener("click", async () => {
    if (gameState.currentTurn !== myPlayerId || gameState.deck.length === 0) return;

    const novoDeck = [...gameState.deck];
    const pecaComprada = novoDeck.pop();
    minhaMao.push(pecaComprada);

    const campoMaoUpdate = myPlayerId === "p1" ? "player1.hand" : "player2.hand";

    await updateDoc(roomRef, {
        deck: novoDeck,
        [campoMaoUpdate]: minhaMao
    });
});

// Ação de Passar a Vez
document.getElementById("btnPassar").addEventListener("click", async () => {
    if (gameState.currentTurn !== myPlayerId) return;
    const proximoTurno = myPlayerId === "p1" ? "p2" : "p1";
    
    await updateDoc(roomRef, {
        currentTurn: proximoTurno
    });
});

// Sistema de Chat em Tempo Real integrado na partida
const btnEnviarChat = document.getElementById("btnEnviarChat");
const chatInput = document.getElementById("chatInput");

async function enviarMensagemChat() {
    const texto = chatInput.value.trim();
    if (!texto) return;

    const nomeUsuario = localStorage.getItem("playerName") || "Jogador";
    await updateDoc(roomRef, {
        chat: arrayUnion({ sender: nomeUsuario, text: texto })
    });
    chatInput.value = "";
}

btnEnviarChat.addEventListener("click", enviarMensagemChat);
chatInput.addEventListener("keypress", (e) => { if(e.key === 'Enter') enviarMensagemChat(); });

function atualizarChat() {
    const chatMessages = document.getElementById("chatMessages");
    chatMessages.innerHTML = "";
    if (gameState.chat) {
        gameState.chat.forEach(msg => {
            const div = document.createElement("div");
            div.className = "chat-msg";
            div.innerHTML = `<span class="author">${msg.sender}:</span> ${msg.text}`;
            chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll para as últimas mensagens
    }
}
