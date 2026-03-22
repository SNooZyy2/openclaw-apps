// ─── State ──────────────────────────────────────────────────────────────────────

let ws = null;
let myId = null;
let roomCode = null;
let creatorId = null;
let currentScreen = 'lobby';
let timerInterval = null;
let pregameInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

// ─── Telegram Web App ───────────────────────────────────────────────────────────

const tg = window.Telegram?.WebApp;
let tgUser = null;

if (tg) {
  try {
    tg.ready();
    tg.expand();
    tgUser = tg.initDataUnsafe?.user || null;

    // Apply theme
    if (tg.themeParams) {
      const t = tg.themeParams;
      if (t.bg_color) document.documentElement.style.setProperty('--bg', t.bg_color);
      if (t.secondary_bg_color) document.documentElement.style.setProperty('--bg-card', t.secondary_bg_color);
      if (t.text_color) document.documentElement.style.setProperty('--text', t.text_color);
      if (t.hint_color) document.documentElement.style.setProperty('--text-dim', t.hint_color);
      if (t.button_color) document.documentElement.style.setProperty('--accent', t.button_color);
    }
  } catch {}
}

function haptic(type) {
  try {
    if (!tg?.HapticFeedback) return;
    if (type === 'tap') tg.HapticFeedback.impactOccurred('light');
    else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
  } catch {}
}

// ─── Screen management ──────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    currentScreen = id;
  }
}

// ─── WebSocket ──────────────────────────────────────────────────────────────────

function getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

function connect() {
  const url = getWsUrl();
  ws = new WebSocket(url);
  const statusEl = document.getElementById('connStatus');

  ws.onopen = () => {
    statusEl.textContent = 'connected';
    statusEl.className = 'conn-status';
    reconnectAttempts = 0;

    // Get room code from URL
    const params = new URLSearchParams(location.search);
    roomCode = params.get('room');

    if (!roomCode) {
      showScreen('error-screen');
      document.getElementById('errorMsg').textContent = 'No room code in URL. Join via the Telegram button.';
      return;
    }

    // Build player identity (persist browser ID for reconnection)
    const player = {};
    if (tgUser) {
      player.id = tgUser.id;
      player.name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Player';
      player.photo = tgUser.photo_url || null;
      // Hide name input — we have Telegram identity
      document.getElementById('nameInputWrap').classList.add('hidden');
    } else {
      let browserId = sessionStorage.getItem('trivia_player_id');
      let browserName = sessionStorage.getItem('trivia_player_name');
      if (!browserId) {
        browserId = 'browser_' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('trivia_player_id', browserId);
      }
      // Use saved name or leave blank for input
      browserName = browserName || sessionStorage.getItem('trivia_player_name') || '';
      player.id = browserId;
      player.name = browserName || 'Player';

      // Pre-fill input with saved name
      const nameInput = document.getElementById('nameInput');
      if (browserName) nameInput.value = browserName;
      nameInput.addEventListener('change', () => {
        const newName = nameInput.value.trim();
        if (newName) {
          sessionStorage.setItem('trivia_player_name', newName);
          send({ type: 'rename', name: newName });
        }
      });
    }

    ws.send(JSON.stringify({ type: 'join', roomCode, player }));
  };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    statusEl.textContent = 'disconnected';
    statusEl.className = 'conn-status disconnected';
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      setTimeout(connect, 2000);
    }
  };

  ws.onerror = () => {};
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ─── Message handler ────────────────────────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myId = msg.you;
      creatorId = msg.creatorId;
      roomCode = msg.roomCode;
      document.getElementById('roomCode').textContent = msg.roomCode.toUpperCase();
      updateLobby(msg.players);
      showScreen('lobby');
      break;

    case 'lobby_update':
      creatorId = msg.creatorId;
      updateLobby(msg.players);
      break;

    case 'pregame':
      document.getElementById('topicLabel').textContent = msg.topic;
      document.getElementById('qCountLabel').textContent = msg.questionCount + ' questions';
      showScreen('pregame');
      startPregameCountdown();
      break;

    case 'question':
      showQuestion(msg);
      break;

    case 'player_answered':
      markPlayerAnswered(msg.playerId, msg.answeredCount, msg.totalPlayers);
      break;

    case 'player_left':
      // Remove their pip from the strip
      const pip = document.querySelector(`.ps-pip[data-pid="${msg.playerId}"]`);
      if (pip) pip.remove();
      break;

    case 'answer_reveal':
      showReveal(msg);
      break;

    case 'leaderboard':
      showLeaderboard(msg);
      break;

    case 'game_over':
      showPodium(msg);
      break;

    case 'error':
      if (currentScreen === 'lobby' || !myId) {
        document.getElementById('errorMsg').textContent = msg.message;
        showScreen('error-screen');
      }
      break;
  }
}

