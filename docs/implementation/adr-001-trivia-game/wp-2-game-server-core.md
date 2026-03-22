# WP-2: Game Server Core

**Depends on**: WP-1 (scaffolding + running server)
**Enables**: WP-3 (Client), WP-4 (AI), WP-5 (Bot)

## Goal

Implement the multiplayer game server — room management, game state machine, WebSocket protocol, scoring logic. This is the backbone. After this WP, multiple browser tabs can connect and play through a full game loop (with hardcoded test questions).

---

## Issues

### 2.1 — Room manager

**Type**: Feature
**Effort**: Medium

Manage game rooms: creation, joining, player tracking, auto-cleanup.

**Acceptance criteria**:
- Rooms created with a short alphanumeric code (6 chars)
- Players join by room code, tracked by Telegram user ID (or fallback random ID for browser testing)
- Duplicate joins (same player ID) reconnect to existing session rather than creating a second player
- Room auto-destroys after 5 min of `GAME_OVER` state or 2 min with 0 connected players
- Max 1 active room enforced (creating a new room while one exists returns the existing one)
- Max 20 players per room

**Deliverables**:
- Room class/module in `server.js`
- Unit-testable in isolation (can create room, add players, check state)

---

### 2.2 — Game state machine

**Type**: Feature
**Effort**: Large

Implement the core game loop as a state machine with timed transitions.

**States**: `LOBBY → PREGAME → QUESTION → ANSWER_REVEAL → LEADERBOARD → (loop) → GAME_OVER`

**Acceptance criteria**:
- State transitions are timer-driven and server-authoritative (clients cannot skip states)
- `LOBBY`: waits for `start_game` message from the room creator, or auto-starts after configurable timeout
- `PREGAME`: 3-second countdown, then transitions to first question
- `QUESTION`: broadcasts question + options, starts countdown (configurable, default 15s), collects answers
- `ANSWER_REVEAL`: shows correct answer, calculates scores, holds for 5s
- `LEADERBOARD`: shows standings, holds for 5s, then next question or `GAME_OVER`
- `GAME_OVER`: final standings broadcast, room enters cleanup countdown
- Late answers (after timer) are rejected
- Players who don't answer get 0 points for that question

**Deliverables**:
- State machine logic in `server.js`
- Configurable timing constants at top of file

---

### 2.3 — WebSocket protocol & message handling

**Type**: Feature
**Effort**: Medium

Implement the client-server WebSocket message protocol as defined in the ADR.

**Client → Server messages**:
- `join` — player joins room with identity
- `answer` — player submits answer with timestamp
- `start_game` — room creator triggers game start

**Server → Client messages**:
- `lobby_update` — player list changed
- `pregame` — game starting, topic + question count
- `question` — question data + timer
- `answer_reveal` — correct answer, per-player results, commentary
- `leaderboard` — current standings
- `game_over` — final podium + summary
- `error` — error message

**Acceptance criteria**:
- All message types defined above are implemented
- Malformed messages are ignored (no server crash)
- Connection drops are handled gracefully (player marked as disconnected, can rejoin)
- Server sends full state on reconnect so client can recover

**Deliverables**:
- Message handler in `server.js`
- Message type constants/documentation at top of file

---

### 2.4 — Scoring engine

**Type**: Feature
**Effort**: Small

Calculate points per question with a speed bonus.

**Scoring formula** (Kahoot-style):
- Base points: 1000 for correct answer, 0 for wrong/no answer
- Speed bonus: up to +500 based on how quickly the answer was submitted (linear decay over the time limit)
- Streak bonus: +100 per consecutive correct answer (caps at +500 for 5+ streak)
- Total per question: 0 to 2000 points

**Acceptance criteria**:
- Correct + fastest possible answer = 2000 points (1000 base + 500 speed + 500 streak at 5+)
- Correct + last-second answer = ~1000 points (1000 base + ~0 speed + streak)
- Wrong answer = 0 points, resets streak
- No answer = 0 points, resets streak
- Ties broken by total accumulated speed bonus

**Deliverables**:
- `calculateScore()` function in `server.js`
- Streak tracking per player in room state

---

### 2.5 — End-to-end test with hardcoded questions

**Type**: Task
**Effort**: Small

Verify the full game loop works by opening 3+ browser tabs, joining the same room, and playing through a round of hardcoded questions.

**Acceptance criteria**:
- Open 3 browser tabs to `localhost:8080`
- All 3 join the same room and appear in the lobby
- Game starts, questions cycle through, scores update
- Final leaderboard shows correct rankings
- Room cleans up after game ends
- No crashes, no hung states

**Deliverables**:
- Hardcoded test question set (5 questions) embedded in server.js
- Any bug fixes found during testing
