// app.js — SSBU Crew Battle Manager (CSP-safe, Firebase Signaling)

// Imports
import { Signaling } from "./signaling.js";

// DOM Helpers
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function showScreen(name) {
    $$(".screen").forEach((scr) => scr.classList.add("hide"));
    const screen = $(`.screen[data-screen="${name}"]`);
    if (screen) screen.classList.remove("hide");
}

function setStatus(msg) {
    $("#global-status").textContent = msg;
}

// ------------------------------------------------------------
// GLOBAL STATE
// ------------------------------------------------------------
let signal = null;
let isHost = false;
let roomId = null;

let state = {
    phase: "connection", // connection → roster → scoreboard → stage-select → report → gameover

    home: {
        name: "Home",
        players: [],
        totalStocks: 12,
        idx: 0
    },

    away: {
        name: "Away",
        players: [],
        totalStocks: 12,
        idx: 0
    },

    matchNum: 1,
    previousWinner: null,
    stage: null
};

// Stage Lists
const STARTERS = [
    "Battlefield",
    "Final Destination",
    "Town & City",
    "Pokémon Stadium 2",
    "Smashville"
];

const COUNTERPICKS = [
    "Kalos Pokémon League",
    "Lylat Cruise",
    "Small Battlefield",
    "Yoshi's Story",
    "Hollow Bastion"
];

const ALL_STAGES = [...STARTERS, ...COUNTERPICKS];

// Stage selection flow state
let stageFlow = {
    mode: null,
    turn: null,
    available: [],
    bans: [],
    banCount: 0
};

// ------------------------------------------------------------
// NETWORKING HELPERS
// ------------------------------------------------------------
function broadcast(obj) {
    if (signal) signal.send(obj);
}

function syncState() {
    broadcast({ type: "full_state", state });
}

// ------------------------------------------------------------
// CONNECTION HANDLERS
// ------------------------------------------------------------
$("#host-btn").addEventListener("click", async () => {
    roomId = "cb-" + Math.random().toString(36).substring(2, 6);
    $("#room-id").textContent = roomId;

    isHost = true;

    signal = new Signaling();
    await signal.createRoom(roomId);

    $("#host-info").classList.remove("hide");
    setStatus("Room created. Waiting for opponent…");

    bindSignalEvents();
});

$("#join-btn").addEventListener("click", async () => {
    const id = $("#join-id-input").value.trim();
    if (!id) return;

    roomId = id;
    isHost = false;

    signal = new Signaling();
    await signal.joinRoom(id);

    setStatus("Connecting to host…");

    bindSignalEvents();
});

function bindSignalEvents() {
    signal.onConnected(() => {
        setStatus("Connected!");

        if (!isHost) {
            broadcast({ type: "request_full_state" });
        }
    });

    signal.onMessage((msg) => {
        handleMessage(msg);
    });

    signal.onDisconnected(() => {
        setStatus("Disconnected. Refresh to reconnect.");
    });
}

// ------------------------------------------------------------
// MESSAGE HANDLER
// ------------------------------------------------------------
function handleMessage(msg) {
    switch (msg.type) {
        case "request_full_state":
            if (isHost) syncState();
            break;

        case "full_state":
            state = msg.state;
            restoreUI();
            break;

        case "roster_submit":
            state[msg.role].name = msg.name;
            state[msg.role].players = msg.players;
            checkRosterReady();
            break;

        case "start_stage_select":
            startStageSelect();
            break;

        case "ban_stage":
            handleBan(msg.stage);
            break;

        case "select_stage":
            finalizeStage(msg.stage);
            break;

        case "report_result":
            applyGameResult(msg.winner, msg.stocks);
            break;
    }
}

// ------------------------------------------------------------
// ROSTER
// ------------------------------------------------------------
$("#submit-roster-btn").addEventListener("click", () => {
    const myRole = isHost ? "home" : "away";
    const name = $("#my-team-name").value || (isHost ? "Home Team" : "Away Team");

    // Auto-generate players (P1–P4)
    let players = [];
    for (let i = 1; i <= 4; i++) {
        players.push({
            name: `${name} Player ${i}`,
            stocks: 3
        });
    }

    state[myRole].name = name;
    state[myRole].players = players;

    $("#submit-roster-btn").disabled = true;
    $("#roster-status").textContent = "Ready! Waiting for opponent…";

    broadcast({
        type: "roster_submit",
        role: myRole,
        name,
        players
    });

    checkRosterReady();
});

