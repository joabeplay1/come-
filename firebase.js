import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Suas credenciais reais inseridas corretamente para rodar direto no navegador
const firebaseConfig = {
  apiKey: "AIzaSyCZ4rOliexofYP8vyRLzUeX3mf5uXG6WRM",
  authDomain: "aposta-96213.firebaseapp.com",
  projectId: "aposta-96213",
  storageBucket: "aposta-96213.firebasestorage.app",
  messagingSenderId: "989060185373",
  appId: "1:989060185373:web:69bb80b2f961fe8e9d35f4",
  measurementId: "G-1LTXVCXHX5"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o Firestore para o lobby.js utilizar
export const db = getFirestore(app);
