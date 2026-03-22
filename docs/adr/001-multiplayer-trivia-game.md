# ADR-001: AI-Hosted Live Trivia Game

**Status**: Proposed
**Date**: 2026-03-21
**Author**: snoozyy

---

## Context

We need a demo game for the Atlas Telegram bot that:

1. **Multiplayer-first** — the group experience IS the product
2. **Showcases the AI agent** — Atlas isn't a bystander, it's the star
3. **Instantly familiar** — no tutorial needed, everyone knows the format
4. **Runs inside Telegram** — Web App (Mini App) via WebView

## Decision

### Build a **Kahoot-style live trivia game** where Atlas is the AI host.

The template is [Kahoot](https://kahoot.com/) / [HQ Trivia](https://en.wikipedia.org/wiki/HQ_Trivia) / [Jackbox Party Pack](https://www.jackboxgames.com/) — formats that have proven multiplayer engagement at massive scale. We take the core loop and replace the static question bank with a live AI that generates, hosts, and reacts.

### Why This Format

| Criteria | Trivia | Reaction Race | Drawing Guess | Tug of War |
|----------|--------|---------------|---------------|------------|
| Multiplayer depth | High — everyone plays every round | Low — just tap | High but complex | Medium — just tap |
| AI involvement | **Natural** — AI generates Qs, hosts, reacts | None | Minimal | None |
| Familiar format | Kahoot/HQ — universally known | Simple but forgettable | Pictionary — known but hard to build | Niche |
| Wow factor with AI | **High** — "the bot just made up a quiz about us" | Low | Medium | Low |
| Build complexity | Medium | Low | High (canvas, drawing sync) | Low |
| Mobile UX | 4 big buttons — perfect | 1 button — boring | Drawing on phone — frustrating | 1 button — boring |

Trivia is the only format where AI involvement feels essential rather than bolted on.

---

## Game Design

### The Core Loop (stolen from Kahoot, and it works)

```
1. Atlas announces game in Telegram chat → sends "Join Game" Web App button
2. Players tap button → Telegram opens WebView → WebSocket connects to game server
3. Lobby screen shows who's joined (live updating)
4. Atlas generates a themed round of questions (via Gemini API)
5. For each question:
   a. All players see the question + 4 answer options simultaneously
   b. Countdown timer (10-15 seconds)
   c. Players tap their answer
   d. Results screen: correct answer revealed, points awarded (speed bonus)
   e. Live leaderboard update
6. After final question:
   a. Podium screen (top 3) with animations
   b. Atlas posts results summary back to the Telegram group chat
   c. Atlas adds commentary ("X dominated that round", roasts, highlights)
```

### Where Atlas (the AI Agent) Is Involved

This is the differentiator. Atlas isn't a dumb quiz database — it's a live host.

#### 1. Game Initiation (in Telegram chat)
Atlas creates games conversationally. Users can say things like:
- "Atlas, start a trivia game"
- "Atlas, quiz us about space"
- "Atlas, make a quiz about our group"

Atlas responds with personality, announces the game, and sends the Web App button.

#### 2. Question Generation (pre-round, via API)
Before each round starts, the game server calls Atlas (Gemini API) to generate questions. This is where AI shines:

- **Topic-aware**: "Make 7 questions about 90s hip-hop" → tailored quiz
- **Difficulty scaling**: Atlas can adjust based on how the group is performing
- **Creative formats**: Not just facts — "Which of these is NOT a real..." / "What would happen if..." / absurd hypotheticals
- **Image rounds**: Atlas generates an image (via Gemini image gen) and asks "What is this?" — visual AI content as gameplay

**Rate limit strategy** (15 RPM, 1500 RPD):
- Generate all questions for a round in a **single API call** (1 request = 5-10 questions)
- Image questions: generate during the previous question's answer phase (pipelining)
- Worst case per game: 3-5 API calls total (question gen + commentary + results)

#### 3. Live Commentary (post-question, in WebView + Telegram)
After each question, Atlas can drop a one-liner:
- "Nobody got that one? Come on."
- "3-way tie! This is getting spicy."
- "PlayerX is on a 5-streak, someone stop them."

This is generated per-question as a lightweight API call (short prompt, short response), or pre-generated in batch with the questions to save rate limit.

#### 4. Results & Aftermath (back in Telegram chat)
After the game ends, Atlas posts a rich summary to the group:
- Final standings
- Fun superlatives ("Most Improved", "Speed Demon", "Lucky Guesser")
- Stores results in its memory system for future reference ("Last time you played, X won")

This closes the loop — the game starts and ends in the Telegram chat, with Atlas as the narrative thread.

### What Makes This a "Wow"

1. **"The AI just made up a quiz about [topic] and it actually works"** — generative content is impressive when you see it live
2. **The host has personality** — Atlas roasts, encourages, remembers past games
3. **It's social** — everyone in the group is playing simultaneously on their phones, like a Kahoot classroom moment
4. **Image rounds** — "Atlas drew this, what is it?" is a genuine crowd-pleaser
5. **It remembers** — "You lost to X last time, redemption arc?" — AI memory makes it feel alive

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────┐
│         Telegram Group Chat         │
│                                     │
│  User: "Atlas, start a trivia game" │
│                                     │
│  Atlas: "Alright, trivia time! 🎯   │
│   Topic: General Knowledge          │
│   [▶ Join Game]  ← Web App button   │
│                                     │
│  Atlas: "5 players joined, let's go"│
│  Atlas: "Final scores: ..."         │
└───────────┬─────────────────────────┘
            │
            │ Bot sends InlineKeyboardButton
            │ { web_app: { url: "https://srv1176342.taile65f65.ts.net/game?room=abc123" } }
            │
┌───────────▼─────────────────────────┐
│     Telegram WebView (per player)   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     index.html (game UI)    │    │
│  │                             │    │
│  │  - Lobby / waiting screen   │    │
│  │  - Question + 4 answers     │    │
│  │  - Countdown timer          │    │
│  │  - Results + leaderboard    │    │
│  │  - Podium / game over       │    │
│  └──────────┬──────────────────┘    │
└─────────────┼───────────────────────┘
              │ WebSocket (wss://)
              │
┌─────────────▼───────────────────────┐
│    Game Server (Node.js, VPS)       │
│    apps/trivia/server.js            │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ HTTP: serves index.html     │    │
│  │ WS: real-time game state    │    │
│  │                             │    │
│  │ Room manager:               │    │
│  │  - Create/join rooms        │    │
│  │  - Track players, scores    │    │
│  │  - Timer management         │    │
│  │  - State machine per room   │    │
│  └──────────┬──────────────────┘    │
│             │                       │
│  ┌──────────▼──────────────────┐    │
│  │ AI Integration Module       │    │
│  │                             │    │
│  │ - Gemini API (question gen) │    │
│  │ - Prompt templates          │    │
│  │ - Response parsing/fallback │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
              │
              │ HTTPS via Tailscale Funnel
              │
         https://srv1176342.taile65f65.ts.net
```

### Component Breakdown

#### 1. Game Server (`apps/trivia/server.js`)

Single Node.js file. No npm dependencies beyond `ws` (WebSocket library — the one dependency we need to install).

**State machine per room:**

```
LOBBY → PREGAME → QUESTION → ANSWER_REVEAL → LEADERBOARD → (repeat) → GAME_OVER
```

- **LOBBY**: Players join, see each other. Host (or auto-start after N players + timeout) triggers start.
- **PREGAME**: "Get ready!" countdown (3s). Server fires off question generation API call if not pre-cached.
- **QUESTION**: Question + 4 options broadcast to all. Timer starts (10-15s). Server collects answers.
- **ANSWER_REVEAL**: Correct answer shown. Points calculated (base + speed bonus). Atlas commentary injected.
- **LEADERBOARD**: Current standings. Brief pause (5s), then next question.
- **GAME_OVER**: Final podium. Server sends results payload (available for Atlas to pick up and post to chat).

**Room management:**
- Rooms identified by short code (e.g., `abc123`)
- Auto-cleanup: rooms destroyed 5 minutes after game ends or if empty for 2 minutes
- Max 1 active room at a time (demo scope — no need for multi-room complexity)

#### 2. Game Client (`apps/trivia/index.html`)

Single HTML file with inline CSS/JS. No build step, no CDN.

**UI States** (maps 1:1 to server states):
- **Join/Lobby**: Player list updating in real-time, "Waiting for host..." or player count
- **Question**: Large question text, 4 colored answer buttons (Kahoot-style: red/blue/green/orange), countdown bar
- **Results**: Correct answer highlighted, "+X points" animation, streak indicator
- **Leaderboard**: Sorted player list with scores, position changes (arrows up/down)
- **Podium**: Top 3 with 1st/2nd/3rd styling, confetti/celebration effect (CSS-only)

**Telegram Web App API usage:**
- `Telegram.WebApp.initDataUnsafe.user` → player identity (name, ID, photo)
- `Telegram.WebApp.themeParams` → match Telegram's dark/light theme
- `Telegram.WebApp.HapticFeedback` → vibrate on answer selection, correct/wrong feedback
- `Telegram.WebApp.close()` → after game over, return to chat

**Design principles:**
- Big touch targets (full-width buttons, minimum 48px height)
- High contrast colors for answer options
- Animations via CSS transitions only (no JS animation libraries)
- Works in both portrait and landscape
- No scrolling during question phase — everything visible at once

#### 3. AI Integration Module (inside server.js)

Direct HTTP calls to Gemini API — no SDK needed, just `fetch()` (native in Node 24).

**Question generation prompt structure:**
```
Generate {N} trivia questions about "{topic}".

Return valid JSON array:
[{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correct": 0,          // index of correct answer
  "difficulty": "medium",
  "fun_fact": "..."       // shown after answer reveal
}]

Rules:
- Exactly 4 options per question
- Options should be plausible (no obvious joke answers)
- Mix difficulty: 2 easy, {N-4} medium, 2 hard
- Fun facts should be surprising/interesting (1 sentence)
```

**Fallback strategy:**
- If Gemini API fails or returns malformed JSON: fall back to a small hardcoded question bank (~30 questions across categories) bundled in server.js
- Parse with try/catch + basic validation (has question, has 4 options, has correct index)
- If a single question is malformed, skip it rather than crash the round

**Commentary generation:**
- Lightweight: short system prompt + game state summary → one-liner response
- Can be pre-generated in batch with questions to minimize API calls
- Falls back to template strings if API unavailable: `"{player} is on fire!"`, `"Nobody got that one!"`

### Network Protocol (WebSocket Messages)

Client → Server:
```json
{ "type": "join", "player": { "id": 123, "name": "Alice", "photo": "..." } }
{ "type": "answer", "questionIndex": 0, "answerIndex": 2, "timestamp": 1711036800000 }
{ "type": "start_game" }   // only from room creator
```

Server → Client:
```json
{ "type": "lobby_update", "players": [...], "roomCode": "abc123" }
{ "type": "pregame", "topic": "Science", "questionCount": 7 }
{ "type": "question", "index": 0, "total": 7, "question": "...", "options": [...], "timeLimit": 15000 }
{ "type": "answer_reveal", "correctIndex": 1, "funFact": "...", "commentary": "...", "playerResults": [...] }
{ "type": "leaderboard", "standings": [...] }
{ "type": "game_over", "podium": [...], "summary": "..." }
{ "type": "error", "message": "..." }
```

### Bot ↔ Game Server Communication

The game server exposes a simple HTTP REST endpoint alongside the WebSocket server:

```
POST /api/create-room    → { roomCode, joinUrl }    // Atlas calls this to start a game
GET  /api/room/:code     → { status, players, ... } // Atlas can check game state
GET  /api/results/:code  → { standings, stats }      // Atlas fetches results to post in chat
```

Atlas uses its **exec tool** to curl these endpoints from inside the container:
```bash
curl -s http://localhost:8080/api/create-room -X POST -H "Content-Type: application/json" \
  -d '{"topic": "science", "questionCount": 7}'
```

This keeps the integration simple — no bot token sharing, no Telegram API calls from the game server. Atlas handles all Telegram messaging, the game server handles all game logic.

---

## Deployment

### File Structure
```
apps/trivia/
  server.js       — Game server (HTTP + WebSocket + AI integration)
  index.html      — Game client (single-file, inline CSS/JS)
  questions.json  — Fallback question bank (offline backup)
  README.md       — How to run
```

### Running
```bash
# Install the one dependency
cd apps/trivia && npm init -y && npm install ws

# Start the game server
node apps/trivia/server.js
# Listens on port 8080

# In another terminal, expose via Tailscale Funnel
tailscale funnel 8080
# Now live at https://srv1176342.taile65f65.ts.net
```

### Scripts
```bash
scripts/start-trivia.sh   — starts server + funnel
scripts/stop-trivia.sh    — kills server, tears down funnel
```

### Environment Variables
```
GEMINI_API_KEY=...    # Required for AI question generation
PORT=8080             # Game server port (default 8080)
```

The `GEMINI_API_KEY` is already available on the host (same key the bot uses). The game server runs on the host (not inside the Docker container), so it needs its own copy of the key.

---

## Rate Limit Budget Per Game

With 15 RPM and 1500 RPD on Gemini free tier:

| Action | API Calls | When |
|--------|-----------|------|
| Generate questions (batch) | 1 | Before round starts |
| Generate image question (optional) | 1-2 | During answer phases |
| Generate commentary (batch or per-Q) | 1 | With question gen, or 1 per question |
| Generate results summary | 1 | After game ends |
| **Total per game** | **3-5** | |

At 5 calls per game, we can run **300 games/day** or **3 games/minute** — well within limits. A typical game session (7 questions) takes ~3-5 minutes, so we'll never hit RPM limits.

---

## Scope & Non-Goals

### In Scope (MVP)
- Single-room multiplayer trivia (2-20 players)
- AI-generated questions from any topic
- Real-time scoring with speed bonus
- Leaderboard and podium
- Atlas integration (game creation, results posting)
- Fallback question bank for offline/API-failure mode
- Mobile-first responsive UI
- Telegram Web App API integration (identity, theme, haptics)

### Out of Scope (Future)
- Persistent score tracking across games (use Atlas memory later)
- Custom avatars or player profiles
- Tournament/bracket mode
- Audio (TTS for questions — cool but adds complexity)
- Spectator mode
- Multiple concurrent rooms
- Anti-cheat beyond basic server-side validation

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini returns malformed JSON | Game stalls | Hardcoded fallback question bank + strict parsing with retry |
| Gemini rate limited | No AI questions | Fallback bank + rate tracking in server |
| WebSocket drops on mobile | Player disconnected | Auto-reconnect with state recovery (server tracks all state) |
| Tailscale Funnel unreliable | Game unreachable | Monitor uptime; funnel is generally stable but document restart steps |
| Telegram WebView quirks | UI breaks | Test on Android + iOS Telegram; use only well-supported CSS/JS |
| Low player count (1-2) | Not fun | Allow solo play as "practice mode"; fun starts at 3+ |

---

## Success Criteria

1. **3+ players can join and play a full 7-question game without errors**
2. **Questions are AI-generated and relevant to the requested topic**
3. **Total time from "Atlas, start a game" to final results posted in chat: under 5 minutes**
4. **Someone in the group says "that was cool" or equivalent**

---

## References

- [Kahoot](https://kahoot.com/) — the gold standard for live multiplayer trivia UX
- [HQ Trivia](https://en.wikipedia.org/wiki/HQ_Trivia) — live-hosted trivia with massive concurrent players
- [Jackbox Party Pack](https://www.jackboxgames.com/) — phone-as-controller party games
- [Telegram Web Apps Documentation](https://core.telegram.org/bots/webapps)
- [Telegram WebApp API](https://core.telegram.org/bots/webapps#initializing-mini-apps)
