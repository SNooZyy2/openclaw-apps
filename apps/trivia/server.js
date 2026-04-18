// ─── Trivia Server — Entry Point ─────────────────────────────────────────────

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ─── Module imports ─────────────────────────────────────────────────────────────

const {
  PORT,
  BASE_URL,
  GEMINI_API_KEY,
  COST_PER_M_INPUT,
  COST_PER_M_OUTPUT,
  gameTokenUsage
} = require('./config');

const { STATES, rooms, getOrCreateRoom, getRoom, calculateScore } = require('./quiz/game');
const { verifyTelegramInitData } = require('./auth');
const { getHighscores } = require('./quiz/highscores');
const {
  sendBot,
  startBot,
  getLastResultsMessage,
  setLastResultsMessage,
  getBotToken,
  setDeps: setBotDeps
} = require('./bot');
const { setBotDeps: setGameBotDeps } = require('./quiz/game');

// ─── Wire up dependencies (avoid circular requires) ────────────────────────────

// bot needs getOrCreateRoom and getHighscores from game/highscores
setBotDeps({ getOrCreateRoom, getHighscores, readAtlasUsage });

// game needs sendBot / lastResultsMessage from bot
setGameBotDeps({
  sendBot,
  getLastResultsMessage,
  setLastResultsMessage,
  getBotToken,
  readAtlasUsage
});

// ─── Atlas Usage Helper ─────────────────────────────────────────────────────────

function readAtlasUsage() {
  const { execSync } = require('child_process');
  const raw = execSync('sudo cat /home/snoozyy/.openclaw/agents/main/sessions/sessions.json', { timeout: 3000 }).toString();
  const sessions = JSON.parse(raw);
  let totalInput = 0, totalOutput = 0, totalCost = 0, sessionCount = 0;
  for (const [key, session] of Object.entries(sessions)) {
    if (session.inputTokens) totalInput += session.inputTokens;
    if (session.outputTokens) totalOutput += session.outputTokens;
    // Use OpenClaw's own cost estimate — it accounts for thinking tokens
    if (session.estimatedCostUsd) totalCost += session.estimatedCostUsd;
    if (session.sessionId) sessionCount++;
  }
  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUsd: Math.round(totalCost * 100) / 100,
    sessions: sessionCount
  };
}

// ─── HTTP Server ────────────────────────────────────────────────────────────────