function checkRosterReady() {
    if (state.home.players.length > 0 && state.away.players.length > 0) {
        state.phase = "scoreboard";
        restoreUI();
        syncState();
    }
}

// ------------------------------------------------------------
// RESTORE UI BASED ON STATE
// ------------------------------------------------------------
function restoreUI() {
    showScreen(state.phase);

    switch (state.phase) {
        case "scoreboard":
            updateScoreboard();
            break;
        case "stage-select":
            renderStageUI();
            break;
        case "report":
            setupReportUI();
            break;
        case "gameover":
            setupGameOverUI();
            break;
    }
}

// ------------------------------------------------------------
// SCOREBOARD
// ------------------------------------------------------------
function updateScoreboard() {
    $("#disp-home-name").textContent = state.home.name;
    $("#disp-away-name").textContent = state.away.name;

    $("#score-home").textContent = state.home.totalStocks;
    $("#score-away").textContent = state.away.totalStocks;

    const hP = state.home.players[state.home.idx];
    const aP = state.away.players[state.away.idx];

    $("#current-home-player").textContent = hP ? hP.name : "Eliminated";
    $("#stocks-home").textContent = hP ? "●".repeat(hP.stocks) : "";

    $("#current-away-player").textContent = aP ? aP.name : "Eliminated";
    $("#stocks-away").textContent = aP ? "●".repeat(aP.stocks) : "";

    if (isHost) {
        $("#start-stage-select-btn").classList.remove("hide");
        $("#action-text").textContent = "Begin Stage Selection";
    } else {
        $("#start-stage-select-btn").classList.add("hide");
        $("#action-text").textContent = "Waiting for Host…";
    }
}

$("#start-stage-select-btn").addEventListener("click", () => {
    broadcast({ type: "start_stage_select" });
    startStageSelect();
});

// ------------------------------------------------------------
// STAGE SELECTION
// ------------------------------------------------------------
function startStageSelect() {
    state.phase = "stage-select";

    if (state.matchNum === 1) {
        // Game 1 — 1-2-1 strike
        stageFlow.mode = "strike";
        stageFlow.turn = "home"; // home bans first
        stageFlow.available = [...STARTERS];
        stageFlow.bans = [];
        stageFlow.banCount = 0;

        $("#stage-phase-title").textContent = "Game 1: 1–2–1 Stage Striking";
    } else {
        // Game 2+ — winner bans 3
        stageFlow.mode = "counterpick";
        stageFlow.turn = state.previousWinner;
        stageFlow.available = [...ALL_STAGES];
        stageFlow.bans = [];
        stageFlow.banCount = 0;

        $("#stage-phase-title").textContent = "Counterpick Phase";
    }

    restoreUI();
}

// Render Buttons
function renderStageUI() {
    const myRole = isHost ? "home" : "away";
    const myTurn = stageFlow.turn === myRole;

    $("#instructions").textContent = myTurn
        ? "Your turn: Select a stage"
        : `Waiting for ${stageFlow.turn.toUpperCase()}`;

    const startList = $("#starter-list");
    const cpList = $("#counterpick-list");

    startList.innerHTML = "";
    cpList.innerHTML = "";

    ALL_STAGES.forEach(stage => {
        if (!stageFlow.available.includes(stage)) return;

        const btn = document.createElement("button");
        btn.className = "stage-btn";
        btn.textContent = stage;

        if (!myTurn) {
            btn.disabled = true;
        } else {
            btn.onclick = () => onStageChosen(stage);
        }

        if (STARTERS.includes(stage)) startList.appendChild(btn);
        else cpList.appendChild(btn);
    });
}

function onStageChosen(stage) {
    if (stageFlow.mode === "strike") {
        banStrike(stage);
    } else {
        banCounterpick(stage);
    }
}

// ------------------------------------------------------------
// 1–2–1 STRIKE LOGIC
// ------------------------------------------------------------
function banStrike(stage) {
    stageFlow.bans.push(stage);
    stageFlow.available = stageFlow.available.filter((s) => s !== stage);

    const r = stageFlow.available.length;

    if (r === 1) {
        const finalStage = stageFlow.available[0];
        broadcast({ type: "select_stage", stage: finalStage });
        finalizeStage(finalStage);
        return;
    }

    // turn logic
    if (r === 4) stageFlow.turn = "away";
    else if (r === 3) stageFlow.turn = "away";
    else if (r === 2) stageFlow.turn = "home";

    broadcast({ type: "ban_stage", stage });
    renderStageUI();
}

