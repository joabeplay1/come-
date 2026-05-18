import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

let myLobbyId = null;
let currentChatRoomId = null;
let currentChatListener = null;

// Captura o clique dos botões principais para ativar a sincronização assim que o player escolhe um nome
document.addEventListener('DOMContentLoaded', () => {
    const bindSync = () => {
        const nameInput = document.getElementById('player-name').value.trim();
        if (nameInput) initLobbyPresence(nameInput);
    };

    document.getElementById('btn-create-room').addEventListener('click', bindSync);
    document.getElementById('btn-join-room').addEventListener('click', bindSync);
    
    // Controles do Chat Privado
    document.getElementById('btn-close-chat').onclick = closePrivateChat;
    document.getElementById('btn-send-message').onclick = sendPrivateMessage;
    document.getElementById('select-my-status').onchange = (e) => updateMyStatus(e.target.value);
    
    // Inicialização dos botões de minimizar/expandir a janela flutuante
    const chatCard = document.getElementById('draggable-chat-card');
    const minimizeBtn = document.getElementById('btn-minimize-chat');
    
    if (minimizeBtn && chatCard) {
        minimizeBtn.onclick = (e) => {
            e.stopPropagation();
            chatCard.classList.toggle('minimized');
            minimizeBtn.innerText = chatCard.classList.contains('minimized') ? '🗖' : '—';
        };
    }

    // Ativação do motor de arraste omnidirecional na barra de título do chat
    makeElementDraggable(chatCard, document.getElementById('chat-drag-handle'));
    
    // Rotina de varredura e limpeza automática cíclica (Roda localmente para economizar processamento)
    setInterval(performAutoGarbageCollection, 5000);
});

// Inicializa o sistema de Presença
function initLobbyPresence(name) {
    if (myLobbyId) return; // Evita múltiplas instâncias do mesmo player
    
    const presenceListRef = ref(db, 'presence');
    const newPlayerRef = push(presenceListRef);
    myLobbyId = newPlayerRef.key;

    const playerData = {
        name: name,
        status: "Disponível",
        lastActive: Date.now()
    };

    set(newPlayerRef, playerData);

    // Remove do Firebase automaticamente se a aba ou o navegador fechar
    onDisconnect(newPlayerRef).remove();

    // Torna a barra lateral visível para o usuário
    document.getElementById('lobby-presence-sidebar').classList.remove('hidden');

    // Escuta a lista geral de players online
    onValue(presenceListRef, (snapshot) => {
        renderOnlinePlayers(snapshot.val());
    });
}

function updateMyStatus(newStatus) {
    if (!myLobbyId) return;
    set(ref(db, `presence/${myLobbyId}/status`), newStatus);
    set(ref(db, `presence/${myLobbyId}/lastActive`), Date.now());
}

// Renderiza a lista de oponentes online
function renderOnlinePlayers(playersObj) {
    const container = document.getElementById('online-players-list');
    container.innerHTML = '';
    if (!playersObj) return;

    Object.keys(playersObj).forEach(key => {
        if (key === myLobbyId) return; // Oculta o próprio usuário da lista dele

        const player = playersObj[key];
        const li = document.createElement('li');
        li.className = 'player-item';
        
        li.innerHTML = `
            <div class="player-info-meta">
                <span class="p-name">${player.name}</span>
                <span class="p-status">${player.status}</span>
            </div>
            <div class="status-dot ${player.status}"></div>
        `;

        // Ao clicar em um jogador livre, abre a sala privada de chat
        li.onclick = () => openPrivateChat(key, player.name);
        container.appendChild(li);
    });
}

// Lógica de Abertura do Chat Privado de Comunicação
function openPrivateChat(targetId, targetName) {
    // Cria um ID único determinístico para a conversa baseado nos dos dois IDs (ordem alfabética)
    currentChatRoomId = myLobbyId < targetId ? `${myLobbyId}_${targetId}` : `${targetId}_${myLobbyId}`;
    
    document.getElementById('chat-target-name').innerText = `Conversa com ${targetName}`;
    document.getElementById('private-chat-modal').classList.remove('hidden');
    document.getElementById('chat-messages-box').innerHTML = '';

    // Remove listener anterior se houver
    if (currentChatListener) currentChatListener();

    const chatRef = ref(db, `chats/${currentChatRoomId}`);
    currentChatListener = onValue(chatRef, (snapshot) => {
        renderMessages(snapshot.val());
    });
}

