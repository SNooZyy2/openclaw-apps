# Atlas Trivia Game Workflow

How users start and play trivia games via the quiz bot (`@AtlasQuizBotBot`).

## Prerequisites

- Quiz bot service running: `sudo systemctl status atlas-quiz-bot`
- Tailscale Funnel active: `tailscale funnel 8080`

## Flow

### 1. User Starts a Game

In the Telegram group, send:
- `/quiz` — starts with "General Knowledge" topic
- `/quiz space` — starts with a specific topic

### 2. Quiz Bot Creates a Room

The bot calls `getOrCreateRoom(topic, 5)` internally (no HTTP — same process). A 6-character hex room code is generated and questions begin pre-generating via Perplexity/Gemini.

### 3. Bot Sends Join Link

The bot sends an `InlineKeyboardButton` to the group:
```
web_app: { url: "https://t.me/AtlasQuizBotBot/atlas_quiz?startapp=a1b2c3" }
```

Players tap the button → Telegram opens the Mini App → WebSocket connects to the game server.

### 4. Lobby

Players see each other's avatars (from Telegram profile photos). Each player toggles "Ready". When all players are ready, a 5-second countdown begins.

### 5. Game Plays (Automatic)

State machine: `LOBBY → PREGAME (3s) → QUESTION (15s) → ANSWER_REVEAL (5s) → LEADERBOARD (5s) → loop → GAME_OVER`

- 5 questions per game (default)
- Scoring: 1000 base + up to 500 speed bonus + up to 500 streak bonus
- AI commentary generated per-question (async, template fallback)

### 6. Results Posted to Chat

When the game ends, the bot:
1. Deletes the original join message
2. Posts a compact results summary to the group (standings + AI-generated summary)
3. Records the game in `highscores.json`

### 7. Error Handling

- If question generation fails: falls back to local question bank (`questions.json`)
- If all players disconnect: room auto-cleans after 2 minutes
- Completed rooms auto-clean after 5 minutes

## REST API (for debugging / manual use)

```bash
# Health check
curl -s https://srv1176342.taile65f65.ts.net/health | jq

# Create a room manually
curl -s -X POST https://srv1176342.taile65f65.ts.net/api/create-room \
  -H 'Content-Type: application/json' \
  -d '{"topic":"cats","questionCount":5}' | jq

# Room status
curl -s https://srv1176342.taile65f65.ts.net/api/room/ROOMCODE | jq

# Results (only after GAME_OVER)
curl -s https://srv1176342.taile65f65.ts.net/api/results/ROOMCODE | jq

# Highscores
curl -s https://srv1176342.taile65f65.ts.net/api/highscores | jq

# Atlas usage stats
curl -s https://srv1176342.taile65f65.ts.net/api/atlas-usage | jq
```

## Other Bot Commands

| Command | Who | What |
|---------|-----|------|
| `/qr <text>` | Anyone | Generate an ATLAS-branded QR code |
| `/costs` | Anyone | Show API token usage and costs |
| `/quizstop` | Owner only | Kill all active game rooms |
| `/quizreset` | Owner only | Wipe all highscores |
