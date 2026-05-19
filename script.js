import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Sua configuração do Firebase (Mantenha as chaves oficiais)
const firebaseConfig = {
    apiKey: "AIzaSyCZ4rOliexofYP8vyRLzUeX3mf5uXG6WRM",
    authDomain: "aposta-96213.firebaseapp.com",
    databaseURL: "https://aposta-96213-default-rtdb.firebaseio.com",
    projectId: "aposta-96213"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomCode = null;
let myRole = null; 
let myHand = [];
let leftEdge = null;
let rightEdge = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-create-room').onclick = createPremiumMatchSession;
    document.getElementById('btn-join-room').onclick = joinPremiumMatchSession;
    document.getElementById('btn-draw').onclick = executeDrawPieceAction;
    document.getElementById('btn-pass').onclick = executePassTurnAction;
    
    // Remove tela de loading inicial
    setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 800);
});

// GERAÇÃO AUTOMÁTICA DE CÓDIGO DE SALA
function createPremiumMatchSession() {
    const name = document.getElementById('player-name').value.trim() || "Joabe Play";
    currentRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
    myRole = "p1";

    const allPieces = generateCompleteDominoDeck();
    const p1Hand = allPieces.splice(0, 7);
    const p2Hand = allPieces.splice(0, 7);

    const roomData = {
        code: currentRoomCode,
        status: "waiting",
        turn: "p1",
        deck: allPieces,
        p1: { name: name, hand: p1Hand, points: 0 },
        p2: { name: "Aguardando...", hand: p2Hand, points: 0 },
        chain: []
    };

    set(ref(db, `rooms/${currentRoomCode}`), roomData).then(() => {
        document.getElementById('generated-code').innerText = currentRoomCode;
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('waiting-screen').classList.remove('hidden');
        listenToRoomDatabaseUpdates();
    });
}

function joinPremiumMatchSession() {
    const name = document.getElementById('player-name').value.trim() || "Oponente";
    const code = document.getElementById('room-code-input').value.trim();
    if(!code) return alert("Insira um código válido.");

    get(ref(db, `rooms/${code}`)).then((snapshot) => {
        if(!snapshot.exists()) return alert("Sala não encontrada.");
        currentRoomCode = code;
        myRole = "p2";

        set(ref(db, `rooms/${code}/p2/name`), name);
        set(ref(db, `rooms/${code}/status`), "active").then(() => {
            document.getElementById('lobby-screen').classList.add('hidden');
            listenToRoomDatabaseUpdates();
        });
    });
}

function generateCompleteDominoDeck() {
    let deck = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) { deck.push({ sideA: i, sideB: j }); }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function listenToRoomDatabaseUpdates() {
    onValue(ref(db, `rooms/${currentRoomCode}`), (snapshot) => {
        const room = snapshot.val();
        if(!room) return;

        if(room.status === "active") {
            document.getElementById('waiting-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            
            document.getElementById('score-p1-name').innerText = room.p1.name;
            document.getElementById('score-p2-name').innerText = room.p2.name;
            document.getElementById('score-p1-val').innerText = room.p1.points.toString().padStart(2, '0');
            document.getElementById('score-p2-val').innerText = room.p2.points.toString().padStart(2, '0');
            
            document.getElementById('turn-indicator').innerText = room.turn === myRole ? "Sua Vez de Jogar!" : `Vez de: ${room[room.turn].name}`;
            document.getElementById('game-room-id').innerText = `#${currentRoomCode}`;

            myHand = room[myRole].hand || [];
            renderPlayerHandUI(myHand);
            renderTableChainUI(room.chain || []);
            evaluateControlsAndValidation(room);
        }
    });
}

// RENDERIZAÇÃO COMPLETA DAS PEDRAS CLÁSSICAS
function renderPlayerHandUI(hand) {
    const container = document.getElementById('my-hand');
    container.innerHTML = '';
    
    hand.forEach((piece, index) => {
        const pElem = document.createElement('div');
        pElem.className = 'domino-piece';
        pElem.onclick = () => handleTablePlacementAttempt(piece, index);

        pElem.innerHTML = `
            <div class="domino-half">${generateDotsHTML(piece.sideA)}</div>
            <div class="domino-half">${generateDotsHTML(piece.sideB)}</div>
        `;
        container.appendChild(pElem);
    });
}

function generateDotsHTML(value) {
    let dots = '';
    const positions = {
        1: [3], 2: [1, 5], 3: [1, 3, 5],
        4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 4, 5, 6, 7]
    };
    if(value === 0) return '';
    positions[value].forEach(pos => { dots += `<div class="dot pos-${pos}"></div>`; });
    return dots;
}