function closePrivateChat() {
    document.getElementById('private-chat-modal').classList.add('hidden');
    currentChatRoomId = null;
    if (currentChatListener) currentChatListener();
}

function sendPrivateMessage() {
    const input = document.getElementById('chat-input-message');
    const msg = input.value.trim();
    if (!msg || !currentChatRoomId) return;

    const messagePayload = {
        senderId: myLobbyId,
        text: msg,
        timestamp: Date.now()
    };

    push(ref(db, `chats/${currentChatRoomId}`), messagePayload);
    input.value = '';
}

function renderMessages(messagesObj) {
    const box = document.getElementById('chat-messages-box');
    box.innerHTML = '';
    if (!messagesObj) return;

    Object.keys(messagesObj).forEach(key => {
        const m = messagesObj[key];
        const bubble = document.createElement('div');
        bubble.className = m.senderId === myLobbyId ? 'msg-bubble me' : 'msg-bubble them';
        bubble.innerText = m.text;
        box.appendChild(bubble);
    });
    box.scrollTop = box.scrollHeight;
}

// ==========================================================================
// SISTEMA AUTOMÁTICO DE LIMPEZA (GARBAGE COLLECTION — LIMITE DE 10 MINUTOS)
// ==========================================================================
function performAutoGarbageCollection() {
    // Só executa se houver conexão ativa
    if (!myLobbyId) return;

    const chatsRef = ref(db, 'chats');
    const dezMinutosAtras = Date.now() - (10 * 60 * 1000);

    onValue(chatsRef, (snapshot) => {
        const allChats = snapshot.val();
        if (!allChats) return;

        Object.keys(allChats).forEach(roomId => {
            const messages = allChats[roomId];
            let messagesCount = 0;

            Object.keys(messages).forEach(msgId => {
                messagesCount++;
                const msg = messages[msgId];
                
                // Regra 1: Apaga mensagens com mais de 10 minutos
                if (msg.timestamp < dezMinutosAtras) {
                    remove(ref(db, `chats/${roomId}/${msgId}`));
                    messagesCount--;
                }
            });

            // Regra 2: Se a sala ficou vazia de mensagens, limpa o nó do banco de dados
            if (messagesCount === 0) {
                remove(ref(db, `chats/${roomId}`));
            }
        });
    }, { onlyOnce: true });
}

// ==========================================================================
// MOTOR MATEMÁTICO DE ARRASTE (DRAG & DROP) PARA PC E CELULARES TOUCH
// ==========================================================================
function makeElementDraggable(elmnt, dragHandle) {
    if (!elmnt) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    if (dragHandle) {
        dragHandle.onmousedown = dragMouseDown;
        dragHandle.ontouchstart = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
        elmnt.ontouchstart = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
            e.preventDefault();
        }
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        pos3 = clientX;
        pos4 = clientY;
        
        if (e.type.includes('touch')) {
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementDrag;
        } else {
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
    }

    function elementDrag(e) {
        e = e || window.event;
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        
        let newTop = elmnt.offsetTop - pos2;
        let newLeft = elmnt.offsetLeft - pos1;

        // Margens de segurança para travar a janela dentro dos limites visíveis da tela
        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop > window.innerHeight - elmnt.clientHeight) newTop = window.innerHeight - elmnt.clientHeight;
        if (newLeft > window.innerWidth - elmnt.clientWidth) newLeft = window.innerWidth - elmnt.clientWidth;

        elmnt.style.top = newTop + "px";
        elmnt.style.left = newLeft + "px";
        elmnt.style.bottom = "auto"; // Desativa ancoragem fixa padrão após mover
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}
