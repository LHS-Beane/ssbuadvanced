// main.js

// --- CONSTANTS ---
const STARTERS = ["Battlefield", "Final Destination", "Town & City", "Pokémon Stadium 2", "Smashville"];
const COUNTERPICKS = ["Kalos Pokémon League", "Lylat Cruise", "Small Battlefield", "Yoshi's Story", "Hollow Bastion"];
const FULL_STAGE_LIST = [...STARTERS, ...COUNTERPICKS];

// --- GLOBAL STATE ---
let peer, conn, isHost = false;
let heartbeatInterval;

// The "Master State" 
let crewState = {
    home: { name: "Home", players: [], stocks: 12, currentIdx: 0 },
    away: { name: "Away", players: [], stocks: 12, currentIdx: 0 },
    matchNum: 1,
    phase: 'roster', // roster, dashboard, stage_select, report, gameover
    previousWinner: null 
};

// Stage Selection State
let stageState = { available: [], bans: [], turn: '', banCount: 0, mode: '' }; 

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

    peer.on('connection', (connection) => {
        setupConnection(connection);
    });
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
    
    // Start Heartbeat to keep connection alive on phones
    startHeartbeat();

    conn.on('data', (data) => {
        handleData(data);
    });

    conn.on('close', () => {
        // Don't alert immediately, they might be refreshing.
        // Just stop the heartbeat.
        clearInterval(heartbeatInterval);
    });

    // --- THE CRASH FIX ---
    // If I am the Host, and someone connects (or reconnects),
    // I immediately send them the entire state of the world.
    if(isHost) {
        // Wait 500ms for connection to stabilize, then sync
        setTimeout(() => {
            sendData({
                type: 'full_sync',
                crew: crewState,
                stage: stageState
            });
        }, 500);
    } else {
        // If I am the client, I wait for the sync.
        document.getElementById('conn-status').textContent = 'Syncing Match Data...';
    }
}

function sendData(data) { if(conn && conn.open) conn.send(data); }

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (conn && conn.open) {
            conn.send({ type: 'ping' });
        }
    }, 2000); // Ping every 2 seconds
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

// --- 2. ROSTER LOGIC ---

document.getElementById('submit-roster-btn').addEventListener('click', () => {
    const teamName = document.getElementById('my-team-name').value || (isHost ? "Home Team" : "Away Team");
    const myRole = isHost ? 'home' : 'away';

    const playerObjs = [];
    for(let i = 1; i <= 4; i++) {
        playerObjs.push({ name: `${teamName} Player ${i}`, stocks: 3 });
    }
    
    crewState[myRole].name = teamName;
    crewState[myRole].players = playerObjs;

    document.getElementById('submit-roster-btn').disabled = true;
    document.getElementById('roster-status').textContent = "Ready! Waiting for opponent...";

    // Update my local view
    crewState.phase = 'roster'; 

    sendData({ type: 'roster_submit', role: myRole, name: teamName, players: playerObjs });
    checkRosterReady();
});

function checkRosterReady() {
    if(crewState.home.players.length > 0 && crewState.away.players.length > 0) {
        // Only move to scoreboard if we are still in roster phase
        // (Prevents resetting if we reconnect later)
        if(crewState.phase === 'roster') {
            crewState.phase = 'dashboard';
        }
        restoreUI(); 
    }
}

// --- 3. UI RESTORATION (Rejoin Logic) ---
function restoreUI() {
    // 1. Update Names/Stocks everywhere
    updateScoreboardUI();

    // 2. Show correct screen based on phase
    if(crewState.phase === 'roster') {
        showScreen('roster');
    } 
    else if(crewState.phase === 'dashboard') {
        showScreen('scoreboard');
    } 
    else if(crewState.phase === 'stage_select') {
        showScreen('stage');
        // Re-render stage buttons with correct history
        renderStages();
        updateStageInstructions();
    } 
    else if(crewState.phase === 'gameover') {
        // Re-trigger game over screen
        let winner = (crewState.home.stocks > 0) ? "HOME TEAM" : "AWAY TEAM";
        let role = (crewState.home.stocks > 0) ? 'home' : 'away';
        endCrewBattle(winner, role);
    }
}

// --- 4. SCOREBOARD LOGIC ---

