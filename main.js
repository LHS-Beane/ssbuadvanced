/******************************************************
 *  SSBU CREW BATTLE MANAGER — PRO APP VERSION (B)
 *  Fully patched with correct screen names + reconnection fix
 ******************************************************/

/* -----------------------------------------------
   CONSTANTS
--------------------------------------------------*/
const STARTERS = ["Battlefield", "Final Destination", "Town & City", "Pokémon Stadium 2", "Smashville"];
const COUNTERPICKS = ["Kalos Pokémon League", "Lylat Cruise", "Small Battlefield", "Yoshi's Story", "Hollow Bastion"];
const FULL_STAGE_LIST = [...STARTERS, ...COUNTERPICKS];

/* -----------------------------------------------
   GLOBAL STATE
--------------------------------------------------*/
let peer = null;
let conn = null;
let isHost = false;
let heartbeatInterval = null;

let crewState = {
    home: { name: "Home", players: [], stocks: 12, currentIdx: 0 },
    away: { name: "Away", players: [], stocks: 12, currentIdx: 0 },
    matchNum: 1,
    phase: "roster", // VALID SCREENS: connection, roster, scoreboard, stage-select, report, gameover
    previousWinner: null
};

let stageState = {
    available: [],
    bans: [],
    mode: "",
    turn: "",
    banCount: 0
};

/* -----------------------------------------------
   DOM HELPERS
--------------------------------------------------*/
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* -----------------------------------------------
   SCREEN MANAGER — PATCHED
--------------------------------------------------*/
function showScreen(name) {
    console.log("showScreen called with:", name);   // REQUIRED
    $$(".screen").forEach(s => s.classList.remove("active"));
    const target = $(`[data-screen="${name}"]`);
    if (!target) {
        console.error("Screen not found:", name);
        return;
    }
    target.classList.add("active");
}

function setStatus(msg) {
    $("#global-status").textContent = msg;
}

/* -----------------------------------------------
   NETWORK WRAPPER
--------------------------------------------------*/
const Net = {
    send(obj) {
        if (conn && conn.open) conn.send(JSON.parse(JSON.stringify(obj)));
    },

    startHeartbeat() {
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (conn && conn.open) Net.send({ type: "ping" });
        }, 2000);
    }
};

/* -----------------------------------------------
   HOST ROOM CREATION
--------------------------------------------------*/
$("#host-btn").addEventListener("click", () => {
    const roomId = "cb-" + Math.random().toString(36).substr(2, 4);
    isHost = true;

    peer = new Peer(roomId);

    peer.on("open", id => {
        $("#room-id").textContent = id;
        $("#host-btn").classList.add("hide");
        $("#host-info").classList.remove("hide");
        $("#join-section").classList.add("hide");
        setStatus("Waiting for Away Team...");
    });

    peer.on("connection", connection => setupConnection(connection));

    peer.on("error", err => alert("Network Error: " + err.type));
});

/* -----------------------------------------------
   JOIN EXISTING ROOM
--------------------------------------------------*/
$("#join-btn").addEventListener("click", () => {
    const target = $("#join-id-input").value.trim();
    if (!target) return;

    peer = new Peer();

    peer.on("open", () => {
        setStatus("Connecting…");
        const connection = peer.connect(target);
        setupConnection(connection);
    });

    peer.on("error", err => alert("Connection Failed: " + err.type));
});

/* -----------------------------------------------
   CONNECTION SETUP — WITH FULL RECONNECTION FIX
--------------------------------------------------*/
function setupConnection(connection) {

    if (conn && conn.open) {
        try { conn.close(); } catch(e){}
    }

    conn = connection;

    conn.on("open", () => {
        setStatus("Connected!");
        Net.startHeartbeat();

        if (!isHost) {
            setStatus("Syncing Match Data…");
            Net.send({ type: "request_sync" });
        }
    });

    conn.on("data", data => handleData(data));

    conn.on("close", () => {
        setStatus("Disconnected… reconnect or refresh");
    });
}

/* -----------------------------------------------
   DATA HANDLING
--------------------------------------------------*/
function handleData(d) {
    switch (d.type) {

        case "request_sync":
            Net.send({
                type: "full_sync",
                crew: JSON.parse(JSON.stringify(crewState)),
                stage: JSON.parse(JSON.stringify(stageState))
            });
            break;

        case "full_sync":
            crewState = d.crew;
            stageState = d.stage;
            restoreUI();
            break;

        case "roster_submit":
            crewState[d.role].name = d.name;
            crewState[d.role].players = d.players;
            checkRosterReady();
            break;

        case "start_stage_select":
            startStageSelection();
            break;

        case "stage_click":
            processStageLogic(d.stage);
            break;

        case "game_result":
            applyGameResult(d.winner, d.stocks);
            break;
    }
}

