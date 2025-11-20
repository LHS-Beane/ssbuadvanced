
// signaling.js — WebRTC signaling via Firebase + SimplePeer (ESM-safe)

// --- Import SimplePeer (correct ESM build!!) ---
import SimplePeer from "https://esm.sh/simple-peer@9.11.1";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export class Signaling {
    constructor() {
        this.peer = null;
        this.role = null;              // "host" or "guest"
        this.roomId = null;
        this.handlers = {
            connected: () => {},
            message: () => {},
            disconnected: () => {}
        };

        // Firebase real-time DB
        this.db = firebase.database();
    }

    // Listen for events
    onConnected(fn)      { this.handlers.connected = fn; }
    onMessage(fn)        { this.handlers.message = fn; }
    onDisconnected(fn)   { this.handlers.disconnected = fn; }

    // Host creates room
    async createRoom(roomId) {
        this.role = "host";
        this.roomId = roomId;

        this.peer = new SimplePeer({ initiator: true, trickle: false });

        this.peer.on("signal", (data) => {
            this.db.ref(`rooms/${roomId}/hostSignal`).set(JSON.stringify(data));
        });

        this.peer.on("connect", () => this.handlers.connected());
        this.peer.on("data", (d) => this.handlers.message(JSON.parse(d)));

        // Listen for guest's answer
        this.db.ref(`rooms/${roomId}/guestSignal`).on("value", (snap) => {
            const v = snap.val();
            if (v) this.peer.signal(JSON.parse(v));
        });
    }

    // Guest joins room
    async joinRoom(roomId) {
        this.role = "guest";
        this.roomId = roomId;

        this.peer = new SimplePeer({ initiator: false, trickle: false });

        this.peer.on("signal", (data) => {
            this.db.ref(`rooms/${roomId}/guestSignal`).set(JSON.stringify(data));
        });

        this.peer.on("connect", () => this.handlers.connected());
        this.peer.on("data", (d) => this.handlers.message(JSON.parse(d)));

        // Listen for host offer
        this.db.ref(`rooms/${roomId}/hostSignal`).on("value", (snap) => {
            const v = snap.val();
            if (v) this.peer.signal(JSON.parse(v));
        });
    }

    send(obj) {
        if (this.peer && this.peer.connected) {
            this.peer.send(JSON.stringify(obj));
        }
    }

    close() {
        try { this.peer.destroy(); } catch(e) {}
        this.handlers.disconnected();
    }
    
}
