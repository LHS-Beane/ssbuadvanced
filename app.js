/*************************************************************
 * SSBU CREW BATTLE – FULL LOGIC
 * Uses PeerWrapper (peer-wrapper.js)
 * Author: ChatGPT
 *************************************************************/

const peer = new PeerWrapper();

/*************************************************************
 * CONSTANTS
 *************************************************************/

const STARTERS = ["Battlefield", "Final Destination", "Town & City", "Pokémon Stadium 2", "Smashville"];
const COUNTERPICKS = ["Kalos Pokémon League", "Lylat Cruise", "Small Battlefield", "Yoshi's Story", "Hollow Bastion"];
const FULL_STAGES = [...STARTERS, ...COUNTERPICKS];

// Max stocks in a crew: 4 players * 3 stocks
const TOTAL_STOCKS = 12;

/*************************************************************
 * GLOBAL GAME STATE
 *************************************************************/

let game = {
    phase: "connection",  
    round: 1,             // best of 3 → round 1, 2, maybe 3
    roundsWon: { home: 0, away: 0 },
    isHost: false,

    home: {
        name: "Home",
        players: [],   // { name: "Home P1", stocks: 3 }
        firstUp: null,
        stocksRemaining: TOTAL_STOCKS,
        currentIdx: 0   // player index
    },

    away: {
        name: "Away",
        players: [],
        firstUp: null,
        stocksRemaining: TOTAL_STOCKS,
        currentIdx: 0
    },

    // Stage selection state
    stage: {
        mode: "none",            // game1 or game2+
        turn: null,              // home or away
        bans: [],
        available: [],
        banCount: 0,
        chosen: null
    },

    previousWinner: null  // for game2+ stage selection
};


/*************************************************************
 * DOM SHORTCUTS
 *************************************************************/

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Screens
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

// Global status bar
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

// Host creates room
$("#host-btn").addEventListener("click", () => {
    let id = "cb-" + Math.random().toString(36).substr(2, 4);
    game.isHost = true;

    peer.host(id);
});

// Join room
$("#join-btn").addEventListener("click", () => {
    let id = $("#join-id-input").value.trim();
    if (!id) return;

    game.isHost = false;
    peer.join(id);
});

// Peer wrapper events
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
    }, 500);

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
 * ROSTER SETUP
 *************************************************************/

$("#submit-roster-btn").addEventListener("click", () => {
    let name = $("#my-team-name").value.trim();
    if (!name) name = game.isHost ? "Home Team" : "Away Team";

    let role = game.isHost ? "home" : "away";

    game[role].name = name;
    game[role].players = [
        { name: `${name} P1`, stocks: 3 },
        { name: `${name} P2`, stocks: 3 },
        { name: `${name} P3`, stocks: 3 },
        { name: `${name} P4`, stocks: 3 }
    ];

    $("#submit-roster-btn").disabled = true;
    $("#roster-status").textContent = "Ready! Waiting for opponent…";

    peer.send({
        type: "roster",
        role,
        name,
        players: game[role].players
    });

    checkRosterReady();
});

function checkRosterReady() {
    if (game.home.players.length && game.away.players.length) {
        beginFirstUpSelection();
    }
}


/*************************************************************
 * FIRST-UP SELECTION
 *************************************************************/

function beginFirstUpSelection() {
    game.phase = "firstup";

    showScreen("firstup");

    let role = game.isHost ? "home" : "away";
    let name = game[role].name;

    $("#firstup-instructions").textContent =
        `${name}: Select your first player`;

    let list = $(".firstup-list");
    list.innerHTML = "";

    game[role].players.forEach((p, i) => {
        let btn = document.createElement("button");
        btn.className = "btn-full";
        btn.textContent = p.name;
        btn.addEventListener("click", () => {
            game[role].firstUp = i;
            peer.send({ type: "firstup", role, index: i });
            checkFirstUpReady();
        });
        list.appendChild(btn);
    });
}

function checkFirstUpReady() {
    if (game.home.firstUp !== null && game.away.firstUp !== null) {
        startGame1();
    }
}