/* -----------------------------------------------
   ROSTER ENTRY
--------------------------------------------------*/
$("#submit-roster-btn").addEventListener("click", () => {
    const myTeam = $("#my-team-name").value || (isHost ? "Home Team" : "Away Team");
    const role = isHost ? "home" : "away";

    let players = [];
    for (let i = 1; i <= 4; i++) {
        players.push({ name: `${myTeam} Player ${i}`, stocks: 3 });
    }

    crewState[role].name = myTeam;
    crewState[role].players = players;

    $("#submit-roster-btn").disabled = true;
    $("#roster-status").textContent = "Ready! Waiting for opponent...";

    Net.send({ type: "roster_submit", role, name: myTeam, players });

    checkRosterReady();
});

function checkRosterReady() {
    if (crewState.home.players.length && crewState.away.players.length) {
        crewState.phase = "scoreboard";   // ⬅ PATCHED
        restoreUI();
    }
}

/* -----------------------------------------------
   RESTORE UI — FULLY PATCHED
--------------------------------------------------*/
function restoreUI() {
    updateScoreboardUI();

    switch (crewState.phase) {

        case "connection":
            showScreen("connection");
            break;

        case "roster":
            showScreen("roster");
            break;

        case "scoreboard":   // PATCHED
            showScreen("scoreboard");
            break;

        case "stage-select": // PATCHED
            showScreen("stage-select");
            renderStages();
            updateStageInstructions();
            break;

        case "report":
            showScreen("report");
            break;

        case "gameover":
            showScreen("gameover");
            break;
    }
}

/* -----------------------------------------------
   SCOREBOARD
--------------------------------------------------*/
function updateScoreboardUI() {
    $("#disp-home-name").textContent = crewState.home.name;
    $("#disp-away-name").textContent = crewState.away.name;

    $("#score-home").textContent = crewState.home.stocks;
    $("#score-away").textContent = crewState.away.stocks;

    const HP = crewState.home.players[crewState.home.currentIdx];
    const AP = crewState.away.players[crewState.away.currentIdx];

    $("#current-home-player").textContent = HP ? HP.name : "Eliminated";
    $("#stocks-home").textContent = HP ? "●".repeat(HP.stocks) : "";

    $("#current-away-player").textContent = AP ? AP.name : "Eliminated";
    $("#stocks-away").textContent = AP ? "●".repeat(AP.stocks) : "";

    const btn = $("#start-stage-select-btn");
    if (isHost) {
        btn.style.display = "block";
        btn.textContent = crewState.matchNum === 1
            ? "Start Game 1 (Stage Strike)"
            : "Select Next Stage";
    } else {
        btn.style.display = "none";
        $("#action-text").textContent = "Waiting for host...";
    }
}

/* -----------------------------------------------
   START STAGE-SELECTION — PATCHED
--------------------------------------------------*/
$("#start-stage-select-btn").addEventListener("click", () => {
    startStageSelection();
    Net.send({ type: "start_stage_select" });
});

function startStageSelection() {
    crewState.phase = "stage-select";   // PATCHED
    showScreen("stage-select");

    if (crewState.matchNum === 1) {
        stageState.mode = "game1";
        stageState.available = [...STARTERS];
        stageState.turn = "home";
    } else {
        stageState.mode = "subseq";
        stageState.available = [...FULL_STAGE_LIST];
        stageState.turn = crewState.previousWinner;
        stageState.banCount = 0;
    }

    stageState.bans = [];

    renderStages();
    updateStageInstructions();
}

/* -----------------------------------------------
   RENDER STAGES
--------------------------------------------------*/
function renderStages() {
    $("#starter-list").innerHTML = "";
    $("#counterpick-list").innerHTML = "";

    const list = stageState.mode === "game1" ? STARTERS : FULL_STAGE_LIST;

    list.forEach(stage => {
        const btn = document.createElement("button");
        btn.className = "stage-btn";
        btn.textContent = stage;
        btn.dataset.stage = stage;

        const banned = stageState.bans.includes(stage);

        if (banned) {
            btn.classList.add("banned");
            btn.disabled = true;
        } else {
            const myRole = isHost ? "home" : "away";
            if (myRole === stageState.turn) {
                btn.classList.add("selectable");
            } else {
                btn.disabled = true;
            }
        }

        if (STARTERS.includes(stage)) $("#starter-list").append(btn);
        else $("#counterpick-list").append(btn);
    });

    $("#counterpick-list").closest(".stage-section").style.display =
        stageState.mode === "game1" ? "none" : "block";
}

