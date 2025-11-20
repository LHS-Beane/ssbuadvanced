// signaling.js — WebRTC signaling (Firebase + SimplePeer, CSP-safe)

// Import SimplePeer from esm.sh (CORS-friendly, ES module)
import SimplePeer from "https://esm.sh/simple-peer@9.11.1";

// You must ensure firebase-app.js and firebase-database.js are included in HTML
// and that firebase.initializeApp(...) has already run.

export class Signaling {
    constructor() {
        this.peer = null;
        this.role = null;   // "host" or "guest"
        this.roomId = null;

        this.handlers = {
            connected: () => {},
            message:   () => {},
            disconnected: () => {}
        };

        // Firebase Database reference
        this.db = firebase.database();
    }

    onConnected(fn)    { this.handlers.connected = fn; }
    onMessage(fn)      { this.handlers.message = fn; }
    onDisconnected(fn) { this.handlers.disconnected = fn; }

    // ------------------------------------------------------------
    // HOST CREATES ROOM
    // ------------------------------------------------------------
    async createRoom(roomId) {
        this.role = "host";
        this.roomId = roomId;

        this.peer = new SimplePeer({
            initiator: true,
            trickle: false
        });

        // When SimplePeer generates its offer signal
        this.peer.on("signal", (data) => {
            this.db.ref(`rooms/${roomId}/hostSignal`)
                .set(JSON.stringify(data));
        });

        // WebRTC connected
        this.peer.on("connect", () => {
            this.handlers.connected();
        });

        // Receiving data
        this.peer.on("data", (data) => {
            try {
                this.handlers.message(JSON.parse(data));
            } catch (e) {
                console.error("Bad JSON from peer:", e);
            }
        });

        this.peer.on("close", () => this.handlers.disconnected());
        this.peer.on("error", (err) => console.error("Peer error:", err));

        // Listen for guest answer
        this.db.ref(`rooms/${roomId}/guestSignal`).on("value", (snap) => {
            const val = snap.val();
            if (val) {
                this.peer.signal(JSON.parse(val));
            }
        });
    }

    // ------------------------------------------------------------
    // GUEST JOINS ROOM
    // ------------------------------------------------------------
    async joinRoom(roomId) {
        this.role = "guest";
        this.roomId = roomId;

        this.peer = new SimplePeer({
            initiator: false,
            trickle: false
        });

        // Guest sends answer signal
        this.peer.on("signal", (data) => {
            this.db.ref(`rooms/${roomId}/guestSignal`)
                .set(JSON.stringify(data));
        });

        this.peer.on("connect", () => {
            this.handlers.connected();
        });

        this.peer.on("data", (data) => {
            try {
                this.handlers.message(JSON.parse(data));
            } catch (e) {
                console.error("Bad JSON from peer:", e);
            }
        });

        this.peer.on("close", () => this.handlers.disconnected());
        this.peer.on("error", (err) => console.error("Peer error:", err));

        // Listen for host offer
        this.db.ref(`rooms/${roomId}/hostSignal`).on("value", (snap) => {
            const val = snap.val();
            if (val) {
                this.peer.signal(JSON.parse(val));
            }
        });
    }

    // ------------------------------------------------------------
    // SEND MESSAGE
    // ------------------------------------------------------------
    send(obj) {
        if (this.peer && this.peer.connected) {
            this.peer.send(JSON.stringify(obj));
        }
    }

    // ------------------------------------------------------------
    // CLOSE CONNECTION
    // ------------------------------------------------------------
    close() {
        try {
            this.peer.destroy();
        } catch (e) {}

        this.handlers.disconnected();
    }
}
