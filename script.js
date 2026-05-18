import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Suas credenciais oficiais inseridas de forma nativa no módulo central
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

// Inicialização das instâncias
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Estado Local da Sessão
let gameState = {
    roomCode: null,
    playerRole: null, 
    playerName: '',
    hand: [],
    isMyTurn: false
};

// Gerador de Áudio Interno contra quebras de asset no Github Pages
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playDominoSound(frequency = 300, type = 'sine', duration = 0.08) {
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { console.log("Áudio aguardando interação inicial."); }
}

// Mapeamento dos Telas
const screens = {
    loading: document.getElementById('loading-screen'),
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen')
};

// Evento Inicial de Entrada
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => screens.loading.classList.add('hidden'), 1000);
});

// Listener de botões da interface
document.getElementById('btn-create-room').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) return alert('Por favor, digite seu nome primeiro!');
    
    gameState.playerName = name;
    gameState.playerRole = 'p1';
    gameState.roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    setupRoomOnFirebase();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code-input').value.trim();
    if (!name || !code) return alert('Preencha seu nome e o código da mesa!');
    
    gameState.playerName = name;
    gameState.playerRole = 'p2';
    gameState.roomCode = code;
    
    joinRoomOnFirebase();
});

// Configura Sala no RTDB
function setupRoomOnFirebase() {
    const roomRef = ref(db, 'rooms/' + gameState.roomCode);
    const initialData = {
        status: 'waiting',
        p1: { name: gameState.playerName, score: 0 },
        p2: { name: '', score: 0 },
        chain: [],
        deck: [],
        turn: 'p1'
    };
    
    set(roomRef, initialData).then(() => {
        document.getElementById('generated-code').innerText = gameState.roomCode;
        switchScreen('waiting');
        listenToRoomChanges();
    });
}

// Vincula Segundo Jogador à Sala
function joinRoomOnFirebase() {
    const roomRef = ref(db, 'rooms/' + gameState.roomCode);
    update(roomRef, {
        'p2/name': gameState.playerName,
        'status': 'playing'
    }).then(() => {
        listenToRoomChanges();
    }).catch(() => alert('Erro ao conectar. Código inválido.'));
}

// ==========================================================================
// CENTRALIZADOR DA SINCRONIZAÇÃO SEM CONCORRÊNCIA DE BOT
// ==========================================================================
function listenToRoomChanges() {
    const roomRef = ref(db, 'rooms/' + gameState.roomCode);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === 'playing') {
            if (screens.game.classList.contains('hidden')) {
                switchScreen('game');
                document.getElementById('game-room-id').innerText = `#${gameState.roomCode}`;
                
                // Apenas P1 gera o baralho uma única vez atómicamente
                if (gameState.playerRole === 'p1' && (!data.deck || data.deck.length === 0) && (!data.p1.hand)) {
                    generateAndDistributePieces();
                    return;
                }
            }
            updateGameTable(data);
        }
    });
}

// Distribuição unificada sem apagar mãos
function generateAndDistributePieces() {
    let pool = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            pool.push({ left: i, right: j, id: `d-${i}-${j}` });
        }
    }
    
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const p1Hand = pool.slice(0, 7);
    const p2Hand = pool.slice(7, 14);
    const remainingDeck = pool.slice(14);

    let firstTurn = 'p1';
    const p2HasBucha6 = p2Hand.some(p => p.left === 6 && p.right === 6);
    if (p2HasBucha6) firstTurn = 'p2';

    update(ref(db, 'rooms/' + gameState.roomCode), {
        'p1/hand': p1Hand,
        'p2/hand': p2Hand,
        'deck': remainingDeck,
        'turn': firstTurn
    });
}

// Renderiza a interface a cada atualização do banco
function updateGameTable(data) {
    document.getElementById('score-p1-name').innerText = data.p1.name || "Aguardando...";
    document.getElementById('score-p2-name').innerText = data.p2.name || "Aguardando...";
    document.getElementById('score-p1-val').innerText = String(data.p1.score).padStart(2, '0');
    document.getElementById('score-p2-val').innerText = String(data.p2.score).padStart(2, '0');

    gameState.isMyTurn = (data.turn === gameState.playerRole);
    const activePlayerName = data[data.turn] ? data[data.turn].name : '...';
    document.getElementById('turn-indicator').innerText = gameState.isMyTurn ? "Sua Vez de Jogar!" : `Vez de: ${activePlayerName}`;
    document.getElementById('turn-indicator').style.color = gameState.isMyTurn ? "var(--gold-premium)" : "var(--text-muted)";

    gameState.hand = data[gameState.playerRole]?.hand || [];
    renderMyHand();

    const oppRole = gameState.playerRole === 'p1' ? 'p2' : 'p1';
    const oppHandCount = data[oppRole]?.hand ? data[oppRole].hand.length : 0;
    document.getElementById('opponent-count').innerText = oppHandCount;

    renderChain(data.chain || []);
}