/* -----------------------------------------------
   UPDATE INSTRUCTIONS
--------------------------------------------------*/
function updateStageInstructions() {
    const myRole = isHost ? "home" : "away";
    const txt = $("#instructions");
    const turnName = stageState.turn === "home" ? crewState.home.name : crewState.away.name;

    if (myRole === stageState.turn) {
        txt.textContent = "Your Turn: Select/Ban a stage.";
        txt.style.color = "#007bff";
    } else {
        txt.textContent = `Waiting for ${turnName}...`;
        txt.style.color = "#555";
    }
}

/* -----------------------------------------------
   CLICK STAGE BUTTON (EVENT DELEGATION)
--------------------------------------------------*/
document.addEventListener("click", e => {
    if (e.target.matches(".stage-btn.selectable")) {
        const stage = e.target.dataset.stage;
        processStageLogic(stage);
        Net.send({ type: "stage_click", stage });
    }
});

/* -----------------------------------------------
   STAGE LOGIC
--------------------------------------------------*/
function processStageLogic(stage) {
    let rem = stageState.available.length;

    if (stageState.mode === "game1") {

        if (rem === 2) return confirmStage(stage);

        stageState.bans.push(stage);
        stageState.available = stageState.available.filter(s => s !== stage);

        if (rem === 5) stageState.turn = "away";
        if (rem === 4) stageState.turn = "away";
        if (rem === 3) stageState.turn = "home";
    }

    else {
        if (stageState.banCount < 3) {
            stageState.banCount++;
            stageState.bans.push(stage);
            stageState.available = stageState.available.filter(s => s !== stage);

            if (stageState.banCount === 3) {
                stageState.turn =
                    crewState.previousWinner === "home" ? "away" : "home";
            }
        } else {
            return confirmStage(stage);
        }
    }

    renderStages();
    updateStageInstructions();
}

/* -----------------------------------------------
   CONFIRM STAGE
--------------------------------------------------*/
function confirmStage(stage) {
    $("#report-stage-name").textContent = stage;
    crewState.phase = "report";
    showScreen("report");

    $("#stock-count-selector").classList.add("hide");
    $$(".report-buttons button").forEach(b => b.classList.remove("hide"));
}

/* -----------------------------------------------
   REPORTING
--------------------------------------------------*/
let pendingWinner = "";

$("#btn-home-won").addEventListener("click", () => beginStockEntry("home"));
$("#btn-away-won").addEventListener("click", () => beginStockEntry("away"));

function beginStockEntry(role) {
    pendingWinner = role;
    $$(".report-buttons button").forEach(b => b.classList.add("hide"));
    $("#stock-count-selector").classList.remove("hide");
}

document.addEventListener("click", e => {
    if (e.target.closest("[data-stocks]")) {
        const stocks = Number(e.target.dataset.stocks);
        Net.send({ type: "game_result", winner: pendingWinner, stocks });
        applyGameResult(pendingWinner, stocks);
    }
});

/* -----------------------------------------------
   APPLY GAME RESULT
--------------------------------------------------*/
function applyGameResult(winner, winnerStocks) {
    const loser = winner === "home" ? "away" : "home";

    crewState.previousWinner = winner;

    const LP = crewState[loser].players[crewState[loser].currentIdx];
    const WP = crewState[winner].players[crewState[winner].currentIdx];

    if (!LP || !WP) return;

    crewState[loser].stocks -= LP.stocks;
    LP.stocks = 0;
    crewState[loser].currentIdx++;

    const diff = WP.stocks - winnerStocks;
    crewState[winner].stocks -= diff;
    WP.stocks = winnerStocks;

    if (crewState.home.stocks <= 0) return endCrewBattle("AWAY TEAM", "away");
    if (crewState.away.stocks <= 0) return endCrewBattle("HOME TEAM", "home");

    crewState.matchNum++;
    crewState.phase = "scoreboard";  // PATCHED
    restoreUI();
}

/* -----------------------------------------------
   END MATCH
--------------------------------------------------*/
function endCrewBattle(winnerName, role) {
    $("#winner-banner").textContent = winnerName + " WINS!";

    const homeTaken = role === "home" ? 12 : 12 - crewState.away.stocks;
    const awayTaken = role === "away" ? 12 : 12 - crewState.home.stocks;

    $("#final-score-display").textContent = `${homeTaken} - ${awayTaken}`;

    crewState.phase = "gameover";
    showScreen("gameover");
}
