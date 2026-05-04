const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    // Criar Sala
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = { p1: socket.id, p2: null };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    // Entrar na Sala
    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && !rooms[roomId].p2) {
            rooms[roomId].p2 = socket.id;
            socket.join(roomId);
            io.to(roomId).emit('playerJoined', { roomId });
        } else {
            socket.emit('errorMsg', 'Sala cheia ou inexistente.');
        }
    });

    // Sincronizar Movimento
    socket.on('paddleMove', (data) => {
        socket.to(data.roomId).emit('opponentMove', data.y);
    });

    // Sincronizar Bola (apenas o P1 envia para evitar conflito)
    socket.on('ballSync', (data) => {
        socket.to(data.roomId).emit('ballUpdate', data);
    });

    socket.on('disconnect', () => {
        // Lógica para limpar salas vazias pode ser adicionada aqui
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
