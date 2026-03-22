# WP-5: Bot Integration

**Depends on**: WP-2 (game server running), WP-4 (AI generates content)
**Enables**: WP-6 (Polish)

## Goal

Connect Atlas to the game server so the full loop works: user asks for a game in Telegram → Atlas creates the room → players join via Web App button → game plays → Atlas posts results back to chat.

---

## Issues

### 5.1 — REST API endpoints

**Type**: Feature
**Effort**: Small

HTTP endpoints on the game server that Atlas calls via exec/curl.

**Endpoints**:
```
POST /api/create-room    — Create a new game room
GET  /api/room/:code     — Get room status
GET  /api/results/:code  — Get final results after game ends
```

**Acceptance criteria**:
- `POST /api/create-room` accepts `{ topic, questionCount }`, returns `{ roomCode, joinUrl, status }`
  - `joinUrl` is the full HTTPS URL for the Web App button: `https://srv1176342.taile65f65.ts.net/game?room={code}`
  - Triggers question generation in the background (room enters LOBBY immediately, questions ready by game start)
- `GET /api/room/:code` returns `{ status, players, currentQuestion, totalQuestions }`
- `GET /api/results/:code` returns `{ standings, summary, stats }` (only available after GAME_OVER)
- All endpoints return JSON with appropriate HTTP status codes
- Invalid room codes return 404
- Endpoints are unauthenticated (demo scope — server is only accessible via localhost/Tailscale)

**Deliverables**:
- REST route handlers in `server.js`

---

### 5.2 — Atlas game creation workflow

**Type**: Documentation + Config
**Effort**: Medium

Define the exact exec commands and conversational flow Atlas uses to create and manage games. This becomes instructions that go into Atlas's workspace/tools configuration.

**The flow**:
1. User says "Atlas, start a trivia game about X"
2. Atlas calls: `curl -s http://localhost:8080/api/create-room -X POST -H 'Content-Type: application/json' -d '{"topic":"X","questionCount":7}'`
3. Atlas receives `{ roomCode, joinUrl }`
4. Atlas sends a message with the `InlineKeyboardButton`:
   ```
   web_app: { url: joinUrl }
   ```
5. Atlas optionally polls room status to announce player count
6. After game ends, Atlas calls `GET /api/results/:code` and posts the summary

**Acceptance criteria**:
- Atlas workflow documented step-by-step with exact curl commands
- Tested end-to-end: Atlas successfully creates room, sends button, retrieves results
- Workspace/tools doc snippet ready to paste into Atlas's TOOLS.md
- Error handling: what Atlas should say if the game server is down or room creation fails

**Deliverables**:
- `docs/atlas-trivia-workflow.md` — full workflow documentation
- TOOLS.md snippet for Atlas's workspace

---

### 5.3 — Results posting format

**Type**: Feature
**Effort**: Small

Define and implement the format of the results that Atlas posts back to the Telegram group after a game.

**Acceptance criteria**:
- Results endpoint returns a pre-formatted summary string (from WP-4.5) plus structured data
- Structured data includes: ranked player list (name, score, correct count), game topic, question count, duration
- Atlas can use either the pre-formatted summary (quick) or the structured data (to add its own spin)
- Tested: results look good when pasted into Telegram (no broken formatting)

**Deliverables**:
- Results response format in REST API
- Example output documented
