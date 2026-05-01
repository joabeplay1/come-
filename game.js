// game.js — Come Come SITI WEB
// Código completo do jogo disponível no repositório GitHub
// Gerado por Come Come SITI WEB v2.0
//
// Para rodar localmente:
//   1. Abra index.html no navegador
//   2. Para multiplayer online, configure Firebase (veja README.md)
//
// Controles:
//   Jogador 1: Setas ou WASD
//   Jogador 2 (local): IJKL
//
// Firebase config para multiplayer:
const firebaseConfig = {
  apiKey: "AIzaSyCfLHR2iWnu86uqdAxeML8DbHJk9gOfIl0",
  authDomain: "sinuca-olaine.firebaseapp.com",
  projectId: "sinuca-olaine",
  storageBucket: "sinuca-olaine.firebasestorage.app",
  messagingSenderId: "580716617922",
  appId: "1:580716617922:web:222a96c6e40261407c1b5b",
  measurementId: "G-T528DB9MW6"
};
// Inicialize o Firebase Realtime Database para sincronização de salas.