function renderTableChainUI(chain) {
    const container = document.getElementById('domino-chain');
    container.innerHTML = '';

    if(chain.length === 0) {
        leftEdge = null; rightEdge = null; return;
    }

    leftEdge = chain[0].sideA;
    rightEdge = chain[chain.length - 1].sideB;

    chain.forEach(piece => {
        const pElem = document.createElement('div');
        pElem.className = 'domino-piece horizontal';
        pElem.innerHTML = `
            <div class="domino-half">${generateDotsHTML(piece.sideA)}</div>
            <div class="domino-half">${generateDotsHTML(piece.sideB)}</div>
        `;
        container.appendChild(pElem);
    });
}

// VALIDAÇÃO CIENTÍFICA DE REGRAS REAIS DO DOMINÓ
function handleTablePlacementAttempt(piece, index) {
    get(ref(db, `rooms/${currentRoomCode}`)).then((snapshot) => {
        const room = snapshot.val();
        if(room.turn !== myRole) return alert("Não é o seu turno!");

        let valid = false;
        let nextChain = room.chain || [];

        if(nextChain.length === 0) {
            valid = true;
            nextChain.push(piece);
        } else {
            // Teste ponta esquerda
            if(piece.sideB === leftEdge) {
                nextChain.unshift(piece); valid = true;
            } else if(piece.sideA === leftEdge) {
                nextChain.unshift({ sideA: piece.sideB, sideB: piece.sideA }); valid = true;
            }
            // Teste ponta direita
            else if(piece.sideA === rightEdge) {
                nextChain.push(piece); valid = true;
            } else if(piece.sideB === rightEdge) {
                nextChain.push({ sideA: piece.sideB, sideB: piece.sideA }); valid = true;
            }
        }

        if(!valid) return alert("Jogada Inválida! Esta peça não casa com as pontas da mesa.");

        myHand.splice(index, 1);
        const nextTurn = myRole === "p1" ? "p2" : "p1";

        // Verificação de Vitória por Fim de Peças
        if(myHand.length === 0) {
            alert("🏆 Você venceu a rodada!");
            room[myRole].points += 1;
            set(ref(db, `rooms/${currentRoomCode}/status`), "finished");
        }

        set(ref(db, `rooms/${currentRoomCode}/${myRole}/hand`), myHand);
        set(ref(db, `rooms/${currentRoomCode}/chain`), nextChain);
        set(ref(db, `rooms/${currentRoomCode}/turn`), nextTurn);
    });
}

function evaluateControlsAndValidation(room) {
    const hasDrawOption = room.deck && room.deck.length > 0;
    let canPlay = false;

    myHand.forEach(piece => {
        if(leftEdge === null || piece.sideA === leftEdge || piece.sideB === leftEdge || piece.sideA === rightEdge || piece.sideB === rightEdge) {
            canPlay = true;
        }
    });

    document.getElementById('btn-draw').classList.toggle('hidden', canPlay || !hasDrawOption || room.turn !== myRole);
    document.getElementById('btn-pass').classList.toggle('hidden', canPlay || hasDrawOption || room.turn !== myRole);
}

function executeDrawPieceAction() {
    runTransaction(ref(db, `rooms/${currentRoomCode}`), (room) => {
        if(!room || room.turn !== myRole || !room.deck || room.deck.length === 0) return room;
        const drawn = room.deck.pop();
        if(!room[myRole].hand) room[myRole].hand = [];
        room[myRole].hand.push(drawn);
        return room;
    });
}

function executePassTurnAction() {
    const nextTurn = myRole === "p1" ? "p2" : "p1";
    set(ref(db, `rooms/${currentRoomCode}/turn`), nextTurn);
}
