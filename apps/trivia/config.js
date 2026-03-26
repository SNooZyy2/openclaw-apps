// ─── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const QUIZ_LLM_MODEL = process.env.QUIZ_LLM_MODEL || '';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';
const BASE_URL = process.env.BASE_URL || `https://srv1176342.taile65f65.ts.net`;

// Timing (ms)
const PREGAME_DURATION = 3000;
const QUESTION_TIME_LIMIT = 15000;
const REVEAL_DURATION = 5000;
const LEADERBOARD_DURATION = 5000;
const ROOM_CLEANUP_AFTER_GAME = 5 * 60 * 1000;
const ROOM_CLEANUP_EMPTY = 2 * 60 * 1000;

// Scoring
const SCORE_BASE = 1000;
const SCORE_SPEED_MAX = 500;
const SCORE_STREAK_BONUS = 100;
const SCORE_STREAK_CAP = 500;

// Limits
const MAX_PLAYERS = 20;
const MAX_QUESTIONS = 5;
const DEFAULT_QUESTION_COUNT = 5;

// Cost tracking — Gemini 2.5 Flash (Paid Tier 1, ≤200K context)
const COST_PER_M_INPUT = 0.15;
const COST_PER_M_OUTPUT = 0.60;
const COST_PER_M_THINKING = 3.50;

// Mutable shared reference — gemini.js writes, game.js reads
const gameTokenUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, calls: 0 };

module.exports = {
  PORT,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  OPENROUTER_API_KEY,
  QUIZ_LLM_MODEL,
  PERPLEXITY_API_KEY,
  BASE_URL,
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
};
