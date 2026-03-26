// ─── Room & Game State ──────────────────────────────────────────────────────────

const crypto = require('crypto');
const {
  PREGAME_DURATION,
  QUESTION_TIME_LIMIT,
  REVEAL_DURATION,
  LEADERBOARD_DURATION,
  ROOM_CLEANUP_AFTER_GAME,
  ROOM_CLEANUP_EMPTY,
  SCORE_BASE,
  SCORE_SPEED_MAX,
  SCORE_STREAK_BONUS,
  SCORE_STREAK_CAP,
  MAX_PLAYERS,
  MAX_QUESTIONS,
  DEFAULT_QUESTION_COUNT,
  COST_PER_M_INPUT,
  COST_PER_M_OUTPUT,
  COST_PER_M_THINKING,
  gameTokenUsage
} = require('./config');
const {
  generateQuestions,
  getFallbackQuestions,
  generateCommentary,
  getTemplateCommentary,
  generateSummary
} = require('./gemini');
const { recordGame, getHighscores } = require('./highscores');

// ─── Scoring ────────────────────────────────────────────────────────────────────

function calculateScore(correct, responseTime, timeLimit, streak) {
  if (!correct) return { points: 0, breakdown: { base: 0, speed: 0, streak: 0 } };

  const base = SCORE_BASE;
  const speedFraction = Math.max(0, 1 - (responseTime / timeLimit));
  const speed = Math.round(SCORE_SPEED_MAX * speedFraction);
  const streakBonus = Math.min(streak * SCORE_STREAK_BONUS, SCORE_STREAK_CAP);

  return {
    points: base + speed + streakBonus,
    breakdown: { base, speed, streak: streakBonus }
  };
}

// ─── States ─────────────────────────────────────────────────────────────────────

const STATES = {
  LOBBY: 'LOBBY',
  PREGAME: 'PREGAME',
  QUESTION: 'QUESTION',
  ANSWER_REVEAL: 'ANSWER_REVEAL',
  LEADERBOARD: 'LEADERBOARD',
  GAME_OVER: 'GAME_OVER'
};

function makeRoomCode() {
  return crypto.randomBytes(3).toString('hex');
}

// ─── Player ─────────────────────────────────────────────────────────────────────

class Player {
  constructor(id, name, photo) {
    this.id = id;
    this.name = name || `Player ${id}`;
    this.photo = photo || null;
    this.score = 0;
    this.streak = 0;
    this.correct = 0;
    this.totalSpeedBonus = 0;
    this.answers = [];  // per-question: { answerIndex, timestamp, correct, points }
    this.ws = null;
    this.connected = true;
    this.ready = false;
  }
}

// ─── Dependency injection for quiz-bot integration ──────────────────────────────
// Set by server.js to avoid circular deps between game.js and quiz-bot.js

let _sendQuizBot = null;
let _getLastResultsMessage = null;
let _setLastResultsMessage = null;
let _getQuizBotToken = null;
let _readAtlasUsage = null;

function setQuizBotDeps({ sendQuizBot, getLastResultsMessage, setLastResultsMessage, getQuizBotToken, readAtlasUsage }) {
  _sendQuizBot = sendQuizBot;
  _getLastResultsMessage = getLastResultsMessage;
  _setLastResultsMessage = setLastResultsMessage;
  _getQuizBotToken = getQuizBotToken;
  _readAtlasUsage = readAtlasUsage;
}

// ─── Room ───────────────────────────────────────────────────────────────────────

class Room {
  constructor(code, topic, questionCount) {
    this.code = code;
    this.topic = topic || 'General Knowledge';
    this.questionCount = Math.min(questionCount || DEFAULT_QUESTION_COUNT, MAX_QUESTIONS);
    this.state = STATES.LOBBY;
    this.players = new Map(); // id -> Player
    this.creatorId = null;
    this.questions = [];
    this.currentQuestion = -1;
    this.questionStartTime = 0;
    this.timer = null;
    this.cleanupTimer = null;
    this.answersThisRound = new Map(); // playerId -> { answerIndex, timestamp }
    this.commentary = '';
    this.summary = '';
    this.createdAt = Date.now();
    this.questionsReady = false;
    this.questionGenerationPromise = null;
    this.telegramMessage = null;
  }

