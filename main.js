// main.js

// --- CONSTANTS ---
const STARTERS = ["Battlefield", "Final Destination", "Town & City", "Pokémon Stadium 2", "Smashville"];
const COUNTERPICKS = ["Kalos Pokémon League", "Lylat Cruise", "Small Battlefield", "Yoshi's Story", "Hollow Bastion"];
const FULL_STAGE_LIST = [...STARTERS, ...COUNTERPICKS];

// --- GLOBAL STATE ---
let peer, conn, isHost = false;
let crewState = {
    home: { name: "Home", players: [], stocks: 12, currentIdx: 0 },
    away: { name: "Away", players: [], stocks: 12, currentIdx: 0 },
    matchNum: 1,
    phase: 'roster', // roster, dashboard, stage_select, report, gameover
    previousWinner: null // 'home' or 'away'
};

// Stage Selection State
let stageState = { available: [], bans: [], turn: '', banCount: 0, mode: '' }; 
// mode: 'game1' or 'subsequent'

// --- DOM ELEMENTS ---
const screens = {
    conn: document.getElementById('screen-connection'),
    roster: document.getElementById('screen-roster'),
    scoreboard: document.getElementById('screen-scoreboard'),
    stage: document.getElementById('screen-stage-select'),
    report: document.getElementById('screen-report'),
    gameover: document.getElementById('screen-gameover')
};

// --- 1. NETWORKING ---

document.getElementById('host-btn').addEventListener('click', () => {
    const newRoomId = 'cb-' + Math.random().toString(36).substr(2, 4);
    peer = new Peer(newRoomId);
    peer.on('open', (id) => {
        document.getElementById('room-id').textContent = id;
        document.getElementById('host-btn').disabled = true;
        document.getElementById('client-controls').classList.add('hidden');
        document.getElementById('conn-status').textContent = 'Waiting for Away Team...';
        isHost = true;
    });
    peer.on('connection', setupConnection);
});

document.getElementById('join-btn').addEventListener('click', () => {
    const id = document.getElementById('join-id-input').value.trim();
    if(id) {
        peer = new Peer();
        peer.on('open', () => setupConnection(peer.connect(id)));
    }
});

function setupConnection(connection) {
    conn = connection;
    document.getElementById('conn-status').textContent = 'Connected!';
    showScreen('roster');
    
    conn.on('data', (data) => {
        handleData(data);
    });

    // Sync Roster request if host
    if(isHost) sendData({ type: 'sync_request' });
}

function sendData(data) { if(conn && conn.open) conn.send(data); }

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

// --- 2. ROSTER LOGIC ---

document.getElementById('submit-roster-btn').addEventListener('click', () => {
    const teamName = document.getElementById('my-team-name').value || (isHost ? "Home Team" : "Away Team");
    const players = [
        document.getElementById('p1-name').value || "Player 1",
        document.getElementById('p2-name').value || "Player 2",
        document.getElementById('p3-name').value || "Player 3",
        document.getElementById('p4-name').value || "Player 4"
    ];
    
    // Construct player objects with 3 stocks each
    const playerObjs = players.map(name => ({ name: name, stocks: 3 }));

    const myRole = isHost ? 'home' : 'away';
    
    // Update local state partially
    crewState[myRole].name = teamName;
    crewState[myRole].players = playerObjs;

    // Disable button
    document.getElementById('submit-roster-btn').disabled = true;
    document.getElementById('roster-status').textContent = "Roster sent! Waiting for opponent...";

    sendData({ type: 'roster_submit', role: myRole, name: teamName, players: playerObjs });
    checkRosterReady();
});

function checkRosterReady() {
    // Check if both teams have players
    if(crewState.home.players.length > 0 && crewState.away.players.length > 0) {
        updateScoreboardUI();
        showScreen('scoreboard');
    }
}

// --- 3. SCOREBOARD LOGIC ---

