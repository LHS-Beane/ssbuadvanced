/* ============================================================
   PEER WRAPPER – Safe, Stable PeerJS Layer
   Handles: creation, connection, reconnection, timeouts
   Exposes: PeerWrapper class
   ============================================================ */

class PeerWrapper {

    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomId = null;

        this.heartbeat = null;
        this.heartbeatTimeout = null;

        // Event placeholders (app.js will assign)
        this.onOpen = () => {};
        this.onConnected = () => {};
        this.onData = () => {};
        this.onDisconnect = () => {};
        this.onError = (e)=> console.error(e);
    }


    /* ============================================================
       HOST: Create a room with a custom ID (e.g., "cb-83kd")
       ============================================================ */
    host(roomId) {
        this.isHost = true;
        this.roomId = roomId;

        this.peer = new Peer(roomId, {
            debug: 2
        });

        this._bindPeerBaseEvents();
    }


    /* ============================================================
       CLIENT: Join an existing room with known roomId
       ============================================================ */
    join(roomId) {
        this.isHost = false;
        this.roomId = roomId;

        this.peer = new Peer({
            debug: 2
        });

        this._bindPeerBaseEvents(true);
    }


    /* ============================================================
       Bind PeerJS-level events (open, error, connection…)
       ============================================================ */
    _bindPeerBaseEvents(isJoin = false) {

        this.peer.on('open', id => {
            // Host → this fires immediately with the correct ID
            // Client → this fires with auto-generated ID
            this.onOpen(id);

            if (isJoin) {
                // try to connect to host
                this._attemptConnection();
            }
        });

        this.peer.on('connection', (conn) => {
            this._bindConnection(conn);
        });

        this.peer.on('disconnected', () => {
            this._safeDisconnect("peer-disconnected");
        });

        this.peer.on('close', () => {
            this._safeDisconnect("peer-closed");
        });

        this.peer.on('error', (err) => {
            console.error("[PeerJS ERROR]", err);
            this.onError(err);

            if (err.type === "peer-unavailable") {
                this._retryConnection();
            }
        });
    }


    /* ============================================================
       Client attempts connection → host will accept it
       ============================================================ */
    _attemptConnection() {

        try {
            this.conn = this.peer.connect(this.roomId, {
                reliable: true
            });

            // wait for open event
            this._bindConnection(this.conn);

        } catch (e) {
            console.error("Connection failed:", e);
            this._retryConnection();
        }
    }


    /* ============================================================
       Bind connection events (open, data, close, error)
       ============================================================ */
    _bindConnection(conn) {

        this.conn = conn;

        conn.on('open', () => {
            this._startHeartbeat();
            this.onConnected();
        });

        conn.on('data', data => {
            this._resetHeartbeatTimeout();
            this.onData(data);
        });

        conn.on('close', () => {
            this._safeDisconnect("conn-closed");
        });

        conn.on('error', (err) => {
            console.warn("Connection error:", err);
            this._safeDisconnect("conn-error");
        });
    }


    /* ============================================================
       Send data safely
       ============================================================ */
    send(data) {
        if (!this.conn || !this.conn.open) {
            console.warn("Tried to send without an open connection:", data);
            return;
        }
        this.conn.send(data);
    }


    /* ============================================================
       Heartbeat system → detect silent connection drops
       ============================================================ */
    _startHeartbeat() {
        if (this.heartbeat) clearInterval(this.heartbeat);

        this.heartbeat = setInterval(() => {
            if (!this.conn || !this.conn.open) return;

            this.conn.send({ type: "ping" });

            // waiting window
            this._resetHeartbeatTimeout();
        }, 2000);
    }

    _resetHeartbeatTimeout() {
        if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);

        this.heartbeatTimeout = setTimeout(() => {
            this._safeDisconnect("heartbeat-timeout");
        }, 5000);
    }


    /* ============================================================
       Disconnect handler (both ends)
       ============================================================ */
    _safeDisconnect(reason) {
        console.warn("Disconnected:", reason);

        if (this.conn) {
            try { this.conn.close(); } catch(e){}
        }
        this.conn = null;

        if (this.heartbeat) clearInterval(this.heartbeat);
        if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);

        this.onDisconnect(reason);

        // clients auto-retry
        if (!this.isHost) {
            this._retryConnection();
        }
    }


    /* ============================================================
       Retry connection every 3 seconds (client only)
       ============================================================ */
    _retryConnection() {
        if (this.isHost) return; // host does not reconnect automatically

        console.log("Retrying connection in 3 seconds…");

        setTimeout(() => {
            if (!this.peer || this.peer.destroyed) {
                // recreate peer entirely
                this.peer = new Peer({ debug: 2 });
                this._bindPeerBaseEvents(true);
                return;
            }

            this._attemptConnection();
        }, 3000);
    }

}