  get playerList() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      score: p.score,
      connected: p.connected,
      ready: p.ready
    }));
  }

  get allReady() {
    const connected = [...this.players.values()].filter(p => p.connected);
    return connected.length >= 2 && connected.every(p => p.ready);
  }

  get standings() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || b.totalSpeedBonus - a.totalSpeedBonus)
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        photo: p.photo,
        score: p.score,
        correct: p.correct,
        streak: p.streak
      }));
  }

  addPlayer(id, name, photo, ws) {
    if (this.players.size >= MAX_PLAYERS && !this.players.has(id)) {
      return { error: 'Room is full' };
    }

    let player = this.players.get(id);
    if (player) {
      // Reconnect
      player.ws = ws;
      player.connected = true;
      player.name = name || player.name;
      if (this.state === STATES.LOBBY) player.ready = false;
      return { player, reconnected: true };
    }

    if (this.state !== STATES.LOBBY) {
      return { error: 'Game already in progress' };
    }

    player = new Player(id, name, photo);
    player.ws = ws;
    this.players.set(id, player);

    if (!this.creatorId) this.creatorId = id;

    return { player, reconnected: false };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player) {
      player.connected = false;
      player.ready = false;
      player.ws = null;
      if (this.creatorId === id) {
        const next = [...this.players.values()].find(p => p.connected);
        this.creatorId = next?.id ?? null;
      }
    }
  }

  get connectedCount() {
    return [...this.players.values()].filter(p => p.connected).length;
  }

  broadcast(msg, excludeId = null) {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.ws && player.connected && player.id !== excludeId) {
        try { player.ws.send(data); } catch {}
      }
    }
  }

  sendTo(playerId, msg) {
    const player = this.players.get(playerId);
    if (player?.ws && player.connected) {
      try { player.ws.send(JSON.stringify(msg)); } catch {}
    }
  }

  toggleReady(playerId) {
    if (this.state !== STATES.LOBBY) return;
    const player = this.players.get(playerId);
    if (!player) return;
    player.ready = !player.ready;
    this.broadcast({ type: 'lobby_update', players: this.playerList, creatorId: this.creatorId });

    // Auto-start when all players are ready
    if (this.allReady) {
      this.startGame();
    }
  }

  // ── State machine transitions ──

  async startGame() {
    if (this.state !== STATES.LOBBY) return;
    if (!this.allReady) return;

    // Set state immediately to prevent re-entrancy
    this.state = STATES.PREGAME;
    this.clearTimer();

    // Reset token usage for this game
    gameTokenUsage.inputTokens = 0;
    gameTokenUsage.outputTokens = 0;
    gameTokenUsage.thinkingTokens = 0;
    gameTokenUsage.calls = 0;

    // Start question generation if not already started
    if (!this.questionGenerationPromise) {
      this.questionGenerationPromise = generateQuestions(this.topic, this.questionCount);
    }

    this.broadcast({
      type: 'pregame',
      topic: this.topic,
      questionCount: this.questionCount
    });

    // Wait for questions while showing pregame countdown
    try {
      this.questions = await this.questionGenerationPromise;
      this.questionCount = this.questions.length;
    } catch (err) {
      console.log(`[room ${this.code}] question gen failed in startGame: ${err.message}`);
      this.questions = getFallbackQuestions(this.questionCount);
    }
    this.questionsReady = true;

    // Only proceed if still in PREGAME (room wasn't destroyed during await)
    if (this.state !== STATES.PREGAME) return;
    this.timer = setTimeout(() => this.nextQuestion(), PREGAME_DURATION);
  }

  nextQuestion() {
    this.clearTimer();
    this.currentQuestion++;

    if (this.currentQuestion >= this.questions.length) {
      this.endGame();
      return;
    }

    this.state = STATES.QUESTION;
    this.answersThisRound = new Map();
    this.questionStartTime = Date.now();

    const q = this.questions[this.currentQuestion];
    this.broadcast({
      type: 'question',
      index: this.currentQuestion,
      total: this.questions.length,
      question: q.question,
      options: q.options,
      timeLimit: QUESTION_TIME_LIMIT,
      players: this.playerList
    });

    this.timer = setTimeout(() => this.revealAnswer(), QUESTION_TIME_LIMIT + 500);
  }

  submitAnswer(playerId, answerIndex, timestamp) {
    if (this.state !== STATES.QUESTION) return;
    if (this.answersThisRound.has(playerId)) return; // no double answers
    if (answerIndex < 0 || answerIndex > 3) return; // validate range

    this.answersThisRound.set(playerId, { answerIndex, timestamp });

    // Notify everyone that this player has answered (not WHAT they answered)
    this.broadcast({
      type: 'player_answered',
      playerId,
      answeredCount: this.answersThisRound.size,
      totalPlayers: [...this.players.values()].filter(p => p.connected).length
    });

    // If all connected players have answered, skip to reveal early
    const connectedPlayers = [...this.players.values()].filter(p => p.connected);
    if (this.answersThisRound.size >= connectedPlayers.length) {
      this.clearTimer();
      // Small delay so last answer feels registered
      this.timer = setTimeout(() => this.revealAnswer(), 500);
    }
  }

  async revealAnswer() {
    this.clearTimer();
    if (this.state !== STATES.QUESTION) return;

    this.state = STATES.ANSWER_REVEAL;
    const q = this.questions[this.currentQuestion];
    const playerResults = [];

    let correctCount = 0;
    let fastestTime = Infinity;
    let fastestPlayer = '';
    let topStreak = 0;
    let streakPlayer = '';
    let soloCorrectPlayer = null;

    for (const [pid, player] of this.players) {
      const answer = this.answersThisRound.get(pid);
      const answered = !!answer;
      const correct = answered && answer.answerIndex === q.correct;
      const responseTime = answered ? (answer.timestamp - this.questionStartTime) : QUESTION_TIME_LIMIT;

      if (correct) {
        player.streak++;
        player.correct++;
        correctCount++;
        if (responseTime < fastestTime) {
          fastestTime = responseTime;
          fastestPlayer = player.name;
        }
      } else {
        player.streak = 0;
      }

      if (player.streak > topStreak) {
        topStreak = player.streak;
        streakPlayer = player.name;
      }

      const score = calculateScore(correct, responseTime, QUESTION_TIME_LIMIT, player.streak);
      player.score += score.points;
      player.totalSpeedBonus += score.breakdown.speed;

      player.answers.push({
        answerIndex: answer?.answerIndex ?? -1,
        correct,
        points: score.points,
        breakdown: score.breakdown
      });

      playerResults.push({
        id: pid,
        name: player.name,
        answered,
        answerIndex: answer?.answerIndex ?? -1,
        correct,
        points: score.points,
        breakdown: score.breakdown,
        streak: player.streak,
        totalScore: player.score
      });
    }

    if (correctCount === 1) {
      soloCorrectPlayer = playerResults.find(p => p.correct)?.name;
    }

    // Generate commentary (non-blocking — use template if AI is slow)
    const leader = this.standings[0];
    const commentaryState = {
      question: q.question,
      correctCount,
      totalPlayers: this.players.size,
      leader: leader?.name || 'nobody',
      leaderScore: leader?.score || 0,
      topStreak,
      streakPlayer,
      allWrong: correctCount === 0,
      allCorrect: correctCount === this.players.size,
      closeRace: this.standings.length >= 2 && (this.standings[0].score - this.standings[1].score) < 500,
      soloCorrect: soloCorrectPlayer,
      fastestTime,
      fastestPlayer
    };

    // Broadcast immediately with template commentary — don't block on AI
    const commentary = getTemplateCommentary(commentaryState);
    this.commentary = commentary;

    this.broadcast({
      type: 'answer_reveal',
      questionIndex: this.currentQuestion,
      correctIndex: q.correct,
      funFact: q.fun_fact,
      commentary,
      playerResults
    });

    this.timer = setTimeout(() => this.showLeaderboard(), REVEAL_DURATION);
  }

  showLeaderboard() {
    this.clearTimer();
    this.state = STATES.LEADERBOARD;

    this.broadcast({
      type: 'leaderboard',
      standings: this.standings,
      questionIndex: this.currentQuestion,
      totalQuestions: this.questions.length
    });

    this.timer = setTimeout(() => this.nextQuestion(), LEADERBOARD_DURATION);
  }

  async endGame() {
    this.clearTimer();
    this.state = STATES.GAME_OVER;

    const results = {
      topic: this.topic,
      totalQuestions: this.questions.length,
      standings: this.standings,
      duration: Date.now() - this.createdAt
    };

    // Instant template summary — no AI blocking
    const top = results.standings[0];
    this.summary = `Game over! ${top?.name || 'Nobody'} wins with ${top?.score || 0} points.`;

    // Calculate cost for this game
    const inputCost = (gameTokenUsage.inputTokens / 1_000_000) * COST_PER_M_INPUT;
    const outputCost = (gameTokenUsage.outputTokens / 1_000_000) * COST_PER_M_OUTPUT;
    const thinkingCost = (gameTokenUsage.thinkingTokens / 1_000_000) * COST_PER_M_THINKING;
    const totalCost = inputCost + outputCost + thinkingCost;
    const costInfo = {
      inputTokens: gameTokenUsage.inputTokens,
      outputTokens: gameTokenUsage.outputTokens,
      thinkingTokens: gameTokenUsage.thinkingTokens,
      totalTokens: gameTokenUsage.inputTokens + gameTokenUsage.outputTokens + gameTokenUsage.thinkingTokens,
      apiCalls: gameTokenUsage.calls,
      costUsd: Math.round(totalCost * 10000) / 10000
    };

    // Read Atlas total usage
    let atlasUsage = null;
    if (_readAtlasUsage) {
      try {
        const usage = _readAtlasUsage();
        atlasUsage = { totalTokens: usage.totalTokens, estimatedCostUsd: usage.estimatedCostUsd };
      } catch {}
    }


    this.broadcast({
      type: 'game_over',
      podium: this.standings.slice(0, 3),
      standings: this.standings,
      summary: this.summary,
      topic: this.topic,
      cost: costInfo,
      atlasUsage
    });

    // Record highscores
    try { recordGame(this); } catch (err) {
      console.log(`[room ${this.code}] highscore save failed: ${err.message}`);
    }

    // Delete the quiz bot's join message and post compact results
    const quizBotToken = _getQuizBotToken ? _getQuizBotToken() : null;
    if (this.telegramMessage && quizBotToken && _sendQuizBot) {
      const chatId = this.telegramMessage.chatId;
      const winner = this.standings[0];

      _sendQuizBot('deleteMessage', {
        chat_id: chatId,
        message_id: this.telegramMessage.messageId
      }).catch(() => {});

      // Compact result + all-time top 3
      const hs = getHighscores();
      const medals = ['🥇', '🥈', '🥉'];
      const fmt = (n) => n.toLocaleString('en-US');
      const gameResult = `${medals[0]} ${winner?.name || '—'} wins "${this.topic}" with ${fmt(winner?.score || 0)} pts`;
      const allTime = hs.allTime.slice(0, 3).map((p, i) => `${medals[i]} ${p.name}: ${fmt(p.totalScore)}`).join(' · ');
      const text = allTime ? `${gameResult}\nAll-time: ${allTime}` : gameResult;

      _sendQuizBot('sendMessage', {
        chat_id: chatId,
        text,
        disable_notification: true
      }).then(res => {
        if (res?.ok && _setLastResultsMessage) {
          // Store this message ID so next game can delete it
          _setLastResultsMessage({ chatId, messageId: res.result.message_id });
          console.log(`[quiz-bot] posted compact results`);
        }
      }).catch(() => {});
    }

    // Schedule cleanup
    this.cleanupTimer = setTimeout(() => {
      rooms.delete(this.code);
      console.log(`[room ${this.code}] cleaned up after game over`);
    }, ROOM_CLEANUP_AFTER_GAME);
  }

  // Send full state to a reconnecting player
  sendFullState(playerId) {
    const base = { roomCode: this.code, you: playerId };

    switch (this.state) {
      case STATES.LOBBY:
        this.sendTo(playerId, { ...base, type: 'lobby_update', players: this.playerList, creatorId: this.creatorId });
        break;
      case STATES.PREGAME:
        this.sendTo(playerId, { ...base, type: 'pregame', topic: this.topic, questionCount: this.questionCount });
        break;
      case STATES.QUESTION: {
        const q = this.questions[this.currentQuestion];
        const elapsed = Date.now() - this.questionStartTime;
        const remaining = Math.max(0, QUESTION_TIME_LIMIT - elapsed);
        this.sendTo(playerId, {
          ...base, type: 'question',
          index: this.currentQuestion, total: this.questions.length,
          question: q.question, options: q.options, timeLimit: remaining,
          alreadyAnswered: this.answersThisRound.has(playerId)
        });
        break;
      }
      case STATES.ANSWER_REVEAL:
      case STATES.LEADERBOARD:
        this.sendTo(playerId, { ...base, type: 'leaderboard', standings: this.standings, questionIndex: this.currentQuestion, totalQuestions: this.questions.length });
        break;
      case STATES.GAME_OVER:
        this.sendTo(playerId, { ...base, type: 'game_over', podium: this.standings.slice(0, 3), standings: this.standings, summary: this.summary, topic: this.topic });
        break;
    }
  }

  clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  destroy() {
    this.clearTimer();
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    for (const p of this.players.values()) {
      if (p.ws) try { p.ws.close(); } catch {}
    }
  }
}

