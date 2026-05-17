import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Recupera os dados guardados no login
const roomCode = localStorage.getItem("roomCode");
const myPlayerId = localStorage.getItem("myPlayerId"); // "p1" ou "p2"
const myName = localStorage.getItem("playerName") || "Jogador";

if (!roomCode || !myPlayerId) {
    alert("Sala não encontrada! Voltando ao lobby.");
    window.location.href = "index.html";
}

// Referência da sala no Firebase
const roomRef = doc(db, "rooms", roomCode);
let dadosPartida = null;

// Elementos da Interface
const gameBoard = document.getElementById("gameBoard");
const playerHand = document.getElementById("playerHand");
const statusVez = document.getElementById("statusVez");
const btnComprar = document.getElementById("btnComprar");
const btnPassar = document.getElementById("btnPassar");
const btnIniciar = document.getElementById("btnIniciar");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const btnEnviarChat = document.getElementById("btnEnviarChat");

// 1. Escuta o Banco de Dados em Tempo Real (Sincronização Online)
onSnapshot(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
        alert("A sala foi encerrada.");
        window.location.href = "index.html";
        return;
    }

    dadosPartida = snapshot.data();
    atualizarInterface();
});

// 2. Atualiza os elementos visuais na tela
function atualizarInterface() {
    // Configurações básicas da sala
    document.getElementById("displayCodigo").innerText = `SALA: ${dadosPartida.roomCode}`;
    document.getElementById("displayAposta").innerText = `APOSTA: ${dadosPartida.bet} Moedas`;
    document.getElementById("displayStatus").innerText = `STATUS: ${dadosPartida.status.toUpperCase()}`;

    // Mostra nomes e avatares
    document.getElementById("p1Display").innerText = `(p1) ${dadosPartida.player1.avatar} ${dadosPartida.player1.name}`;
    if (dadosPartida.player2) {
        document.getElementById("p2Display").innerText = `${dadosPartida.player2.avatar} ${dadosPartida.player2.name} (p2)`;
    } else {
        document.getElementById("p2Display").innerText = "Aguardando oponente...";
    }

    // Controle do Botão de Iniciar (Apenas para o Criador da Sala 'p1')
    if (myPlayerId === "p1" && dadosPartida.status === "ready") {
        btnIniciar.style.display = "inline-block";
    } else {
        btnIniciar.style.display = "none";
    }

    // Renderiza o Tabuleiro e a Mão do jogador se o jogo começou
    if (dadosPartida.status === "playing") {
        renderizarTabuleiro(dadosPartida.board);
        renderizarMao(myPlayerId === "p1" ? dadosPartida.player1Hand : dadosPartida.player2Hand);
        gerenciarTurnoEAcoes();
    }

    // Atualiza o Chat
    renderizarChat(dadosPartida.chat || []);
}

// 3. Lógica de início de jogo (Gera e distribui as 28 peças)
btnIniciar.addEventListener("click", async () => {
    let todasPecas = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            todasPecas.push([i, j]);
        }
    }
    // Embaralha as peças
    todasPecas.sort(() => Math.random() - 0.5);

    // Distribui 7 para cada um
    const player1Hand = todasPecas.splice(0, 7);
    const player2Hand = todasPecas.splice(0, 7);

    await updateDoc(roomRef, {
        status: "playing",
        deck: todasPecas, // O que sobrou vai para o monte de compra
        player1Hand: player1Hand,
        player2Hand: player2Hand,
        board: [],
        currentTurn: "p1"
    });
});

// 4. Renderiza as peças jogadas no centro da mesa
function renderizarTabuleiro(board) {
    gameBoard.innerHTML = "";
    if (board.length === 0) {
        gameBoard.innerHTML = "<p style='color: rgba(255,255,255,0.4)'>O tabuleiro está vazio. Faça a primeira jogada!</p>";
        return;
    }

    board.forEach((peca) => {
        const div = document.createElement("div");
        div.className = "domino-piece horizontal";
        div.innerHTML = `
            <div class="domino-half">${peca[0]}</div>
            <div class="domino-line"></div>
            <div class="domino-half">${peca[1]}</div>
        `;
        gameBoard.appendChild(div);
    });
}

// 5. Renderiza as peças na mão do jogador atual
function renderizarMao(mao) {
    playerHand.innerHTML = "";
    if (!mao || mao.length === 0) return;

    mao.forEach((peca, index) => {
        const div = document.createElement("div");
        div.className = "domino-piece";
        div.innerHTML = `
            <div class="domino-half">${peca[0]}</div>
            <div class="domino-line"></div>
            <div class="domino-half">${peca[1]}</div>
        `;
        // Adiciona o evento de clique para tentar jogar a peça
        div.addEventListener("click", () => tentarJogarPeca(index));
        playerHand.appendChild(div);
    });
}