/*************************************************************
 * START GAME 1 – SHOW SCOREBOARD
 *************************************************************/

function startGame1() {
    game.phase = "scoreboard";

    // Set current players
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

    let homeP = game.home.players[game.home.currentIdx];
    let awayP = game.away.players[game.away.currentIdx];

    $("#current-home-player").textContent = homeP ? homeP.name : "Eliminated";
    $("#current-away-player").textContent = awayP ? awayP.name : "Eliminated";

    $("#stocks-home").textContent = homeP ? "●".repeat(homeP.stocks) : "";
    $("#stocks-away").textContent = awayP ? "●".repeat(awayP.stocks) : "";

    // Only host may start stage selection
    $("#start-stage-select-btn").style.display = game.isHost ? "block" : "none";
    $("#action-text").textContent = game.isHost
        ? "Start stage selection"
        : "Waiting for host…";
}

$("#start-stage-select-btn").addEventListener("click", () => {
    startStageSelection();
    peer.send({ type: "start-stage" });
});


/*************************************************************
 * STAGE SELECTION
 *************************************************************/

function startStageSelection() {
    game.phase = "stage";

    showScreen("stage");

    // Game 1 → 1-2-1 striking
    if (game.round === 1 && game.previousWinner === null) {
        game.stage.mode = "game1";
        game.stage.available = [...STARTERS];
        game.stage.bans = [];
        game.stage.turn = "home"; // home strikes first
        game.stage.banCount = 0;
        $("#stage-phase-title").textContent = "Game 1: Stage Striking (1–2–1)";
    } else {
        // Game 2+ → winner bans 3
        game.stage.mode = "game2";
        game.stage.available = [...FULL_STAGES];
        game.stage.bans = [];
        game.stage.turn = game.previousWinner;
        game.stage.banCount = 0;
        $("#stage-phase-title").textContent = "Counterpick Phase";
    }

    renderStageButtons();
    updateStageInstructions();
}

function renderStageButtons() {
    let starterDiv = $("#starter-list");
    let cpDiv = $("#counterpick-list");

    starterDiv.innerHTML = "";
    cpDiv.innerHTML = "";

    FULL_STAGES.forEach(stage => {
        let btn = document.createElement("button");
        btn.className = "stage-btn";
        btn.textContent = stage;

        let isBanned = game.stage.bans.includes(stage);
        let myTurn = (game.isHost ? "home" : "away") === game.stage.turn;

        if (isBanned) {
            btn.classList.add("banned");
            btn.disabled = true;
        } else if (myTurn) {
            btn.classList.add("selectable");
            btn.addEventListener("click", () => clickStage(stage));
        } else {
            btn.disabled = true;
        }

        if (STARTERS.includes(stage)) starterDiv.appendChild(btn);
        else cpDiv.appendChild(btn);
    });

    // Hide CPs in Game 1
    $("#counterpick-list").parentElement.style.display =
        game.stage.mode === "game1" ? "none" : "block";
}

function updateStageInstructions() {
    let myTurn = (game.isHost ? "home" : "away") === game.stage.turn;
    let turnName = game.stage.turn === "home" ? game.home.name : game.away.name;

    $("#instructions").textContent = myTurn
        ? "Your turn: Ban / Select a stage"
        : `Waiting for ${turnName}…`;
}

function clickStage(stage) {
    if ((game.isHost ? "home" : "away") !== game.stage.turn) return;

    peer.send({ type: "stage", stage });

    processStageSelection(stage);
}

