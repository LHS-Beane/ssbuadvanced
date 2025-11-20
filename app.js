// app.js — SSBU Crew Battle Manager (Option A - Refactored UI)
// -------------------------------------------------------------

import { Signaling } from "./signaling.js";

// ---------- DOM UTILITIES ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.add("hide"));
    const screen = $(`.screen[data-screen="${name}"]`);
    if (screen) screen.classList.remove("hide");
}

function setStatus(msg) {
    $("#global-status").textContent = msg;
}

// ---------- GLOBAL STATE ----------
let signal = null;
let isHost = false;
let roomId = null;

let state = {
    phase: "connection",  // connection → roster → scoreboard → stage-select → report → gameover
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

// STARTERS + COUNTERPICKS
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

let stageFlow = {
    mode: null,       // "strike" or "counterpick"
    turn: null,       // "home" or "away"
    available: [],
    bans: [],
    banCount: 0
};

// ---------- NETWORK SYNC ----------
function broadcast(obj) {
    if (signal) signal.send(obj);
}

function syncAll() {
    broadcast({ type: "full_state", state });
}

// ---------- SETUP SIGNALING ----------
async function hostCreateRoom() {
    // generate room id
    roomId = "cb-" + Math.random().toString(36).substring(2, 6);
    $("#room-id").textContent = roomId;

    isHost = true;
    signal = new Signaling();

    await signal.createRoom(roomId);

    setStatus("Room Created. Waiting for opponent...");
    $("#host-info").classList.remove("hide");

    bindSignalEvents();
}

async function joinRoom() {
    roomId = $("#join-id-input").value.trim();
    if (!roomId) return;

    signal = new Signaling();
    await signal.joinRoom(roomId);
    isHost = false;

    setStatus("Connecting to host…");

    bindSignalEvents();
}

function bindSignalEvents() {
    signal.onConnected(() => {
        setStatus("Connected!");

        if (!isHost) {
            broadcast({ type: "request_full_state" });
        }
    });

    signal.onMessage((msg) => {
        handleSignal(msg);
    });

    signal.onDisconnected(() => {
        setStatus("Disconnected. Refresh to reconnect.");
    });
}

// ---------- HANDLE SIGNAL MESSAGES ----------
function handleSignal(msg) {
    switch (msg.type) {
        case "request_full_state":
            if (isHost) syncAll();
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
            processBan(msg.stage);
            break;

        case "select_stage":
            finalizeStage(msg.stage);
            break;

        case "report_result":
            applyGameResult(msg.winner, msg.stocks);
            break;
    }
}

// ---------- ROSTER ----------
$("#submit-roster-btn").addEventListener("click", () => {
    const myRole = isHost ? "home" : "away";
    const name = $("#my-team-name").value || (isHost ? "Home Team" : "Away Team");

    // auto-generate players P1-P4
    let players = [];
    for (let i = 1; i <= 4; i++) {
        players.push({ name: `${name} Player ${i}`, stocks: 3 });
    }

    state[myRole].name = name;
    state[myRole].players = players;

    $("#submit-roster-btn").disabled = true;
    $("#roster-status").textContent = "Ready! Waiting for opponent…";

    broadcast({ type: "roster_submit", role: myRole, name, players });

    checkRosterReady();
});

function checkRosterReady() {
    if (state.home.players.length > 0 && state.away.players.length > 0) {
        // proceed to scoreboard
        state.phase = "scoreboard";
        restoreUI();
        syncAll();
    }
}

// ---------- RESTORE UI ----------
function restoreUI() {
    showScreen(state.phase);

    if (state.phase === "scoreboard") updateScoreboard();
    if (state.phase === "stage-select") renderStages();
    if (state.phase === "report") setupReportUI();
    if (state.phase === "gameover") setupGameoverUI();
}

// ---------- SCOREBOARD ----------
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
        $("#action-text").textContent = "Start Stage Selection";
    } else {
        $("#start-stage-select-btn").classList.add("hide");
        $("#action-text").textContent = "Waiting for Host...";
    }
}

$("#start-stage-select-btn").addEventListener("click", () => {
    broadcast({ type: "start_stage_select" });
    startStageSelect();
});

// ---------- STAGE SELECTION ----------
function startStageSelect() {
    state.phase = "stage-select";

    if (state.matchNum === 1) {
        // Game 1 — 1–2–1 strike
        stageFlow.mode = "strike";
        stageFlow.turn = "home"; // home bans first
        stageFlow.available = [...STARTERS];
        stageFlow.bans = [];
        stageFlow.banCount = 0;
        $("#stage-phase-title").textContent = "Game 1: 1–2–1 Stage Strike";
    } else {
        // Game 2+ — winner bans 3 → loser picks
        stageFlow.mode = "counterpick";
        stageFlow.turn = state.previousWinner;
        stageFlow.available = [...ALL_STAGES];
        stageFlow.bans = [];
        stageFlow.banCount = 0;
        $("#stage-phase-title").textContent = "Counterpick Phase (Winner bans 3)";
    }

    restoreUI();
}