function updateScoreboardUI() {
    // Update Team Names and Total Stocks
    document.getElementById('disp-home-name').textContent = crewState.home.name;
    document.getElementById('score-home').textContent = crewState.home.stocks;
    
    document.getElementById('disp-away-name').textContent = crewState.away.name;
    document.getElementById('score-away').textContent = crewState.away.stocks;

    // Update Active Players
    const homeP = crewState.home.players[crewState.home.currentIdx];
    const awayP = crewState.away.players[crewState.away.currentIdx];

    document.getElementById('current-home-player').textContent = homeP ? homeP.name : "Eliminated";
    document.getElementById('stocks-home').textContent = "●".repeat(homeP ? homeP.stocks : 0);

    document.getElementById('current-away-player').textContent = awayP ? awayP.name : "Eliminated";
    document.getElementById('stocks-away').textContent = "●".repeat(awayP ? awayP.stocks : 0);

    // Button Text
    const btn = document.getElementById('start-stage-select-btn');
    if(isHost) {
        btn.style.display = 'block';
        btn.textContent = crewState.matchNum === 1 ? "Start Game 1 (Stage Strike)" : "Select Next Stage";
    } else {
        btn.style.display = 'none';
        document.getElementById('action-text').textContent = "Waiting for Host to start stage selection...";
    }
}

document.getElementById('start-stage-select-btn').addEventListener('click', () => {
    startStageSelection();
    sendData({ type: 'start_stage_select' });
});

// --- 4. STAGE SELECTION LOGIC ---

function startStageSelection() {
    showScreen('stage');
    stageState.available = (crewState.matchNum === 1) ? [...STARTERS] : [...FULL_STAGE_LIST];
    stageState.bans = [];
    
    if(crewState.matchNum === 1) {
        stageState.mode = 'game1';
        stageState.turn = 'home'; // Home bans first in G1 (per rules)
        document.getElementById('stage-phase-title').textContent = "Game 1: Striking";
    } else {
        stageState.mode = 'subsequent';
        // Rule: Previous winner bans 3
        stageState.turn = crewState.previousWinner; 
        stageState.banCount = 0;
        document.getElementById('stage-phase-title').textContent = "Counterpick Phase";
    }
    
    renderStages();
    updateStageInstructions();
}

function renderStages() {
    const list1 = document.getElementById('starter-list');
    const list2 = document.getElementById('counterpick-list');
    list1.innerHTML = ''; list2.innerHTML = '';

    // Hide Counterpicks in Game 1
    list2.parentElement.style.display = (stageState.mode === 'game1') ? 'none' : 'block';

    const relevantList = (stageState.mode === 'game1') ? STARTERS : FULL_STAGE_LIST;

    relevantList.forEach(stage => {
        const btn = document.createElement('button');
        btn.textContent = stage;
        btn.className = 'stage-btn';
        
        if(stageState.bans.includes(stage)) {
            btn.classList.add('banned');
            btn.disabled = true;
        } else {
            // Interaction Logic
            const myRole = isHost ? 'home' : 'away';
            if(myRole === stageState.turn) {
                btn.classList.add('selectable');
                btn.onclick = () => handleStageClick(stage);
            } else {
                btn.disabled = true;
            }
        }

        if(STARTERS.includes(stage)) list1.appendChild(btn);
        else list2.appendChild(btn);
    });
}

function updateStageInstructions() {
    const myRole = isHost ? 'home' : 'away';
    const txt = document.getElementById('instructions');
    const turnName = (stageState.turn === 'home') ? crewState.home.name : crewState.away.name;

    if(myRole === stageState.turn) {
        txt.textContent = "Your Turn: Select/Ban a stage.";
        txt.style.color = "#007bff";
    } else {
        txt.textContent = `Waiting for ${turnName}...`;
        txt.style.color = "#555";
    }
}

function handleStageClick(stage) {
    sendData({ type: 'stage_click', stage: stage });
    processStageLogic(stage);
}