function processStageSelection(stage) {

    /*********** GAME 1 — 1–2–1 STRIKING ***********/
    if (game.stage.mode === "game1") {

        let remaining = game.stage.available.length;

        // Last 2 stages → choose from remaining 2
        if (remaining === 2) {
            finalizeStage(stage);
            return;
        }

        // Ban normally
        game.stage.bans.push(stage);
        game.stage.available = game.stage.available.filter(s => s !== stage);

        let left = game.stage.available.length;

        if (left === 4) game.stage.turn = "away"; // home → away
        else if (left === 3) game.stage.turn = "away"; // away bans again
        else if (left === 2) game.stage.turn = "home"; // home chooses

        renderStageButtons();
        updateStageInstructions();
        return;
    }


    /*********** GAME 2+ — WINNER BANS 3 → LOSER PICKS ***********/
    if (game.stage.mode === "game2") {

        if (game.stage.turn === game.previousWinner) {
            // Winner banning stage(s)
            game.stage.bans.push(stage);
            game.stage.available = game.stage.available.filter(s => s !== stage);
            game.stage.banCount++;

            if (game.stage.banCount === 3) {
                // Switch turn to loser to SELECT a stage
                game.stage.turn = (game.previousWinner === "home") ? "away" : "home";
            }

            renderStageButtons();
            updateStageInstructions();
            return;
        }

        // Loser final pick
        finalizeStage(stage);
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

$("#btn-home-won").addEventListener("click", () => chooseWinner("home"));
$("#btn-away-won").addEventListener("click", () => chooseWinner("away"));

function chooseWinner(role) {
    pendingWinner = role;

    // hide win buttons
    $$(".report-buttons button").forEach(b => b.classList.add("hide"));

    // show stock options
    $("#stock-count-selector").classList.remove("hide");
}

$$(".stock-number-buttons button").forEach(btn => {
    btn.addEventListener("click", () => {
        let stocks = Number(btn.dataset.stocks);
        submitResult(pendingWinner, stocks);

        peer.send({ type: "result", role: pendingWinner, stocks });
    });
});

function submitResult(winnerRole, winnerStocks) {

    let loser = winnerRole === "home" ? "away" : "home";

    // Deduct the loser's player's remaining stocks from team total
    let loserP = game[loser].players[game[loser].currentIdx];
    game[loser].stocksRemaining -= loserP.stocks;
    loserP.stocks = 0;
    game[loser].currentIdx++; // next player enters

    // Deduct SD stocks from winner
    let winnerP = game[winnerRole].players[game[winnerRole].currentIdx];
    let lost = winnerP.stocks - winnerStocks;
    winnerP.stocks = winnerStocks;
    game[winnerRole].stocksRemaining -= lost;

    game.previousWinner = winnerRole;

    // Check crew round end
    if (game.home.stocksRemaining <= 0) {
        game.roundsWon.away++;
        showRoundWin("away");
        return;
    }
    if (game.away.stocksRemaining <= 0) {
        game.roundsWon.home++;
        showRoundWin("home");
        return;
    }

    // Continue next game
    game.phase = "scoreboard";
    updateScoreboard();
    showScreen("scoreboard");
}


/*************************************************************
 * ROUND WIN / MATCH WIN
 *************************************************************/

function showRoundWin(role) {
    game.phase = "roundwin";

    $("#round-winner-banner").textContent =
        `${game[role].name} Wins Round ${game.round}!`;

    showScreen("roundwin");
}

$("#start-next-round-btn").addEventListener("click", () => {
    game.round++;

    if (game.roundsWon.home === 2 || game.roundsWon.away === 2) {
        showMatchWin();
        return;
    }

    // Reset stocks
    ["home", "away"].forEach(role => {
        game[role].stocksRemaining = TOTAL_STOCKS;
        game[role].players.forEach(p => p.stocks = 3);
        game[role].currentIdx = null;
        game[role].firstUp = null;
    });

    beginFirstUpSelection();
});


function showMatchWin() {
    game.phase = "matchwin";

    let winner = game.roundsWon.home === 2 ? "home" : "away";

    $("#match-winner-banner").textContent =
        `${game[winner].name} Wins the Match!`;

    $("#final-series-score").textContent =
        `${game.roundsWon.home} – ${game.roundsWon.away}`;

    showScreen("matchwin");
}

$("#new-match-btn").addEventListener("click", () => {
    location.reload();
});


/*************************************************************
 * NETWORK MESSAGE HANDLING
 *************************************************************/

peer.onData = (data) => {

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
            // ignore
            break;
    }
};


/*************************************************************
 * RESTORE UI (after full-sync for reconnecting clients)
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