// Renderizador dos pontos em formato de Grid Profissional 3x3
function createDominoElement(piece, isClickable = false) {
    const el = document.createElement('div');
    el.className = 'domino-piece';
    el.dataset.id = piece.id;

    const renderHalf = (val) => {
        const half = document.createElement('div');
        half.className = 'domino-half';
        
        const dotPositions = {
            0: [],
            1: [4],
            2: [0, 8],
            3: [0, 4, 8],
            4: [0, 2, 6, 8],
            5: [0, 2, 4, 6, 8],
            6: [0, 2, 3, 5, 6, 8]
        };

        const activeDots = dotPositions[val] || [];
        
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.style.width = '100%';
            cell.style.height = '100%';
            cell.style.display = 'flex';
            cell.style.justifyContent = 'center';
            cell.style.alignItems = 'center';
            
            if (activeDots.includes(i)) {
                const dot = document.createElement('div');
                dot.className = 'dot';
                cell.appendChild(dot);
            }
            half.appendChild(cell);
        }
        return half;
    };

    el.appendChild(renderHalf(piece.left));
    el.appendChild(renderHalf(piece.right));

    if (isClickable && gameState.isMyTurn) {
        el.addEventListener('click', () => handlePieceSelection(piece));
    }
    return el;
}

function renderMyHand() {
    const container = document.getElementById('my-hand');
    container.innerHTML = '';
    gameState.hand.forEach(piece => {
        container.appendChild(createDominoElement(piece, true));
    });
}

function renderChain(chain) {
    const container = document.getElementById('domino-chain');
    container.innerHTML = '';
    if(chain.length === 0) {
        container.innerHTML = `<p class="subtitle">A mesa está limpa. Inicie o jogo!</p>`;
        return;
    }

    chain.forEach(piece => {
        const dominoNode = createDominoElement(piece, false);
        dominoNode.classList.add('horizontal');
        container.appendChild(dominoNode);
    });
}

// Regras e Encaixes
function handlePieceSelection(piece) {
    const roomRef = ref(db, 'rooms/' + gameState.roomCode);
    
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data || data.turn !== gameState.playerRole) return;

        let chain = data.chain || [];
        let updatedChain = [...chain];
        let matched = false;

        if (chain.length === 0) {
            updatedChain.push(piece);
            matched = true;
        } else {
            const leftOuter = chain[0].left;
            const rightOuter = chain[chain.length - 1].right;

            if (piece.left === rightOuter) {
                updatedChain.push(piece);
                matched = true;
            } else if (piece.right === rightOuter) {
                updatedChain.push({ left: piece.right, right: piece.left, id: piece.id });
                matched = true;
            } else if (piece.right === leftOuter) {
                updatedChain.unshift(piece);
                matched = true;
            } else if (piece.left === leftOuter) {
                updatedChain.unshift({ left: piece.right, right: piece.left, id: piece.id });
                matched = true;
            }
        }

        if (matched) {
            playDominoSound(440, 'triangle', 0.1);
            const updatedHand = gameState.hand.filter(p => p.id !== piece.id);
            const nextTurn = gameState.playerRole === 'p1' ? 'p2' : 'p1';

            if (updatedHand.length === 0) {
                alert("Você bateu a rodada!");
                const currentScore = (data[gameState.playerRole].score || 0) + 10; 
                
                update(ref(db, 'rooms/' + gameState.roomCode), {
                    [`${gameState.playerRole}/hand`]: updatedHand,
                    'chain': updatedChain,
                    [`${gameState.playerRole}/score`]: currentScore
                });
                generateAndDistributePieces();
            } else {
                update(ref(db, 'rooms/' + gameState.roomCode), {
                    [`${gameState.playerRole}/hand`]: updatedHand,
                    'chain': updatedChain,
                    'turn': nextTurn
                });
            }
        } else {
            playDominoSound(150, 'sawtooth', 0.2);
            alert("Esta peça não cabe nas pontas da mesa!");
        }
    }, { onlyOnce: true });
}

function switchScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if(screens[key]) screens[key].classList.add('hidden');
    });
    screens[screenKey].classList.remove('hidden');
}
