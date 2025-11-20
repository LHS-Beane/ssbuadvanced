// signaling.js
import { db } from "./firebase-config.js";
import {
    ref,
    set,
    onValue,
    remove,
    push
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

import SimplePeer from "https://cdn.jsdelivr.net/npm/simple-peer@9.11.1/simplepeer.min.js";

export class Signaling {
    constructor() {
        this.peer = null;
        this.roomId = null;
        this.isHost = false;
        this.onMessageCallback = null;
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
    }

    async createRoom(roomId) {
        this.isHost = true;
        this.roomId = roomId;

        this.peer = new SimplePeer({ initiator: true, trickle: true });

        const offerRef = ref(db, `rooms/${roomId}/offer`);
        const answerRef = ref(db, `rooms/${roomId}/answer`);

        this.peer.on("signal", async (data) => {
            await set(offerRef, data);
        });

        onValue(answerRef, (snapshot) => {
            const val = snapshot.val();
            if (val) this.peer.signal(val);
        });

        this.#setupPeerEvents();
    }

    async joinRoom(roomId) {
        this.isHost = false;
        this.roomId = roomId;

        const offerRef = ref(db, `rooms/${roomId}/offer`);
        const answerRef = ref(db, `rooms/${roomId}/answer`);

        this.peer = new SimplePeer({ initiator: false, trickle: true });

        onValue(offerRef, (snapshot) => {
            const val = snapshot.val();
            if (val) this.peer.signal(val);
        });

        this.peer.on("signal", async (data) => {
            await set(answerRef, data);
        });

        this.#setupPeerEvents();
    }

    #setupPeerEvents() {
        this.peer.on("connect", () => {
            if (this.onConnectCallback) this.onConnectCallback();
        });

        this.peer.on("close", () => {
            if (this.onDisconnectCallback) this.onDisconnectCallback();
        });

        this.peer.on("data", (data) => {
            const text = new TextDecoder().decode(data);
            const json = JSON.parse(text);
            if (this.onMessageCallback) this.onMessageCallback(json);
        });
    }

    send(obj) {
        if (this.peer && this.peer.connected) {
            this.peer.send(JSON.stringify(obj));
        }
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onConnected(callback) {
        this.onConnectCallback = callback;
    }

    onDisconnected(callback) {
        this.onDisconnectCallback = callback;
    }

    async cleanup() {
        if (!this.roomId) return;
        const base = ref(db, `rooms/${this.roomId}`);
        await remove(base);
    }
}
