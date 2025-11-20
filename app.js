/*************************************************************
 * SSBU CREW BATTLE – FULL LOGIC
 * Works with PeerWrapper (peer-wrapper.js)
 *************************************************************/

const peer = new PeerWrapper();

/*************************************************************
 * CONSTANTS
 *************************************************************/

const STARTERS = ["Battlefield", "Final Destination", "Town & City", "Pokémon Stadium 2", "Smashville"];
const COUNTERPICKS = ["Kalos Pokémon League", "Lylat Cruise", "Small Battlefield", "Yoshi's Story", "Hollow Bastion"];
const FULL_STAGES = [...STARTERS, ...COUNTERPICKS];

const TOTAL_STOCKS = 12;

/*************************************************************
 * GLOBAL GAME STATE
 *************************************************************/

let game = {
    phase: "connection",
    round: 1,
    roundsWon: { home: 0, away: 0 },
    isHost: false,

    home: {
        name: "Home",
        players: [],
        firstUp: null,
        stocksRemaining: TOTAL_STOCKS,
        currentIdx: null
    },

    away: {
        name: "Away",
        players: [],
        firstUp: null,
        stocksRemaining: TOTAL_STOCKS,
        currentIdx: null
    },

    stage: {
        mode: "none",
        turn: null,
        bans: [],
        available: [],
        banCount: 0,
        chosen: null
    },

    previousWinner: null
};

/*************************************************************
 * DOM SHORTCUTS
 *************************************************************/

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const screens = {
    connection: $('[data-screen="connection"]'),
    roster: $('[data-screen="roster"]'),
    firstup: $('[data-screen="first-up"]'),
    scoreboard: $('[data-screen="scoreboard"]'),
    stage: $('[data-screen="stage-select"]'),
    report: $('[data-screen="report"]'),
    roundwin: $('[data-screen="round-win"]'),
    matchwin: $('[data-screen="match-win"]')
};

const statusBar = $("#global-status");

/*************************************************************
 * SCREEN MANAGEMENT
 *************************************************************/

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add("hide"));
    screens[name].classList.remove("hide");
    screens[name].classList.add("active");
}

/*************************************************************
 * CONNECTION FLOW
 *************************************************************/

$("#host-btn").addEventListener("click", () => {
    const id = "cb-" + Math.random().toString(36).substr(2, 4);
    game.isHost = true;
    peer.host(id);
});

$("#join-btn").addEventListener("click", () => {
    const id = $("#join-id-input").value.trim();
    if (!id) return;
    game.isHost = false;
    peer.join(id);
});

peer.onOpen = (id) => {
    if (game.isHost) {
        $("#host-btn").classList.add("hide");
        $("#host-info").classList.remove("hide");
        $("#room-id").textContent = id;
        statusBar.textContent = "Waiting for Away Team…";
    } else {
        statusBar.textContent = "Connecting…";
    }
};

peer.onConnected = () => {
    statusBar.textContent = "Connected!";

    setTimeout(() => {
        showScreen("roster");
        game.phase = "roster";
    }, 400);

    if (!game.isHost) {
        peer.send({ type: "request-full-sync" });
    }
};

peer.onDisconnect = () => {
    statusBar.textContent = "Disconnected. Attempting Reconnect…";
};

peer.onError = (err) => {
    statusBar.textContent = "Network Error: " + err.type;
};

/*************************************************************
 * ROSTER SETUP (FIXED)
 *************************************************************/

$("#submit-roster-btn").addEventListener("click", () => {
    let name = $("#my-team-name").value.trim();
    let role = game.isHost ? "home" : "away";

    if (!name) name = game.isHost ? "Home Team" : "Away Team";

    // Local update
    game[role].name = name;
    game[role].players = [
        { name: `${name} P1`, stocks: 3 },
        { name: `${name} P2`, stocks: 3 },
        { name: `${name} P3`, stocks: 3 },
        { name: `${name} P4`, stocks: 3 }
    ];

    $("#submit-roster-btn").disabled = true;
    $("#roster-status").textContent = "Ready! Waiting for opponent…";

    // Check my side
    checkRosterReady();

    // Send to opponent
    peer.send({
        type: "roster",
        role,
        name,
        players: game[role].players
    });
});

function checkRosterReady() {
    console.log("ROSTER CHECK:", {
    home: game.home.players.length,
    away: game.away.players.length,
    homePlayers: game.home.players,
    awayPlayers: game.away.players
});

    const homeReady = game.home.players.length === 4;
    const awayReady = game.away.players.length === 4;

    if (homeReady && awayReady) {
        beginFirstUpSelection();
    }
}

/*************************************************************
 * FIRST-UP SELECTION
 *************************************************************/