// ─── Lobby ──────────────────────────────────────────────────────────────────────

function updateLobby(players) {
  const list = document.getElementById('playerList');
  const count = document.getElementById('playerCount');
  const btn = document.getElementById('startBtn');

  count.textContent = players.length + ' player' + (players.length !== 1 ? 's' : '');

  list.innerHTML = players.map((p, i) => `
    <div class="player-item" style="animation-delay: ${i * 0.05}s">
      <div class="avatar">${(p.name || '?')[0].toUpperCase()}</div>
      <div class="name">${esc(p.name)}${p.id == myId ? ' <span class="you-badge">(you)</span>' : ''}</div>
    </div>
  `).join('');

  if (myId == creatorId) {
    btn.textContent = 'Start Game';
    btn.disabled = players.length < 1;
    btn.style.display = '';
  } else {
    btn.textContent = 'Waiting for host to start...';
    btn.disabled = true;
    btn.style.display = '';
  }
}

document.getElementById('startBtn').addEventListener('click', () => {
  send({ type: 'start_game' });
  document.getElementById('startBtn').disabled = true;
});

// ─── Pregame countdown ──────────────────────────────────────────────────────────

function startPregameCountdown() {
  let count = 3;
  const el = document.getElementById('pregameCountdown');
  el.textContent = count;
  if (pregameInterval) clearInterval(pregameInterval);
  pregameInterval = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = '';
    } else {
      clearInterval(pregameInterval);
    }
  }, 1000);
}

// ─── Question ───────────────────────────────────────────────────────────────────

let questionStartTime = 0;
let answered = false;
let currentOptions = []; // store options so reveal screen doesn't depend on DOM

function showQuestion(msg) {
  answered = msg.alreadyAnswered || false;
  questionStartTime = Date.now();
  showScreen('question-screen');

  // Build player strip (opponents + you)
  buildPlayerStrip(msg.players || []);

  document.getElementById('qCounter').textContent = `${msg.index + 1} / ${msg.total}`;
  document.getElementById('qText').textContent = msg.question;
  currentOptions = msg.options;

  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = msg.options.map((opt, i) => `
    <button class="option-btn${answered ? ' locked' : ''}" data-index="${i}">${esc(opt)}</button>
  `).join('');

  if (!answered) {
    grid.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => selectAnswer(btn, parseInt(btn.dataset.index), msg.timeLimit));
    });
  }

  startTimer(msg.timeLimit);
}

function selectAnswer(btn, index, timeLimit) {
  if (answered) return;
  answered = true;
  haptic('tap');

  btn.classList.add('selected');
  document.querySelectorAll('.option-btn').forEach(b => b.classList.add('locked'));

  send({ type: 'answer', answerIndex: index, timestamp: Date.now() });
}

// ─── Player strip (live opponent status) ────────────────────────────────────────

function buildPlayerStrip(players) {
  const strip = document.getElementById('playerStrip');
  if (!players.length || players.length < 2) { strip.innerHTML = ''; return; }

  strip.innerHTML = players.map(p => {
    const initial = (p.name || '?')[0].toUpperCase();
    const isYou = p.id == myId;
    return `<div class="ps-pip${isYou ? ' is-you' : ''}" data-pid="${p.id}" title="${esc(p.name)}">${initial}</div>`;
  }).join('') + `<span class="ps-counter" id="answerCounter">0/${players.length}</span>`;
}

function markPlayerAnswered(playerId, answeredCount, totalPlayers) {
  const pip = document.querySelector(`.ps-pip[data-pid="${playerId}"]`);
  if (pip) pip.classList.add('answered');
  const counter = document.getElementById('answerCounter');
  if (counter) counter.textContent = `${answeredCount}/${totalPlayers}`;
}

function startTimer(duration) {
  if (timerInterval) clearInterval(timerInterval);
  const bar = document.getElementById('timerBar');
  const start = Date.now();

  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.className = 'timer-bar ok';

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 1 - (elapsed / duration));
    bar.style.width = (pct * 100) + '%';
    if (pct < 0.2) { bar.classList.remove('ok', 'warn'); bar.classList.add('critical'); }
    else if (pct < 0.5) { bar.classList.remove('ok', 'critical'); bar.classList.add('warn'); }
    if (elapsed >= duration) clearInterval(timerInterval);
  }, 50);
}

