import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "SUA_KEY_AQUI",
    authDomain: "SEU_DOMINIO_AQUI",
    projectId: "SEU_PROJECT_ID_AQUI",
    storageBucket: "SEU_STORAGE_BUCKET_AQUI",
    messagingSenderId: "SEU_SENDER_ID_AQUI",
    appId: "SEU_APP_ID_AQUI"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
