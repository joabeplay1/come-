import { db, ref, set, update, onValue } from "../config/firebase.js";

export class RoomManager {
    static generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    static async createRoom(playerId, playerName) {
        const roomCode = this.generateRoomCode();
        const roomRef = ref(db, `rooms/${roomCode}`);
        
        const initialRoomState = {
            status: "waiting",
            turn: playerId,
            board: { left_edge: null, right_edge: null },
            players: {
                [playerId]: { name: playerName, hand_count: 0, is_online: true }
            }
        };

        await set(roomRef, initialRoomState);
        return roomCode;
    }

    static async joinRoom(roomCode, playerId, playerName) {
        const roomRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
        await set(roomRef, {
            name: playerName,
            hand_count: 0,
            is_online: true
        });
    }

    static listenToRoom(roomCode, callback) {
        const roomRef = ref(db, `rooms/${roomCode}`);
        onValue(roomRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            }
        });
    }
}