function processStageLogic(stage) {
    // GAME 1 LOGIC (1-2-1)
    // available length: 5 -> Home Bans 1 (4 left) -> Away Bans 2 (2 left) -> Home Picks
    if(stageState.mode === 'game1') {
        const rem = stageState.available.length;
        
        if(rem === 2) {
            // This is the PICK
            confirmStage(stage);
            return;
        }

        // It is a Ban
        stageState.bans.push(stage);
        stageState.available = stageState.available.filter(s => s !== stage);
        
        const newRem = stageState.available.length;
        if(newRem === 4) stageState.turn = 'away';
        else if(newRem === 3) stageState.turn = 'away';
        else if(newRem === 2) stageState.turn = 'home'; // Home picks from last 2
    } 
    // SUBSEQUENT LOGIC (Winner bans 3, Loser picks)
    else {
        if(stageState.banCount < 3) {
            // Ban
            stageState.bans.push(stage);
            stageState.available = stageState.available.filter(s => s !== stage);
            stageState.banCount++;
            
            if(stageState.banCount === 3) {
                // Switch to Loser to pick
                stageState.turn = (crewState.previousWinner === 'home') ? 'away' : 'home';
            }
        } else {
            // Pick
            confirmStage(stage);
            return;
        }
    }
    
    renderStages();
    updateStageInstructions();
}

function confirmStage(stage) {
    document.getElementById('report-stage-name').textContent = stage;
    showScreen('report');
    // Reset report UI
    document.getElementById('stock-count-selector').classList.add('hidden');
    document.querySelectorAll('.report-buttons button').forEach(b => b.classList.remove('hidden'));
}

// --- 5. RESULT REPORTING LOGIC ---

let pendingWinner = '';

document.getElementById('btn-home-won').addEventListener('click', () => { setupReport('home'); });
document.getElementById('btn-away-won').addEventListener('click', () => { setupReport('away'); });

function setupReport(winnerRole) {
    pendingWinner = winnerRole;
    document.querySelectorAll('.report-buttons button').forEach(b => b.classList.add('hidden'));
    document.getElementById('stock-count-selector').classList.remove('hidden');
}

function reportConfirm(stocksRemaining) {
    // Process the win locally
    applyGameResult(pendingWinner, stocksRemaining);
    // Send to opponent
    sendData({ type: 'game_result', winner: pendingWinner, stocks: stocksRemaining });
}

function applyGameResult(winnerRole, winnerStocks) {
    crewState.previousWinner = winnerRole;
    const loserRole = (winnerRole === 'home') ? 'away' : 'home';

    // 1. Handle Loser (Set to 0 stocks, move index)
    const loserP = crewState[loserRole].players[crewState[loserRole].currentIdx];
    crewState[loserRole].stocks -= loserP.stocks; // Deduct all their remaining
    loserP.stocks = 0;
    crewState[loserRole].currentIdx++; // Next player up

    // 2. Handle Winner (Update stocks)
    const winnerP = crewState[winnerRole].players[crewState[winnerRole].currentIdx];
    const stockDiff = winnerP.stocks - winnerStocks; // Stocks lost
    crewState[winnerRole].stocks -= stockDiff;
    winnerP.stocks = winnerStocks; // Set new current stocks

    // 3. Check Win Condition
    if(crewState.home.stocks <= 0) {
        endCrewBattle("AWAY TEAM");
    } else if (crewState.away.stocks <= 0) {
        endCrewBattle("HOME TEAM");
    } else {
        // Setup for next match
        crewState.matchNum++;
        updateScoreboardUI();
        showScreen('scoreboard');
        document.getElementById('action-text').textContent = "Previous game recorded. Ready for next stage?";
    }
}

function endCrewBattle(winnerName) {
    document.getElementById('winner-banner').textContent = winnerName + " WINS!";
    showScreen('gameover');
}


// --- 6. DATA HANDLING ---

function handleData(data) {
    switch(data.type) {
        case 'roster_submit':
            crewState[data.role].name = data.name;
            crewState[data.role].players = data.players;
            checkRosterReady();
            break;
        case 'start_stage_select':
            startStageSelection();
            break;
        case 'stage_click':
            processStageLogic(data.stage);
            break;
        case 'game_result':
            applyGameResult(data.winner, data.stocks);
            break;
    }
}