function beginFirstUpSelection() {
    game.phase = "firstup";
    showScreen("firstup");

    const role = game.isHost ? "home" : "away";
    const team = game[role];

    $("#firstup-instructions").textContent =
        `${team.name}: Select your first player`;

    const list = $(".firstup-list");
    list.innerHTML = "";

    team.players.forEach((p, i) => {
        let btn = document.createElement("button");
        btn.className = "btn-full";
        btn.textContent = p.name;
        btn.onclick = () => {
            game[role].firstUp = i;
            peer.send({ type: "firstup", role, index: i });
            checkFirstUpReady();
        };
        list.appendChild(btn);
    });
}

function checkFirstUpReady() {
    if (game.home.firstUp !== null && game.away.firstUp !== null) {
        startGame1();
    }
}

/*************************************************************
 * START GAME 1 → SCOREBOARD
 *************************************************************/

function startGame1() {
    game.phase = "scoreboard";

    game.home.currentIdx = game.home.firstUp;
    game.away.currentIdx = game.away.firstUp;

    updateScoreboard();
    showScreen("scoreboard");
}

/*************************************************************
 * SCOREBOARD UPDATE
 *************************************************************/

function updateScoreboard() {
    $("#disp-home-name").textContent = game.home.name;
    $("#disp-away-name").textContent = game.away.name;

    $("#score-home").textContent = game.home.stocksRemaining;
    $("#score-away").textContent = game.away.stocksRemaining;

    const hp = game.home.players[game.home.currentIdx];
    const ap = game.away.players[game.away.currentIdx];

    $("#current-home-player").textContent = hp ? hp.name : "Eliminated";
    $("#current-away-player").textContent = ap ? ap.name : "Eliminated";

    $("#stocks-home").textContent = hp ? "●".repeat(hp.stocks) : "";
    $("#stocks-away").textContent = ap ? "●".repeat(ap.stocks) : "";

    $("#start-stage-select-btn").style.display = game.isHost ? "block" : "none";
    $("#action-text").textContent = game.isHost ? "Start stage selection" : "Waiting for host…";
}

$("#start-stage-select-btn").onclick = () => {
    startStageSelection();
    peer.send({ type: "start-stage" });
};

/*************************************************************
 * STAGE SELECTION (1–2–1, then winner bans 3)
 *************************************************************/

function startStageSelection() {
    game.phase = "stage";
    showScreen("stage");

    if (game.round === 1 && game.previousWinner === null) {
        game.stage.mode = "game1";
        game.stage.available = [...STARTERS];
        game.stage.turn = "home";
        game.stage.bans = [];
        game.stage.banCount = 0;

        $("#stage-phase-title").textContent = "Game 1: 1–2–1 Stage Striking";

    } else {
        game.stage.mode = "game2";
        game.stage.available = [...FULL_STAGES];
        game.stage.turn = game.previousWinner;
        game.stage.bans = [];
        game.stage.banCount = 0;

        $("#stage-phase-title").textContent = "Counterpick Phase";
    }

    renderStageButtons();
    updateStageInstructions();
}

function renderStageButtons() {
    $("#starter-list").innerHTML = "";
    $("#counterpick-list").innerHTML = "";

    FULL_STAGES.forEach(stage => {
        const btn = document.createElement("button");
        btn.className = "stage-btn";
        btn.textContent = stage;

        if (game.stage.bans.includes(stage)) {
            btn.classList.add("banned");
            btn.disabled = true;
        } else {
            const myTurn = (game.isHost ? "home" : "away") === game.stage.turn;
            if (myTurn) {
                btn.classList.add("selectable");
                btn.onclick = () => clickStage(stage);
            } else {
                btn.disabled = true;
            }
        }

        if (STARTERS.includes(stage)) $("#starter-list").appendChild(btn);
        else $("#counterpick-list").appendChild(btn);
    });

    $("#counterpick-list").parentElement.style.display =
        game.stage.mode === "game1" ? "none" : "block";
}

function updateStageInstructions() {
    const myTurn = (game.isHost ? "home" : "away") === game.stage.turn;
    const turnName = game.stage.turn === "home" ? game.home.name : game.away.name;

    $("#instructions").textContent =
        myTurn ? "Your turn: Ban/Select stage" : `Waiting for ${turnName}…`;
}

function clickStage(stage) {
    if ((game.isHost ? "home" : "away") !== game.stage.turn) return;

    peer.send({ type: "stage", stage });

    processStageSelection(stage);
}

function processStageSelection(stage) {

    /************ GAME 1 (1–2–1) ************/
    if (game.stage.mode === "game1") {

        const remaining = game.stage.available.length;

        if (remaining === 2) {
            return finalizeStage(stage);
        }

        game.stage.bans.push(stage);
        game.stage.available = game.stage.available.filter(s => s !== stage);

        const left = game.stage.available.length;

        if (left === 4) game.stage.turn = "away";    // home → away
        else if (left === 3) game.stage.turn = "away"; // away again
        else if (left === 2) game.stage.turn = "home"; // home picks

        renderStageButtons();
        updateStageInstructions();
        return;
    }

    /************ GAME 2+ (winner bans 3) ************/
    if (game.stage.mode === "game2") {

        if (game.stage.turn === game.previousWinner) {
            game.stage.bans.push(stage);
            game.stage.available = game.stage.available.filter(s => s !== stage);
            game.stage.banCount++;

            if (game.stage.banCount === 3) {
                game.stage.turn = (game.previousWinner === "home") ? "away" : "home";
            }

            renderStageButtons();
            updateStageInstructions();
            return;
        }

        return finalizeStage(stage);
    }
}