function updateScoreboardUI() {
    document.getElementById('disp-home-name').textContent = crewState.home.name;
    document.getElementById('score-home').textContent = crewState.home.stocks;
    
    document.getElementById('disp-away-name').textContent = crewState.away.name;
    document.getElementById('score-away').textContent = crewState.away.stocks;

    const homeP = crewState.home.players[crewState.home.currentIdx];
    const awayP = crewState.away.players[crewState.away.currentIdx];

    document.getElementById('current-home-player').textContent = homeP ? homeP.name : "Eliminated";
    document.getElementById('stocks-home').textContent = "●".repeat(homeP ? homeP.stocks : 0);

    document.getElementById('current-away-player').textContent = awayP ? awayP.name : "Eliminated";
    document.getElementById('stocks-away').textContent = "●".repeat(awayP ? awayP.stocks : 0);

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

// --- 5. STAGE SELECTION LOGIC ---

function startStageSelection() {
    crewState.phase = 'stage_select'; // Update Phase
    showScreen('stage');
    
    // Only initialize if not already set (prevents wiping data on reconnect)
    // But we need to reset if it's a NEW round.
    // Logic: We simply overwrite stageState here because 'startStageSelection' is only called manually by Host.
    
    stageState.available = (crewState.matchNum === 1) ? [...STARTERS] : [...FULL_STAGE_LIST];
    stageState.bans = [];
    
    if(crewState.matchNum === 1) {
        stageState.mode = 'game1';
        stageState.turn = 'home'; 
        document.getElementById('stage-phase-title').textContent = "Game 1: Striking";
    } else {
        stageState.mode = 'subsequent';
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
    // Only process if it's my turn
    const myRole = isHost ? 'home' : 'away';
    if(myRole !== stageState.turn) return;

    sendData({ type: 'stage_click', stage: stage });
    processStageLogic(stage);
}

function processStageLogic(stage) {
    // GAME 1 LOGIC
    if(stageState.mode === 'game1') {
        const rem = stageState.available.length;
        
        if(rem === 2) {
            confirmStage(stage);
            return;
        }

        stageState.bans.push(stage);
        stageState.available = stageState.available.filter(s => s !== stage);
        
        const newRem = stageState.available.length;
        if(newRem === 4) stageState.turn = 'away';
        else if(newRem === 3) stageState.turn = 'away';
        else if(newRem === 2) stageState.turn = 'home'; 
    } 
    // SUBSEQUENT LOGIC
    else {
        if(stageState.banCount < 3) {
            stageState.bans.push(stage);
            stageState.available = stageState.available.filter(s => s !== stage);
            stageState.banCount++;
            
            if(stageState.banCount === 3) {
                stageState.turn = (crewState.previousWinner === 'home') ? 'away' : 'home';
            }
        } else {
            confirmStage(stage);
            return;
        }
    }
    
    renderStages();
    updateStageInstructions();
}

function confirmStage(stage) {
    document.getElementById('report-stage-name').textContent = stage;
    // Don't change phase variable yet, only change screen
    showScreen('report');
    document.getElementById('stock-count-selector').classList.add('hidden');
    document.querySelectorAll('.report-buttons button').forEach(b => b.classList.remove('hidden'));
}

// --- 6. REPORTING LOGIC ---

let pendingWinner = '';

document.getElementById('btn-home-won').addEventListener('click', () => { setupReport('home'); });
document.getElementById('btn-away-won').addEventListener('click', () => { setupReport('away'); });

function setupReport(winnerRole) {
    pendingWinner = winnerRole;
    document.querySelectorAll('.report-buttons button').forEach(b => b.classList.add('hidden'));
    document.getElementById('stock-count-selector').classList.remove('hidden');
}

function reportConfirm(stocksRemaining) {
    applyGameResult(pendingWinner, stocksRemaining);
    sendData({ type: 'game_result', winner: pendingWinner, stocks: stocksRemaining });
}

function applyGameResult(winnerRole, winnerStocks) {
    crewState.previousWinner = winnerRole;
    const loserRole = (winnerRole === 'home') ? 'away' : 'home';

    // Handle Loser
    const loserP = crewState[loserRole].players[crewState[loserRole].currentIdx];
    crewState[loserRole].stocks -= loserP.stocks; 
    loserP.stocks = 0;
    crewState[loserRole].currentIdx++; 

    // Handle Winner
    const winnerP = crewState[winnerRole].players[crewState[winnerRole].currentIdx];
    const stockDiff = winnerP.stocks - winnerStocks; 
    crewState[winnerRole].stocks -= stockDiff;
    winnerP.stocks = winnerStocks; 

    // Check Win Condition
    if(crewState.home.stocks <= 0) {
        crewState.phase = 'gameover';
        endCrewBattle("AWAY TEAM", 'away');
    } else if (crewState.away.stocks <= 0) {
        crewState.phase = 'gameover';
        endCrewBattle("HOME TEAM", 'home');
    } else {
        crewState.matchNum++;
        crewState.phase = 'dashboard';
        updateScoreboardUI();
        showScreen('scoreboard');
        document.getElementById('action-text').textContent = "Previous game recorded. Ready for next stage?";
    }
}

function endCrewBattle(winnerName, winnerRole) {
    document.getElementById('winner-banner').textContent = winnerName + " WINS!";
    
    let homeTaken, awayTaken;
    if (winnerRole === 'home') {
        homeTaken = 12;
        awayTaken = 12 - crewState.home.stocks;
    } else {
        awayTaken = 12;
        homeTaken = 12 - crewState.away.stocks;
    }
    
    document.getElementById('final-score-display').textContent = `${homeTaken} - ${awayTaken}`;
    showScreen('gameover');
}

// --- 7. DATA HANDLING ---

function handleData(data) {
    switch(data.type) {
        case 'full_sync':
            // CLIENT RECEIVES FULL STATE FROM HOST
            crewState = data.crew;
            stageState = data.stage;
            restoreUI();
            break;
            
        case 'roster_submit':
            crewState[data.role].name = data.name;
            crewState[data.role].players = data.players;
            checkRosterReady();
            break;
            
        case 'start_stage_select':