// ─── Room Manager ───────────────────────────────────────────────────────────────

const rooms = new Map();

function getOrCreateRoom(topic, questionCount) {
  // Clean up stale empty lobby rooms
  for (const [code, room] of rooms) {
    if (room.state === STATES.LOBBY && room.connectedCount === 0) {
      room.destroy();
      rooms.delete(code);
      console.log(`[room ${code}] cleaned up (empty lobby replaced by new game)`);
    }
  }

  const code = makeRoomCode();
  const room = new Room(code, topic, questionCount);
  rooms.set(code, room);
  console.log(`[room ${code}] created — topic: "${room.topic}", questions: ${room.questionCount}`);

  // Pre-generate questions
  room.questionGenerationPromise = generateQuestions(room.topic, room.questionCount);

  return room;
}

function getRoom(code) {
  return rooms.get(code) || null;
}

// Periodic empty-room cleanup
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.state !== STATES.GAME_OVER && room.connectedCount === 0) {
      const age = Date.now() - room.createdAt;
      if (age > ROOM_CLEANUP_EMPTY) {
        // Clean up Telegram invite message if game never finished
        if (room.telegramMessage && _sendQuizBot) {
          _sendQuizBot('deleteMessage', {
            chat_id: room.telegramMessage.chatId,
            message_id: room.telegramMessage.messageId
          }).catch(() => {});
          console.log(`[quiz-bot] cleaned up invite (room abandoned)`);
        }
        room.destroy();
        rooms.delete(code);
        console.log(`[room ${code}] cleaned up (empty for too long)`);
      }
    }
  }
}, 30000);

module.exports = {
  STATES,
  rooms,
  getOrCreateRoom,
  getRoom,
  Room,
  Player,
  calculateScore,
  setQuizBotDeps
};