function finalizeStage(stage) {
    game.stage.chosen = stage;
    $("#report-stage-name").textContent = stage;

    peer.send({ type: "stage-final", stage });

    showScreen("report");
}

/*************************************************************
 * REPORTING RESULTS
 *************************************************************/

let pendingWinner = null;

$("#btn-home-won").onclick = () => chooseWinner("home");
$("#btn-away-won").onclick = () => chooseWinner("away");

function chooseWinner(role) {
    pendingWinner = role;

    $$(".report-buttons button").forEach(b => b.classList.add("hide"));
    $("#stock-count-selector").classList.remove("hide");
}

$$(".stock-number-buttons button").forEach(btn => {
    btn.onclick = () => {
        const stocks = Number(btn.dataset.stocks);
        submitResult(pendingWinner, stocks);
        peer.send({ type: "result", role: pendingWinner, stocks });
    };
});

function submitResult(winnerRole, winnerStocks) {

    const loser = winnerRole === "home" ? "away" : "home";

    // Deduct from loser
    const loserP = game[loser].players[game[loser].currentIdx];
    game[loser].stocksRemaining -= loserP.stocks;
    loserP.stocks = 0;
    game[loser].currentIdx++;

    // Deduct SD from winner
    const winnerP = game[winnerRole].players[game[winnerRole].currentIdx];
    const lost = winnerP.stocks - winnerStocks;
    winnerP.stocks = winnerStocks;
    game[winnerRole].stocksRemaining -= lost;

    game.previousWinner = winnerRole;

    // Check for round winner
    if (game.home.stocksRemaining <= 0) {
        game.roundsWon.away++;
        return showRoundWin("away");
    }

    if (game.away.stocksRemaining <= 0) {
        game.roundsWon.home++;
        return showRoundWin("home");
    }

    updateScoreboard();
    showScreen("scoreboard");
}

/*************************************************************
 * ROUND / MATCH WIN
 *************************************************************/

function showRoundWin(role) {
    game.phase = "roundwin";
    $("#round-winner-banner").textContent =
        `${game[role].name} Wins Round ${game.round}!`;
    showScreen("roundwin");
}

$("#start-next-round-btn").onclick = () => {

    game.round++;

    if (game.roundsWon.home === 2 || game.roundsWon.away === 2) {
        return showMatchWin();
    }

    // Reset for next round
    ["home", "away"].forEach(role => {
        game[role].stocksRemaining = TOTAL_STOCKS;
        game[role].players.forEach(p => p.stocks = 3);
        game[role].currentIdx = null;
        game[role].firstUp = null;
    });

    beginFirstUpSelection();
};

function showMatchWin() {
    game.phase = "matchwin";

    const winner = game.roundsWon.home === 2 ? "home" : "away";

    $("#match-winner-banner").textContent =
        `${game[winner].name} Wins the Match!`;

    $("#final-series-score").textContent =
        `${game.roundsWon.home} – ${game.roundsWon.away}`;

    showScreen("matchwin");
}

$("#new-match-btn").onclick = () => location.reload();

/*************************************************************
 * NETWORK MESSAGE HANDLER
 *************************************************************/

peer.onData = data => {
    switch (data.type) {

        case "request-full-sync":
            peer.send({ type: "full-sync", game });
            break;

        case "full-sync":
            game = data.game;
            restoreUI();
            break;

        case "roster":
            game[data.role].name = data.name;
            game[data.role].players = data.players;
            checkRosterReady();
            break;

        case "firstup":
            game[data.role].firstUp = data.index;
            checkFirstUpReady();
            break;

        case "start-stage":
            startStageSelection();
            break;

        case "stage":
            processStageSelection(data.stage);
            break;

        case "stage-final":
            finalizeStage(data.stage);
            break;

        case "result":
            submitResult(data.role, data.stocks);
            break;

        case "ping":
            break;
    }
};

/*************************************************************
 * UI RESTORE (reconnect / refresh)
 *************************************************************/

function restoreUI() {
    switch (game.phase) {

        case "roster":
            showScreen("roster");
            break;

        case "firstup":
            beginFirstUpSelection();
            break;

        case "scoreboard":
            updateScoreboard();
            showScreen("scoreboard");
            break;

        case "stage":
            startStageSelection();
            break;

        case "report":
            showScreen("report");
            break;

        case "roundwin":
            showScreen("roundwin");
            break;

        case "matchwin":
            showMatchWin();
            break;
    }
}
