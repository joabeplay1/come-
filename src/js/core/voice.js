export class DominoVoice {
    static speak(left, right) {
        if (!('speechSynthesis' in window)) return;

        let phrase = "";
        
        if (left === right) {
            const names = ["Carroça de Branco", "Carroça de Ás", "Carroça de Duque", "Carroça de Terno", "Carroça de Quadra", "Carroça de Quina", "Carroça de Sena"];
            phrase = names[left];
        } else {
            const mapNames = { 0: "Branco", 1: "Ás", 2: "Duque", 3: "Terno", 4: "Quadra", 5: "Quina", 6: "Sena" };
            // Organiza do maior para o menor para manter o padrão falado (ex: Duque de Sena torna-se Sena e Duque)
            const high = Math.max(left, right);
            const low = Math.min(left, right);
            phrase = `${mapNames[high]} e ${mapNames[low]}`;
        }

        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = "pt-BR";
        utterance.rate = 1.1; // Velocidade fluida natural
        utterance.pitch = 1.0;
        
        window.speechSynthesis.cancel(); // Cancela falas anteriores sobrepostas
        window.speechSynthesis.speak(utterance);
    }
}