// ─── Reveal ─────────────────────────────────────────────────────────────────────

function showReveal(msg) {
  if (timerInterval) clearInterval(timerInterval);
  showScreen('reveal');

  const myResult = msg.playerResults.find(p => p.id == myId) || {};

  document.getElementById('revealQuestion').textContent = msg.playerResults.length > 0
    ? document.getElementById('qText')?.textContent || '' : '';

  const popup = document.getElementById('scorePopup');
  popup.textContent = myResult.correct ? `+${myResult.points}` : '0';
  popup.className = myResult.correct ? 'score-popup' : 'score-popup zero';

  if (myResult.correct) haptic('success'); else haptic('error');

  const streakEl = document.getElementById('streakText');
  streakEl.textContent = myResult.streak > 1 ? `${myResult.streak} in a row!` : '';

  // Options display
  const revealOpts = document.getElementById('revealOptions');
  revealOpts.innerHTML = currentOptions.map((opt, i) => {
    const isCorrect = i === msg.correctIndex;
    const isMyAnswer = i === myResult.answerIndex;
    let cls = 'reveal-opt ';
    if (isCorrect) cls += 'correct-opt';
    else if (isMyAnswer && !myResult.correct) cls += 'your-wrong';
    else cls += 'wrong-opt';
    return `<div class="${cls}">
      <span class="indicator">${isCorrect ? '✓' : isMyAnswer ? '✗' : ''}</span>
      <span>${esc(opt)}</span>
    </div>`;
  }).join('');

  document.getElementById('funFact').textContent = msg.funFact || '';
  document.getElementById('commentaryText').textContent = msg.commentary || '';
  document.getElementById('commentaryText').style.display = msg.commentary ? '' : 'none';
}

// ─── Leaderboard ────────────────────────────────────────────────────────────────

function showLeaderboard(msg) {
  showScreen('leaderboard-screen');

  document.getElementById('lbTitle').textContent = 'Leaderboard';
  document.getElementById('lbSubtitle').textContent = `After question ${msg.questionIndex + 1} of ${msg.totalQuestions}`;

  const list = document.getElementById('standingsList');
  list.innerHTML = msg.standings.map((p, i) => {
    let cls = 'standing-item';
    if (i === 0) cls += ' top1';
    else if (i === 1) cls += ' top2';
    else if (i === 2) cls += ' top3';
    if (p.id == myId) cls += ' you';
    return `<div class="${cls}" style="animation-delay: ${i * 0.05}s">
      <div class="standing-rank">${i + 1}</div>
      <div class="standing-name">${esc(p.name)}</div>
      <div><div class="standing-score">${p.score}</div><div class="standing-correct">${p.correct} correct</div></div>
    </div>`;
  }).join('');
}

// ─── Podium ─────────────────────────────────────────────────────────────────────

function showPodium(msg) {
  showScreen('podium');

  document.getElementById('podiumTopic').textContent = msg.topic;

  // Arrange: 2nd, 1st, 3rd (handle <3 players)
  const ordered = [];
  if (msg.podium.length >= 2) ordered.push({ ...msg.podium[1], place: 2 });
  if (msg.podium.length >= 1) ordered.push({ ...msg.podium[0], place: 1 });
  if (msg.podium.length >= 3) ordered.push({ ...msg.podium[2], place: 3 });

  const display = document.getElementById('podiumDisplay');
  display.innerHTML = ordered.map(p => `
    <div class="podium-place p${p.place}">
      <div class="podium-avatar">${(p.name || '?')[0].toUpperCase()}</div>
      <div class="podium-name">${esc(p.name)}</div>
      <div class="podium-score">${p.score} pts</div>
      <div class="podium-bar">${p.place === 1 ? '1st' : p.place === 2 ? '2nd' : '3rd'}</div>
    </div>
  `).join('');

  // Your rank if not on podium
  const myStanding = msg.standings.find(s => s.id == myId);
  const rankEl = document.getElementById('yourRank');
  if (myStanding && myStanding.rank > 3) {
    rankEl.textContent = `Your rank: #${myStanding.rank} (${myStanding.score} pts)`;
  } else {
    rankEl.textContent = '';
  }

  document.getElementById('summaryText').textContent = msg.summary || '';

  // Show cost
  const costEl = document.getElementById('costLine');
  let costText = '';
  if (msg.cost && msg.cost.totalTokens > 0) {
    const cost = msg.cost.costUsd < 0.01 ? '< $0.01' : `~$${msg.cost.costUsd.toFixed(3)}`;
    costText = `This game: ${msg.cost.totalTokens.toLocaleString()} tokens (${cost})`;
  }
  if (msg.atlasUsage) {
    const total = msg.atlasUsage.totalTokens > 1_000_000
      ? (msg.atlasUsage.totalTokens / 1_000_000).toFixed(1) + 'M'
      : Math.round(msg.atlasUsage.totalTokens / 1000) + 'K';
    costText += costText ? '\n' : '';
    costText += `Atlas total: ${total} tokens (~$${msg.atlasUsage.estimatedCostUsd.toFixed(2)})`;
  }
  costEl.textContent = costText;

  // Confetti
  spawnConfetti();
}

