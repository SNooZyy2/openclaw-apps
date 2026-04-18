let ws = null, myId = null, roomCode = null, creatorId = null;
let currentScreen = 'lobby', timerInterval = null, pregameInterval = null, lobbyTimerInterval = null;
const exitTimers = new Map();
let reconnectAttempts = 0;
const MAX_RECONNECT = 3;
let previousStandings = {}; // 2.4: track previous scores for deltas
const AVATAR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e94560'];
let audioCtx = null, muted = localStorage.getItem('trivia_muted') === '1';
function playTone(freq, dur, type = 'sine', vol = 0.15) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
const sfx = {
  tick: (n) => playTone(600 + n * 80, 0.08, 'sine', 0.1),
  tap: () => playTone(800, 0.05, 'square', 0.08),
  correct: () => { playTone(523, 0.1); setTimeout(() => playTone(659, 0.15), 100); },
  wrong: () => playTone(200, 0.2, 'sawtooth', 0.1),
  fanfare: () => [262,330,392,523].forEach((f,i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.12), i*150))
};
const muteBtn = document.getElementById('muteBtn');
if (muteBtn) {
  muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  muteBtn.onclick = () => { muted = !muted; localStorage.setItem('trivia_muted', muted ? '1' : '0'); muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}'; };
}
document.querySelectorAll('.dot-grid').forEach(g => {
  for (let i = 0; i < 18; i++) { const d = document.createElement('div'); d.className = 'dot';
    d.style.cssText = `left:${Math.random()*95}%;top:${Math.random()*95}%;animation-delay:-${(Math.random()*25).toFixed(1)}s`; g.appendChild(d); }
});
const tg = window.Telegram?.WebApp;
let tgUser = null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tgUser = tg.initDataUnsafe?.user || null;
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
    const hf = tg.HapticFeedback;
    if (type === 'tap') hf.impactOccurred('light');
    else if (type === 'success') hf.notificationOccurred('success');
    else if (type === 'error') hf.notificationOccurred('error');
  } catch {}
}
function showScreen(id) {
  const prev = document.querySelector('.screen.active');
  const el = document.getElementById(id);
  if (!el) return;
  if (exitTimers.has(el)) {
    clearTimeout(exitTimers.get(el));
    exitTimers.delete(el);
    el.classList.remove('exiting');
  }
  if (prev && prev.id !== id) {
    prev.classList.add('exiting');
    const cleanup = () => { prev.classList.remove('active', 'exiting'); exitTimers.delete(prev); };
    prev.addEventListener('animationend', (e) => { if (e.target === prev && prev.classList.contains('exiting')) cleanup(); }, { once: true });
    exitTimers.set(prev, setTimeout(cleanup, 250));
  }
  el.classList.remove('exiting');
  el.classList.add('active');
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  currentScreen = id;
}
function getWsUrl() {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}
function connect() {
  const url = getWsUrl();
  ws = new WebSocket(url);
  const statusEl = document.getElementById('connStatus');
  ws.onopen = () => {
    statusEl.textContent = 'connected';
    statusEl.className = 'conn-status';
    reconnectAttempts = 0;
    const params = new URLSearchParams(location.search);
    roomCode = params.get('room') || tg?.initDataUnsafe?.start_param || null;
    if (!roomCode) {
      showScreen('error-screen');
      document.getElementById('errorMsg').textContent = 'No room code found. Use /quiz in the group chat.';
      return;
    }
    const joinMsg = { type: 'join', roomCode };
    if (tg?.initData) {
      joinMsg.initData = tg.initData;
      joinMsg.photo = tgUser?.photo_url || null;
    } else if (tgUser) {
      joinMsg.player = {
        id: tgUser.id,
        name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Player',
        photo: tgUser.photo_url || null
      };
    } else {
      joinMsg.player = { id: 'anon_' + Math.random().toString(36).slice(2, 8), name: 'Player' };
    }
    ws.send(JSON.stringify(joinMsg));
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };
  ws.onclose = () => {
    statusEl.textContent = 'disconnected';
    statusEl.className = 'conn-status disconnected';
    if (reconnectAttempts < MAX_RECONNECT) { reconnectAttempts++; setTimeout(connect, 2000); }
  };
  ws.onerror = () => {};
}
function send(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myId = msg.you; creatorId = msg.creatorId; roomCode = msg.roomCode;
      document.getElementById('roomCode').textContent = msg.roomCode.toUpperCase();
      updateLobby(msg.players, msg.lobbyExpiresAt, msg.startingAt); showScreen('lobby'); break;
    case 'lobby_update':
      creatorId = msg.creatorId; updateLobby(msg.players, msg.lobbyExpiresAt, msg.startingAt); break;
    case 'pregame':
      if (lobbyTimerInterval) { clearInterval(lobbyTimerInterval); lobbyTimerInterval = null; }
      document.getElementById('topicLabel').textContent = msg.topic;
      document.getElementById('qCountLabel').textContent = msg.questionCount + ' questions';
      showScreen('pregame'); startPregameCountdown(); break;
    case 'question': showQuestion(msg); break;
    case 'player_answered':
      markPlayerAnswered(msg.playerId, msg.answeredCount, msg.totalPlayers); break;
    case 'player_left':
      const pip = document.querySelector(`.ps-pip[data-pid="${msg.playerId}"]`);
      if (pip) pip.remove(); break;
    case 'answer_reveal': showReveal(msg); break;
    case 'leaderboard': showLeaderboard(msg); break;
    case 'game_over': showPodium(msg); break;
    case 'error':
      if (currentScreen === 'lobby' || !myId) {
        document.getElementById('errorMsg').textContent = msg.message;
        showScreen('error-screen');
      } break;
  }
}
let startCountdownInterval = null;
function updateLobby(players, lobbyExpiresAt, startingAt) {
  const list = document.getElementById('playerList');
  const count = document.getElementById('playerCount');
  const btn = document.getElementById('readyBtn');
  count.textContent = players.length + ' player' + (players.length !== 1 ? 's' : '');
  const readyCount = players.filter(p => p.ready).length;
  // 2.1: Horizontal wrapped avatar circles
  list.innerHTML = '<div class="avatar-grid">' + players.map((p, i) => {
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initial = (p.name || '?')[0].toUpperCase();
    const isYou = p.id == myId;
    return `<div class="avatar-circle${p.ready ? ' ready' : ''}" style="animation-delay: ${i * 0.06}s">
      <div class="av-ring${p.photo ? ' has-photo' : ''}" style="background: ${p.ready ? '#2ecc71' : color}; --ring-color: ${p.ready ? '#2ecc71' : color}">${avatarImg(p.photo, p.name, 'av-photo')}</div>
      <div class="av-name">${esc(p.name)}</div>
      ${isYou ? '<div class="you-badge">(you)</div>' : ''}
      ${p.ready ? '<div class="ready-badge">Ready</div>' : ''}
    </div>`;
  }).join('') + '</div>';
  // Update ready button state
  const me = players.find(p => p.id == myId);
  const imReady = me?.ready || false;
  btn.textContent = imReady ? 'Not Ready' : 'Ready!';
  btn.classList.toggle('ready-active', imReady);
  // Show ready count
  const readyLabel = document.getElementById('readyCount');
  if (readyLabel) {
    if (startingAt) {
      if (startCountdownInterval) clearInterval(startCountdownInterval);
      startCountdownInterval = setInterval(() => {
        const secs = Math.max(0, Math.ceil((startingAt - Date.now()) / 1000));
        readyLabel.textContent = `Starting in ${secs}...`;
        if (secs <= 0) { clearInterval(startCountdownInterval); startCountdownInterval = null; }
      }, 100);
    } else {
      if (startCountdownInterval) { clearInterval(startCountdownInterval); startCountdownInterval = null; }
      readyLabel.textContent = `${readyCount} / ${players.length} ready`;
    }
  }
  // Lobby expiry countdown
  const lobbyCountdown = document.getElementById('lobbyCountdown');
  if (lobbyCountdown && lobbyExpiresAt) {
    if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
    lobbyTimerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lobbyExpiresAt - Date.now()) / 1000));
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      lobbyCountdown.textContent = `Lobby closes in ${min}:${String(sec).padStart(2, '0')}`;
      if (remaining <= 0) {
        clearInterval(lobbyTimerInterval);
        lobbyTimerInterval = null;
      }
    }, 1000);
  }
}
// 2.2: Room code copy badge
document.getElementById('roomCode').addEventListener('click', function () {
  const code = this.textContent.trim();
  if (!code || code === '------') return;
  navigator.clipboard.writeText(code).catch(() => {});
  haptic('tap');
  const flash = document.createElement('span');
  flash.className = 'copied-flash';
  flash.textContent = 'Copied!';
  this.appendChild(flash);
  setTimeout(() => flash.remove(), 1200);
});
document.getElementById('readyBtn').addEventListener('click', () => {
  send({ type: 'ready' });
  haptic('tap'); sfx.tap();
});
function startPregameCountdown() {
  let count = 3;
  const el = document.getElementById('pregameCountdown');
  el.textContent = count;
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  if (pregameInterval) clearInterval(pregameInterval);
  pregameInterval = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
    } else if (count === 0) {
      el.textContent = 'GO!';
      el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
      clearInterval(pregameInterval);
    }
  }, 1000);
}
let questionStartTime = 0, answered = false, currentOptions = [];
function showQuestion(msg) {
  answered = msg.alreadyAnswered || false;
  questionStartTime = Date.now();
  showScreen('question-screen');
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
      btn.addEventListener('click', (e) => selectAnswer(btn, parseInt(btn.dataset.index), msg.timeLimit, e));
    });
  }
  startTimer(msg.timeLimit);
}
function addRipple(e, btn) {
  const rect = btn.getBoundingClientRect();
  const x = (e.clientX || rect.left + rect.width / 2) - rect.left;
  const y = (e.clientY || rect.top + rect.height / 2) - rect.top;
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.left = x + 'px'; span.style.top = y + 'px';
  btn.appendChild(span);
  span.addEventListener('animationend', () => span.remove(), { once: true });
}
function selectAnswer(btn, index, timeLimit, e) {
  if (answered) return;
  answered = true;
  haptic('tap'); sfx.tap();
  if (e) addRipple(e, btn);
  btn.classList.add('selected');
  document.querySelectorAll('.option-btn').forEach(b => b.classList.add('locked'));
  send({ type: 'answer', answerIndex: index, timestamp: Date.now() });
}
function buildPlayerStrip(players) {
  const strip = document.getElementById('playerStrip');
  if (!players.length || players.length < 2) { strip.innerHTML = ''; return; }
  strip.innerHTML = players.map(p => {
    const isYou = p.id == myId;
    return `<div class="ps-pip${isYou ? ' is-you' : ''}${p.photo ? ' has-photo' : ''}" data-pid="${p.id}" title="${esc(p.name)}">${avatarImg(p.photo, p.name, 'pip-photo')}</div>`;
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
  const cdOverlay = document.getElementById('countdownOverlay');
  const start = Date.now();
  let lastSec = -1;
  bar.style.transition = 'none'; bar.style.width = '100%'; bar.className = 'timer-bar ok';
  if (cdOverlay) { cdOverlay.textContent = Math.ceil(duration / 1000); cdOverlay.className = 'countdown-overlay'; }
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 1 - (elapsed / duration));
    bar.style.width = (pct * 100) + '%';
    if (pct < 0.2) { bar.classList.remove('ok', 'warn'); bar.classList.add('critical'); }
    else if (pct < 0.5) { bar.classList.remove('ok', 'critical'); bar.classList.add('warn'); }
    const secsLeft = Math.ceil((duration - elapsed) / 1000);
    if (cdOverlay && secsLeft !== lastSec && secsLeft >= 0) {
      lastSec = secsLeft; cdOverlay.textContent = secsLeft || '';
      cdOverlay.className = secsLeft <= 5 ? 'countdown-overlay pulse-red' : 'countdown-overlay';
      if (secsLeft <= 5 && secsLeft > 0) sfx.tick(5 - secsLeft);
    }
    if (elapsed >= duration) clearInterval(timerInterval);
  }, 50);
}
function flashTension() {
  const overlay = document.createElement('div');
  overlay.className = 'tension-flash';
  document.body.appendChild(overlay);
  overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 500);
}
function showReveal(msg) {
  if (timerInterval) clearInterval(timerInterval);
  flashTension();
  showScreen('reveal');
  const myResult = msg.playerResults.find(p => p.id == myId) || {};
  document.getElementById('revealQuestion').textContent = msg.playerResults.length > 0
    ? document.getElementById('qText')?.textContent || '' : '';
  // 2.3: scoreFloat animation via CSS
  const popup = document.getElementById('scorePopup');
  popup.textContent = myResult.correct ? `+${myResult.points}` : '0';
  popup.className = myResult.correct ? 'score-popup' : 'score-popup zero';
  if (myResult.correct) { haptic('success'); sfx.correct(); } else { haptic('error'); sfx.wrong(); }
  // 2.3: Streak with escalating warmth
  const streakEl = document.getElementById('streakText');
  streakEl.className = 'streak-text';
  if (myResult.streak >= 5) {
    streakEl.textContent = `${myResult.streak} in a row! \uD83D\uDD25`;
    streakEl.classList.add('streak-fire');
  } else if (myResult.streak >= 4) {
    streakEl.textContent = `${myResult.streak} in a row!`;
    streakEl.classList.add('streak-hot');
  } else if (myResult.streak >= 2) {
    streakEl.textContent = `${myResult.streak} in a row!`;
    streakEl.classList.add('streak-warm');
  } else {
    streakEl.textContent = '';
  }
  // 2.3: Options — correct gets green glow pulse via CSS correctGlow
  const revealOpts = document.getElementById('revealOptions');
  revealOpts.innerHTML = currentOptions.map((opt, i) => {
    const isCorrect = i === msg.correctIndex;
    const isMyAnswer = i === myResult.answerIndex;
    let cls = 'reveal-opt ';
    if (isCorrect) cls += 'correct-opt';
    else if (isMyAnswer && !myResult.correct) cls += 'your-wrong';
    else cls += 'wrong-opt';
    return `<div class="${cls}">
      <span class="indicator">${isCorrect ? '\u2713' : isMyAnswer ? '\u2717' : ''}</span>
      <span>${esc(opt)}</span>
    </div>`;
  }).join('');
  document.getElementById('funFact').textContent = msg.funFact || '';
  document.getElementById('commentaryText').textContent = msg.commentary || '';
  document.getElementById('commentaryText').style.display = msg.commentary ? '' : 'none';
}
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
    const prevScore = previousStandings[p.id] || 0;
    const delta = p.score - prevScore;
    const deltaHtml = delta > 0 ? `<span class="score-delta">+${delta.toLocaleString()}</span>` : '';
    return `<div class="${cls}" style="animation-delay: ${i * 0.05}s">
      <div class="standing-rank">${i + 1}</div>
      <div class="standing-name">${esc(p.name)}</div>
      <div><div class="standing-score">${p.score}${deltaHtml}</div><div class="standing-correct">${p.correct} correct</div></div>
    </div>`;
  }).join('');
  // Fade out deltas after 2s
  setTimeout(() => {
    list.querySelectorAll('.score-delta').forEach(el => el.classList.add('fade-out'));
  }, 2000);
  // Store for next round
  previousStandings = {};
  msg.standings.forEach(p => { previousStandings[p.id] = p.score; });
}
function showPodium(msg) {
  showScreen('podium');
  document.getElementById('podiumTopic').textContent = msg.topic;
  const ordered = [];
  if (msg.podium.length >= 2) ordered.push({ ...msg.podium[1], place: 2 });
  if (msg.podium.length >= 1) ordered.push({ ...msg.podium[0], place: 1 });
  if (msg.podium.length >= 3) ordered.push({ ...msg.podium[2], place: 3 });
  const display = document.getElementById('podiumDisplay');
  display.innerHTML = ordered.map(p => `
    <div class="podium-place p${p.place}">
      <div class="podium-avatar${p.photo ? ' has-photo' : ''}">${avatarImg(p.photo, p.name, 'podium-photo')}</div>
      <div class="podium-name">${esc(p.name)}</div>
      <div class="podium-score" data-target="${p.score}">0 pts</div>
      <div class="podium-bar">${p.place === 1 ? '1st' : p.place === 2 ? '2nd' : '3rd'}</div>
    </div>
  `).join('');
  // 2.5: Score count-up (40ms steps over ~1.5s)
  display.querySelectorAll('.podium-score[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target) || 0;
    if (target === 0) { el.textContent = '0 pts'; return; }
    let current = 0;
    const steps = Math.ceil(1500 / 40);
    const increment = target / steps;
    const iv = setInterval(() => {
      current += increment;
      if (current >= target) { current = target; clearInterval(iv); }
      el.textContent = Math.round(current) + ' pts';
    }, 40);
  });
  const myStanding = msg.standings.find(s => s.id == myId);
  const rankEl = document.getElementById('yourRank');
  if (myStanding && myStanding.rank > 3) {
    rankEl.textContent = `Your rank: #${myStanding.rank} (${myStanding.score} pts)`;
  } else { rankEl.textContent = ''; }
  document.getElementById('summaryText').textContent = msg.summary || '';
  const costEl = document.getElementById('costLine');
  let costText = '';
  if (msg.cost && msg.cost.totalTokens > 0) {
    const costEur = msg.cost.costUsd * 0.92;
    const cost = costEur < 0.01 ? '< €0.01' : `~€${costEur.toFixed(3)}`;
    const tokens = msg.cost.totalTokens > 1_000_000
      ? (msg.cost.totalTokens / 1_000_000).toFixed(1) + 'M'
      : msg.cost.totalTokens.toLocaleString();
    costText = `This game: ${tokens} tokens (${cost})`;
  }
  if (msg.atlasUsage) {
    const total = msg.atlasUsage.totalTokens > 1_000_000
      ? (msg.atlasUsage.totalTokens / 1_000_000).toFixed(1) + 'M'
      : Math.round(msg.atlasUsage.totalTokens / 1000) + 'K';
    const costEur = (msg.atlasUsage.estimatedCostUsd || 0) * 0.92;
    costText += costText ? '\n' : '';
    costText += `Atlas total: ${total} tokens (~€${costEur.toFixed(2)})`;
  }
  costEl.textContent = costText;
  spawnConfetti();
  sfx.fanfare();
}
function closeGame() {
  if (ws) try { ws.close(); } catch {}
  if (tg) try { tg.close(); } catch {}
}
document.getElementById('closeBtn').addEventListener('click', closeGame);
document.getElementById('errorCloseBtn').addEventListener('click', closeGame);
function confirmLeave() {
  if (confirm('Leave the game?')) send({ type: 'leave' });
}
document.getElementById('leaveBtn').addEventListener('click', confirmLeave);
function spawnConfetti() {
  const c = document.createElement('div');
  c.className = 'confetti-container';
  document.body.appendChild(c);
  const cols = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#e94560'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const s = Math.random() * 8 + 6;
    const drift = (Math.random() - 0.5) * 120;
    const opacity = (0.6 + Math.random() * 0.4).toFixed(2);
    Object.assign(p.style, {
      left: Math.random()*100+'%',
      background: cols[Math.floor(Math.random()*cols.length)],
      width: s+'px', height: s+'px',
      borderRadius: Math.random() > 0.4 ? '50%' : '2px',
      animationDuration: (Math.random()*2+2)+'s',
      animationDelay: (Math.random()*1.5)+'s'
    });
    p.style.setProperty('--drift', drift + 'px');
    p.style.setProperty('--c-opacity', opacity);
    c.appendChild(p);
  }
  setTimeout(() => c.remove(), 5000);
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
function avatarImg(photo, name, cls) {
  const initial = (name || '?')[0].toUpperCase();
  if (!photo) return initial;
  return `<img src="${esc(photo)}" class="${cls}" alt="${esc(name)}" data-initial="${esc(initial)}" onerror="avatarFallback(this)">`;
}
function avatarFallback(img) {
  img.parentElement.classList.remove('has-photo');
  img.replaceWith(document.createTextNode(img.dataset.initial || '?'));
}
const logoSvg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e94560" stop-opacity="0.4"/><stop offset="70%" stop-color="#e94560" stop-opacity="0.1"/><stop offset="100%" stop-color="#e94560" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter><filter id="glow-f"><feGaussianBlur stdDeviation="3"/></filter></defs><circle cx="100" cy="100" r="95" fill="url(#glow)"/><g stroke="#e94560" stroke-opacity="0.2" stroke-width="0.5" fill="none"><line x1="20" y1="40" x2="60" y2="40"/><line x1="60" y1="40" x2="60" y2="20"/><line x1="140" y1="30" x2="170" y2="30"/><line x1="170" y1="30" x2="170" y2="55"/><line x1="30" y1="150" x2="50" y2="150"/><line x1="50" y1="150" x2="50" y2="175"/><line x1="150" y1="160" x2="175" y2="160"/><line x1="175" y1="160" x2="175" y2="140"/><line x1="15" y1="90" x2="35" y2="90"/><line x1="165" y1="110" x2="185" y2="110"/><circle cx="60" cy="20" r="2" fill="#e94560" fill-opacity="0.3"/><circle cx="170" cy="55" r="2" fill="#e94560" fill-opacity="0.3"/><circle cx="50" cy="175" r="2" fill="#e94560" fill-opacity="0.3"/><circle cx="175" cy="140" r="2" fill="#e94560" fill-opacity="0.3"/></g><circle cx="100" cy="100" r="78" fill="none" stroke="#e94560" stroke-width="2" stroke-opacity="0.5" filter="url(#blur)"/><circle cx="100" cy="100" r="78" fill="none" stroke="#e94560" stroke-width="1.5" stroke-opacity="0.8"/><circle cx="100" cy="100" r="62" fill="none" stroke="#e94560" stroke-width="1" stroke-opacity="0.3"/><circle cx="100" cy="100" r="70" fill="none" stroke="#ff6b6b" stroke-width="3" stroke-opacity="0.15" filter="url(#glow-f)"/><circle cx="100" cy="22" r="2.5" fill="#e94560" opacity="0.7"/><circle cx="178" cy="100" r="2.5" fill="#e94560" opacity="0.7"/><circle cx="100" cy="178" r="2.5" fill="#e94560" opacity="0.7"/><circle cx="22" cy="100" r="2.5" fill="#e94560" opacity="0.7"/><text x="100" y="93" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="26" font-weight="700" fill="#eee" letter-spacing="4">ATLAS</text><text x="100" y="118" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="16" font-weight="400" fill="#e94560" letter-spacing="6">QUIZ</text></svg>`;
document.getElementById('gameLogo').innerHTML = logoSvg;
document.getElementById('podiumLogo').innerHTML = logoSvg;
connect();