function handleBan(stage) {
    stageFlow.available = stageFlow.available.filter((s) => s !== stage);
    stageFlow.banCount++;

    const r = stageFlow.available.length;

    if (stageFlow.mode === "strike") {
        if (r === 1) {
            finalizeStage(stageFlow.available[0]);
            return;
        }

        if (r === 4 || r === 3) stageFlow.turn = "away";
        if (r === 2) stageFlow.turn = "home";
    } else {
        if (stageFlow.banCount === 3) {
            stageFlow.turn = state.previousWinner === "home" ? "away" : "home";
        }
    }

    renderStageUI();
}

// ------------------------------------------------------------
// COUNTERPICK LOGIC
// ------------------------------------------------------------
function banCounterpick(stage) {
    if (stageFlow.banCount < 3) {
        stageFlow.banCount++;
        stageFlow.available = stageFlow.available.filter((s) => s !== stage);

        if (stageFlow.banCount === 3) {
            stageFlow.turn = state.previousWinner === "home" ? "away" : "home";
        }

        broadcast({ type: "ban_stage", stage });
        renderStageUI();
        return;
    }

    // Loser picks
    broadcast({ type: "select_stage", stage });
    finalizeStage(stage);
}

// ------------------------------------------------------------
// FINALIZE STAGE
// ------------------------------------------------------------
function finalizeStage(stage) {
    state.stage = stage;
    state.phase = "report";

    restoreUI();
    syncState();
}

// ------------------------------------------------------------
// REPORTING RESULT
// ------------------------------------------------------------
function setupReportUI() {
    $("#report-stage-name").textContent = state.stage;

    $("#stock-count-selector").classList.add("hide");
    $$(".report-buttons button").forEach(b => b.classList.remove("hide"));
}

let pendingWinner = null;

$("#btn-home-won").addEventListener("click", () => {
    pendingWinner = "home";
    switchToStockSelect();
});

$("#btn-away-won").addEventListener("click", () => {
    pendingWinner = "away";
    switchToStockSelect();
});

function switchToStockSelect() {
    $$(".report-buttons button").forEach(b => b.classList.add("hide"));
    $("#stock-count-selector").classList.remove("hide");
}

$$(".stock-number-buttons button").forEach(b => {
    b.addEventListener("click", () => {
        const stocks = parseInt(b.dataset.stocks);
        broadcast({ type: "report_result", winner: pendingWinner, stocks });
        applyGameResult(pendingWinner, stocks);
    });
});

// ------------------------------------------------------------
// APPLY RESULT
// ------------------------------------------------------------
function applyGameResult(winner, stocksLeft) {
    const loser = winner === "home" ? "away" : "home";

    const wP = state[winner].players[state[winner].idx];
    const lP = state[loser].players[state[loser].idx];

    const diff = wP.stocks - stocksLeft;
    state[winner].totalStocks -= diff;
    wP.stocks = stocksLeft;

    state[loser].totalStocks -= lP.stocks;
    lP.stocks = 0;
    state[loser].idx++;

    // End of round?
    if (state.home.totalStocks <= 0) return endRound("away");
    if (state.away.totalStocks <= 0) return endRound("home");

    // Next game
    state.previousWinner = winner;
    state.matchNum++;

    state.phase = "scoreboard";
    restoreUI();
    syncState();
}

function endRound(winnerRole) {
    state.phase = "gameover";
    state.roundWinner = winnerRole;

    restoreUI();
    syncState();
}

// ------------------------------------------------------------
// GAME OVER SCREEN
// ------------------------------------------------------------
function setupGameOverUI() {
    const winner =
        state.roundWinner === "home" ? state.home.name : state.away.name;

    $("#winner-banner").textContent = `${winner} WINS!`;

    const homeTaken = 12 - state.home.totalStocks;
    const awayTaken = 12 - state.away.totalStocks;

    $("#final-score-display").textContent = `${homeTaken} – ${awayTaken}`;

    $("#new-match-btn").onclick = () => location.reload();
}