// 6. Gerencia as regras de Turno, Destaque Visual e botões de Compra
function gerenciarTurnoEAcoes() {
    const meuTurno = dadosPartida.currentTurn === myPlayerId;
    
    if (meuTurno) {
        statusVez.innerText = "SUA VEZ DE JOGAR!";
        statusVez.style.color = "#58a6ff";
        
        // Ativa o monte de compra se ainda houver peças no deck
        if (dadosPartida.deck && dadosPartida.deck.length > 0) {
            btnComprar.disabled = false;
            btnPassar.style.display = "none";
        } else {
            btnComprar.disabled = true;
            btnPassar.style.display = "inline-block"; // Se o monte acabar, libera passar a vez
        }
    } else {
        const nomeOponente = myPlayerId === "p1" ? dadosPartida.player2?.name : dadosPartida.player1?.name;
        statusVez.innerText = `Aguardando jogada de ${nomeOponente || 'Oponente'}...`;
        statusVez.style.color = "#f0e68c";
        btnComprar.disabled = true;
        btnPassar.style.display = "none";
    }
}

// 7. Validação Oficial de Jogadas do Dominó Brasileiro
async function tentarJogarPeca(index) {
    if (dadosPartida.currentTurn !== myPlayerId) {
        return alert("Não é a sua vez!");
    }

    const maoAtual = myPlayerId === "p1" ? dadosPartida.player1Hand : dadosPartida.player2Hand;
    let peca = maoAtual[index];
    let tabuleiro = [...dadosPartida.board];

    // Se o tabuleiro estiver vazio, qualquer peça pode abrir a partida
    if (tabuleiro.length === 0) {
        tabuleiro.push(peca);
        maoAtual.splice(index, 1);
        await finalizarJogada(tabuleiro, maoAtual);
        return;
    }

    // Pega os valores livres das duas extremidades do tabuleiro
    const pontaEsquerda = tabuleiro[0][0];
    const pontaDireita = tabuleiro[tabuleiro.length - 1][1];

    // Valida e joga na Direita
    if (peca[0] === pontaDireita) {
        tabuleiro.push(peca);
        maoAtual.splice(index, 1);
    } else if (peca[1] === pontaDireita) {
        tabuleiro.push([peca[1], peca[0]]); // Inverte a peça se necessário
        maoAtual.splice(index, 1);
    } 
    // Valida e joga na Esquerda
    else if (peca[1] === pontaEsquerda) {
        tabuleiro.unshift(peca);
        maoAtual.splice(index, 1);
    } else if (peca[0] === pontaEsquerda) {
        tabuleiro.unshift([peca[1], peca[0]]); // Inverte a peça se necessário
        maoAtual.splice(index, 1);
    } else {
        return alert("Essa peça não encaixa em nenhuma das pontas do tabuleiro!");
    }

    await finalizarJogada(tabuleiro, maoAtual);
}

// 8. Envia os dados atualizados para a nuvem e checa vitória
async function finalizarJogada(novoTabuleiro, novaMao) {
    const proximoTurno = myPlayerId === "p1" ? "p2" : "p1";
    
    let atualizacao = {
        board: novoTabuleiro,
        currentTurn: proximoTurno
    };

    if (myPlayerId === "p1") atualizacao.player1Hand = novaMao;
    else atualizacao.player2Hand = novaMao;

    // Detecta Vitória Automática (Ficou sem peças na mão)
    if (novaMao.length === 0) {
        atualizacao.status = "finished";
        alert(`PARABÉNS! Você venceu a partida!`);
        window.location.href = "index.html";
    }

    await updateDoc(roomRef, updateDocDataClean(atualizacao));
}

// 9. Lógica do Sistema de Compra de Peças (Monte)
btnComprar.addEventListener("click", async () => {
    if (dadosPartida.currentTurn !== myPlayerId) return;

    let deck = [...dadosPartida.deck];
    if (deck.length === 0) return alert("O monte de compra está vazio!");

    const pecaComprada = deck.pop();
    const maoAtual = myPlayerId === "p1" ? dadosPartida.player1Hand : dadosPartida.player2Hand;
    maoAtual.push(pecaComprada);

    let atualizacao = { deck: deck };
    if (myPlayerId === "p1") atualizacao.player1Hand = maoAtual;
    else atualizacao.player2Hand = maoAtual;

    await updateDoc(roomRef, atualizacao);
});

// Passar a vez (Caso não tenha peças no monte e nenhuma jogada válida)
btnPassar.addEventListener("click", async () => {
    if (dadosPartida.currentTurn !== myPlayerId) return;
    const proximoTurno = myPlayerId === "p1" ? "p2" : "p1";
    await updateDoc(roomRef, { currentTurn: proximoTurno });
});

// 10. Lógica de Chat em Tempo Real
btnEnviarChat.addEventListener("click", enviarMensagem);
chatInput.addEventListener("keypress", (e) => { if (e.key === 'Enter') enviarMensagem(); });

async function enviarMensagem() {
    const texto = chatInput.value.trim();
    if (!texto) return;

    const novoChat = dadosPartida.chat || [];
    novoChat.push({ sender: myName, text: texto });

    await updateDoc(roomRef, { chat: novoChat });
    chatInput.value = "";
}

function renderizarChat(mensagens) {
    chatMessages.innerHTML = "";
    mensagens.forEach((msg) => {
        const p = document.createElement("p");
        p.className = "chat-msg";
        p.innerHTML = `<span class="author">${msg.sender}:</span> ${msg.text}`;
        chatMessages.appendChild(p);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight; // Desce o scroll automaticamente
}

function updateDocDataClean(obj) { return obj; }