function renderStages() {
    const isMyTurn = (isHost ? "home" : "away") === stageFlow.turn;

    $("#instructions").textContent = isMyTurn
        ? "Your Turn: Select a stage to ban/pick."
        : `Waiting for ${stageFlow.turn.toUpperCase()}`;

    const startList = $("#starter-list");
    const cpList = $("#counterpick-list");

    startList.innerHTML = "";
    cpList.innerHTML = "";

    for (const s of ALL_STAGES) {
        if (!stageFlow.available.includes(s)) continue;

        const btn = document.createElement("button");
        btn.textContent = s;
        btn.className = "stage-btn";

        const isStarter = STARTERS.includes(s);

        if (stageFlow.mode === "strike" && !isStarter) {
            btn.disabled = true;
        }

        if (!isMyTurn) {
            btn.disabled = true;
        } else {
            btn.onclick = () => handleStageClick(s);
        }

        if (isStarter) startList.appendChild(btn);
        else cpList.appendChild(btn);
    }
}

function handleStageClick(stage) {
    if (stageFlow.mode === "strike") {
        banStrike(stage);
    } else {
        banCounterpick(stage);
    }
}

// ---------- STRIKE MODE (1–2–1) ----------
function banStrike(stage) {
    stageFlow.bans.push(stage);
    stageFlow.available = stageFlow.available.filter((s) => s !== stage);

    const remaining = stageFlow.available.length;

    if (remaining === 1) {
        // Final stage → selected
        broadcast({ type: "select_stage", stage: stageFlow.available[0] });
        finalizeStage(stageFlow.available[0]);
        return;
    }

    // Turn logic: 5→4 (home), 4→3 (away), 3→2 (away), 2→1 (home)
    if (remaining === 4) stageFlow.turn = "away";
    else if (remaining === 3) stageFlow.turn = "away";
    else if (remaining === 2) stageFlow.turn = "home";

    broadcast({ type: "ban_stage", stage });
    renderStages();
}

// ---------- COUNTERPICK MODE ----------
function banCounterpick(stage) {
    // first 3 are bans by winner
    if (stageFlow.banCount < 3) {
        stageFlow.banCount++;
        stageFlow.bans.push(stage);
        stageFlow.available = stageFlow.available.filter((s) => s !== stage);

        if (stageFlow.banCount === 3) {
            stageFlow.turn = state.previousWinner === "home" ? "away" : "home";
        }

        broadcast({ type: "ban_stage", stage });
        renderStages();
        return;
    }

    // After bans → loser chooses stage
    broadcast({ type: "select_stage", stage });
    finalizeStage(stage);
}

function processBan(stage) {
    stageFlow.available = stageFlow.available.filter((s) => s !== stage);

    const remaining = stageFlow.available.length;

    if (stageFlow.mode === "strike") {
        if (remaining === 1) {
            finalizeStage(stageFlow.available[0]);
            return;
        }

        if (remaining === 4) stageFlow.turn = "away";
        if (remaining === 3) stageFlow.turn = "away";
        if (remaining === 2) stageFlow.turn = "home";
    } else {
        stageFlow.banCount++;
        if (stageFlow.banCount === 3) {
            stageFlow.turn = state.previousWinner === "home" ? "away" : "home";
        }
    }

    renderStages();
}

// ---------- FINALIZE STAGE ----------
function finalizeStage(stage) {
    state.stage = stage;
    state.phase = "report";

    restoreUI();
    syncAll();
}

// ---------- REPORT SCREEN ----------
function setupReportUI() {
    $("#report-stage-name").textContent = state.stage;
    $("#stock-count-selector").classList.add("hide");
    $$(".report-buttons button").forEach((b) => b.classList.remove("hide"));
}

let pendingWinner = null;

$("#btn-home-won").addEventListener("click", () => onWinner("home"));
$("#btn-away-won").addEventListener("click", () => onWinner("away"));

function onWinner(role) {
    pendingWinner = role;
    $$(".report-buttons button").forEach((b) => b.classList.add("hide"));
    $("#stock-count-selector").classList.remove("hide");
}

$$(".stock-number-buttons button").forEach((b) => {
    b.addEventListener("click", () => {
        const stocks = parseInt(b.dataset.stocks);
        broadcast({ type: "report_result", winner: pendingWinner, stocks });
        applyGameResult(pendingWinner, stocks);
    });
});

// ---------- APPLY GAME RESULT ----------
function applyGameResult(winner, stocksLeft) {
    const loser = winner === "home" ? "away" : "home";

    const winnerP = state[winner].players[state[winner].idx];
    const loserP = state[loser].players[state[loser].idx];

    // winner loses the difference
    const diff = winnerP.stocks - stocksLeft;
    state[winner].totalStocks -= diff;
    winnerP.stocks = stocksLeft;

    // loser loses all remaining stocks
    state[loser].totalStocks -= loserP.stocks;
    loserP.stocks = 0;
    state[loser].idx++;

    // determine round end
    if (state.home.totalStocks <= 0) return endRound("away");
    if (state.away.totalStocks <= 0) return endRound("home");

    // continue next game
    state.previousWinner = winner;
    state.matchNum++;
    state.phase = "scoreboard";
    restoreUI();
    syncAll();
}

function endRound(winningRole) {
    state.phase = "gameover";
    state.roundWinner = winningRole;
    restoreUI();
    syncAll();
}

// ---------- GAMEOVER UI ----------
function setupGameoverUI() {
    const winner = state.roundWinner === "home" ? state.home.name : state.away.name;

    $("#winner-banner").textContent = winner + " WINS!";

    const homeTaken = 12 - state.home.totalStocks;
    const awayTaken = 12 - state.away.totalStocks;

    $("#final-score-display").textContent = `${homeTaken} – ${awayTaken}`;

    $("#new-match-btn").onclick = () => location.reload();
}

// ---------- CONNECTION BUTTONS ----------
$("#host-btn").addEventListener("click", hostCreateRoom);
$("#join-btn").addEventListener("click", joinRoom);