function closeGame() {
  if (ws) try { ws.close(); } catch {}
  if (tg) {
    try { tg.close(); } catch {}
  }
  // Fallback: if tg.close() didn't work (e.g. opened as URL not WebApp), go back
  try { window.close(); } catch {}
  // Last resort: navigate away so user isn't stuck
  setTimeout(() => { window.location.href = 'about:blank'; }, 300);
}

document.getElementById('closeBtn').addEventListener('click', closeGame);
document.getElementById('errorCloseBtn').addEventListener('click', closeGame);

document.getElementById('leaveBtn').addEventListener('click', () => {
  send({ type: 'leave' });
  // The server will respond with a personal game_over
});

// ─── Confetti ───────────────────────────────────────────────────────────────────

function spawnConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e94560'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 8 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 5000);
}

// ─── Utils ──────────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ─── Logo ───────────────────────────────────────────────────────────────────────

const logoSvg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e94560" stop-opacity="0.4"/>
      <stop offset="70%" stop-color="#e94560" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#e94560" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="glow-f"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <circle cx="100" cy="100" r="95" fill="url(#glow)"/>
  <g stroke="#e94560" stroke-opacity="0.2" stroke-width="0.5" fill="none">
    <line x1="20" y1="40" x2="60" y2="40"/><line x1="60" y1="40" x2="60" y2="20"/>
    <line x1="140" y1="30" x2="170" y2="30"/><line x1="170" y1="30" x2="170" y2="55"/>
    <line x1="30" y1="150" x2="50" y2="150"/><line x1="50" y1="150" x2="50" y2="175"/>
    <line x1="150" y1="160" x2="175" y2="160"/><line x1="175" y1="160" x2="175" y2="140"/>
    <line x1="15" y1="90" x2="35" y2="90"/><line x1="165" y1="110" x2="185" y2="110"/>
    <circle cx="60" cy="20" r="2" fill="#e94560" fill-opacity="0.3"/>
    <circle cx="170" cy="55" r="2" fill="#e94560" fill-opacity="0.3"/>
    <circle cx="50" cy="175" r="2" fill="#e94560" fill-opacity="0.3"/>
    <circle cx="175" cy="140" r="2" fill="#e94560" fill-opacity="0.3"/>
  </g>
  <circle cx="100" cy="100" r="78" fill="none" stroke="#e94560" stroke-width="2" stroke-opacity="0.5" filter="url(#blur)"/>
  <circle cx="100" cy="100" r="78" fill="none" stroke="#e94560" stroke-width="1.5" stroke-opacity="0.8"/>
  <circle cx="100" cy="100" r="62" fill="none" stroke="#e94560" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="#ff6b6b" stroke-width="3" stroke-opacity="0.15" filter="url(#glow-f)"/>
  <circle cx="100" cy="22" r="2.5" fill="#e94560" opacity="0.7"/>
  <circle cx="178" cy="100" r="2.5" fill="#e94560" opacity="0.7"/>
  <circle cx="100" cy="178" r="2.5" fill="#e94560" opacity="0.7"/>
  <circle cx="22" cy="100" r="2.5" fill="#e94560" opacity="0.7"/>
  <text x="100" y="93" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="26" font-weight="700" fill="#eee" letter-spacing="4">ATLAS</text>
  <text x="100" y="118" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="16" font-weight="400" fill="#e94560" letter-spacing="6">QUIZ</text>
</svg>`;
document.getElementById('gameLogo').innerHTML = logoSvg;
document.getElementById('podiumLogo').innerHTML = logoSvg;

// ─── Init ───────────────────────────────────────────────────────────────────────

connect();
