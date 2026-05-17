import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCZ4rOliexofYP8vyRLzUeX3mf5uXG6WRM",
  authDomain: "aposta-96213.firebaseapp.com",
  projectId: "aposta-96213",
  storageBucket: "aposta-96213.firebasestorage.app",
  messagingSenderId: "989060185373",
  appId: "1:989060185373:web:69bb80b2f961fe8e9d35f4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db, ref, set, onValue, update, signInAnonymously };