const indexHtml = fs.readFileSync(path.join(__dirname, 'web', 'index.html'), 'utf8');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers for Telegram WebView
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }

  // Serve static files (css, js)
  if (url.pathname === '/style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'web', 'style.css'), 'utf8'));
    return;
  }
  if (url.pathname === '/client.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'web', 'client.js'), 'utf8'));
    return;
  }

  // REST API: create room
  if (url.pathname === '/api/create-room' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { topic, questionCount } = JSON.parse(body || '{}');
        const room = getOrCreateRoom(topic, questionCount);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          roomCode: room.code,
          joinUrl: `${BASE_URL}/game?room=${room.code}`,
          status: room.state,
          players: room.playerList.length
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // REST API: room status
  const roomMatch = url.pathname.match(/^\/api\/room\/([a-f0-9]+)$/);
  if (roomMatch && req.method === 'GET') {
    const room = getRoom(roomMatch[1]);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      roomCode: room.code,
      status: room.state,
      topic: room.topic,
      players: room.playerList,
      currentQuestion: room.currentQuestion,
      totalQuestions: room.questions.length || room.questionCount
    }));
    return;
  }

  // REST API: results
  const resultsMatch = url.pathname.match(/^\/api\/results\/([a-f0-9]+)$/);
  if (resultsMatch && req.method === 'GET') {
    const room = getRoom(resultsMatch[1]);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }
    if (room.state !== STATES.GAME_OVER) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Game not finished yet', status: room.state }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      roomCode: room.code,
      topic: room.topic,
      standings: room.standings,
      summary: room.summary,
      totalQuestions: room.questions.length,
      duration: Date.now() - room.createdAt,
      highscores: getHighscores()
    }));
    return;
  }

  // REST API: Atlas usage stats (reads from OpenClaw sessions.json)
  if (url.pathname === '/api/atlas-usage' && req.method === 'GET') {
    try {
      const usage = readAtlasUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usage));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not read Atlas usage', detail: err.message }));
    }
    return;
  }

  // REST API: highscores
  if (url.pathname === '/api/highscores' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHighscores()));
    return;
  }

  // Serve game client
  if (url.pathname === '/' || url.pathname === '/game') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'web', 'index.html'), 'utf8'));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── WebSocket Server ───────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        const code = msg.roomCode;
        const room = getRoom(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }

        // Verify Telegram identity (initData if available, fall back to client-provided player data)
        let id, name, photo;
        if (msg.initData) {
          const isReconnect = room.players.has(
            (() => { try { const u = JSON.parse(new URLSearchParams(msg.initData).get('user') || '{}'); return String(u.id); } catch { return ''; } })()
          );
          try {
            const verified = verifyTelegramInitData(msg.initData, getBotToken(), { skipTtl: isReconnect });
            id = verified.id;
            name = [verified.firstName, verified.lastName].filter(Boolean).join(' ') || 'Player';
            photo = msg.photo || null;
          } catch (err) {
            console.log(`[room ${code}] initData verification failed: ${err.message}, falling back to client data`);
            id = String(msg.player?.id || `anon_${require('crypto').randomBytes(4).toString('hex')}`);
            name = msg.player?.name || 'Player';
            photo = msg.player?.photo || null;
          }
        } else {
          id = String(msg.player?.id || `anon_${require('crypto').randomBytes(4).toString('hex')}`);
          name = msg.player?.name || 'Player';
          photo = msg.player?.photo || null;
        }

        const result = room.addPlayer(id, name, photo, ws);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
          return;
        }

        playerId = id;
        roomCode = code;

        console.log(`[room ${code}] ${name} ${result.reconnected ? 'reconnected' : 'joined'} (${room.players.size} players)`);

        // Send current state to this player
        ws.send(JSON.stringify({
          type: 'joined',
          roomCode: code,
          you: id,
          name,
          creatorId: room.creatorId,
          players: room.playerList,
          lobbyExpiresAt: room.lobbyExpiresAt,
          startingAt: room.startCountdownTime || null
        }));

        if (result.reconnected && room.state !== STATES.LOBBY) {
          room.sendFullState(id);
        } else {
          // Notify others
          room.broadcast({ type: 'lobby_update', players: room.playerList, creatorId: room.creatorId, lobbyExpiresAt: room.lobbyExpiresAt, startingAt: room.startCountdownTime || null }, id);
        }
        break;
      }

      case 'ready': {
        if (!roomCode || !playerId) return;
        const room = getRoom(roomCode);
        if (!room) return;
        room.toggleReady(playerId);
        break;
      }

      case 'answer': {
        if (!roomCode || !playerId) return;
        const room = getRoom(roomCode);
        if (!room) return;
        const answerIndex = typeof msg.answerIndex === 'number' ? msg.answerIndex : -1;
        if (answerIndex < 0 || answerIndex > 3) return;
        room.submitAnswer(playerId, answerIndex, Date.now());
        break;
      }

      case 'leave': {
        if (!roomCode || !playerId) return;
        const room = getRoom(roomCode);
        if (!room) return;
        const player = room.players.get(playerId);
        if (!player) return;

        // Send personal game_over with their current standings + cost info
        const standings = room.standings;
        const myRank = standings.findIndex(s => s.id === playerId) + 1;

        // Include cost info
        const inputCost = (gameTokenUsage.inputTokens / 1_000_000) * COST_PER_M_INPUT;
        const outputCost = (gameTokenUsage.outputTokens / 1_000_000) * COST_PER_M_OUTPUT;
        const leaveCost = {
          inputTokens: gameTokenUsage.inputTokens,
          outputTokens: gameTokenUsage.outputTokens,
          totalTokens: gameTokenUsage.inputTokens + gameTokenUsage.outputTokens,
          apiCalls: gameTokenUsage.calls,
          costUsd: Math.round((inputCost + outputCost) * 10000) / 10000
        };
        let leaveAtlasUsage = null;
        try {
          const usage = readAtlasUsage();
          leaveAtlasUsage = { totalTokens: usage.totalTokens, estimatedCostUsd: usage.estimatedCostUsd };
        } catch {}

        ws.send(JSON.stringify({
          type: 'game_over',
          podium: standings.slice(0, 3),
          standings,
          summary: `You left the game. Your rank: #${myRank} with ${player.score} points.`,
          topic: room.topic,
          left: true,
          cost: leaveCost,
          atlasUsage: leaveAtlasUsage
        }));

        // Remove player entirely from the room
        room.players.delete(playerId);
        if (room.creatorId === playerId) {
          const next = [...room.players.values()].find(p => p.connected);
          room.creatorId = next?.id ?? null;
        }
        console.log(`[room ${roomCode}] ${player.name} left the game (${room.players.size} remaining)`);

        // If no players left and game was in progress, end it now
        if (room.players.size === 0 && room.state !== STATES.LOBBY && room.state !== STATES.GAME_OVER) {
          room.endGame();
        }

        // Broadcast updated player strip to remaining players
        room.broadcast({ type: 'player_left', playerId, players: room.playerList });

        playerId = null;
        roomCode = null;
        break;
      }
    }
  });

  ws.on('close', () => {
    if (roomCode && playerId) {
      const room = getRoom(roomCode);
      if (room) {
        room.removePlayer(playerId);
        console.log(`[room ${roomCode}] ${playerId} disconnected (${room.connectedCount} connected)`);
        if (room.state === STATES.LOBBY) {
          room.broadcast({ type: 'lobby_update', players: room.playerList, creatorId: room.creatorId });
        } else if (room.connectedCount === 0 && room.state !== STATES.GAME_OVER) {
          room.endGame();
        }
      }
    }
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────────

// Global error handlers — keep the server alive
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err?.message || err);
});

server.listen(PORT, () => {
  console.log(`[trivia] listening on :${PORT}`);
  console.log(`[trivia] base URL: ${BASE_URL}`);
  console.log(`[trivia] gemini: ${GEMINI_API_KEY ? 'configured' : 'NOT configured (fallback only)'}`);
  startBot();
});
