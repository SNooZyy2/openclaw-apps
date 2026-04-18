// ─── Highscores ─────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const HIGHSCORES_FILE = path.join(__dirname, '..', 'highscores.json');

function loadHighscores() {
  try {
    return JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf8'));
  } catch {
    return { games: [], players: {} };
  }
}

function saveHighscores(data) {
  fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(data, null, 2));
}

function recordGame(room) {
  const data = loadHighscores();
  const standings = room.standings;
  const now = new Date().toISOString();

  // Record the game
  data.games.push({
    date: now,
    topic: room.topic,
    questionCount: room.questions.length,
    playerCount: room.players.size,
    winner: standings[0]?.name || 'nobody',
    winnerScore: standings[0]?.score || 0,
    standings: standings.map(s => ({ name: s.name, id: s.id, score: s.score, correct: s.correct }))
  });

  // Keep last 100 games
  if (data.games.length > 100) data.games = data.games.slice(-100);

  // Update per-player stats
  for (const s of standings) {
    const key = String(s.id);
    if (!data.players[key]) {
      data.players[key] = { name: s.name, gamesPlayed: 0, wins: 0, totalScore: 0, totalCorrect: 0, bestScore: 0 };
    }
    const p = data.players[key];
    p.name = s.name; // keep name up to date
    p.gamesPlayed++;
    p.totalScore += s.score;
    p.totalCorrect += s.correct;
    if (s.score > p.bestScore) p.bestScore = s.score;
    if (s.rank === 1) p.wins++;
  }

  saveHighscores(data);
  console.log(`[highscores] recorded game — winner: ${standings[0]?.name}, ${standings.length} players`);
}

function getHighscores() {
  const data = loadHighscores();

  // All-time leaderboard sorted by total score
  const allTime = Object.values(data.players)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 20)
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      totalScore: p.totalScore,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      bestScore: p.bestScore,
      avgScore: Math.round(p.totalScore / p.gamesPlayed),
      totalCorrect: p.totalCorrect
    }));

  // Recent games
  const recentGames = data.games.slice(-10).reverse();

  return { allTime, recentGames, totalGames: data.games.length };
}

module.exports = {
  HIGHSCORES_FILE,
  loadHighscores,
  saveHighscores,
  recordGame,
  getHighscores
};
