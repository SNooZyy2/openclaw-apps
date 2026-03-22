# WP-4: AI Integration

**Depends on**: WP-2 (game server to plug into)
**Enables**: WP-5 (Bot integration), WP-6 (Polish)

## Goal

Replace hardcoded test questions with live AI-generated content. After this WP, the game server calls Gemini to generate topic-specific questions, commentary, and game summaries.

---

## Issues

### 4.1 — Gemini API client

**Type**: Feature
**Effort**: Small

Minimal Gemini API wrapper using native `fetch()` — no SDK.

**Acceptance criteria**:
- Single function: `async callGemini(prompt, options)` → parsed response text
- Uses `GEMINI_API_KEY` from environment
- Configurable model (default `gemini-2.5-flash`)
- Handles HTTP errors: retries once on 429/500/503, throws on persistent failure
- Request timeout: 15 seconds
- Returns raw text (caller handles JSON parsing)
- Logs request/response times for debugging (not full payloads)

**Deliverables**:
- `callGemini()` function in `server.js`

---

### 4.2 — Question generation

**Type**: Feature
**Effort**: Medium

Generate a full round of trivia questions from a single API call.

**Acceptance criteria**:
- Function: `async generateQuestions(topic, count)` → array of question objects
- Prompt produces valid JSON array with: question, 4 options, correct index, difficulty, fun_fact
- Validates response: checks JSON structure, exactly 4 options per question, correct index in range
- Malformed individual questions are dropped (game continues with fewer questions rather than crashing)
- If entire response is unparseable: falls back to `questions.json` bank
- Topic defaults to "General Knowledge" if not specified
- Tested with at least 5 different topics to verify quality and format consistency

**Deliverables**:
- `generateQuestions()` function in `server.js`
- Prompt template as a constant at top of file

---

### 4.3 — Fallback question bank

**Type**: Feature
**Effort**: Small

Hardcoded questions for when the AI is unavailable.

**Acceptance criteria**:
- `questions.json` contains 30+ questions across 5+ categories
- Same schema as AI-generated questions (question, options, correct, difficulty, fun_fact)
- Categories: Science, History, Geography, Pop Culture, Technology (minimum)
- Bank is shuffled and sliced per game (no repeat questions within a session)
- Loaded at server start, not on every request

**Deliverables**:
- `apps/trivia/questions.json`

---

### 4.4 — AI commentary generation

**Type**: Feature
**Effort**: Small

Generate short, personality-driven one-liners after each question based on game state.

**Acceptance criteria**:
- Function: `async generateCommentary(gameState)` → string
- Input: who answered, who got it right, streaks, score gaps, question difficulty
- Output: single sentence, casual/witty tone, references players by name
- Batch option: generate all commentary lines upfront with the questions (1 API call total) to stay within rate limits
- Template fallback if API fails: pool of 15+ generic lines like "{player} is unstoppable!", "That was a tough one.", "Nobody? Really?"
- Commentary is optional — game never blocks waiting for it

**Deliverables**:
- `generateCommentary()` function in `server.js`
- Template fallback pool as a constant

---

### 4.5 — Game summary generation

**Type**: Feature
**Effort**: Small

Generate a rich text summary after the game ends, suitable for Atlas to post in the Telegram group.

**Acceptance criteria**:
- Function: `async generateSummary(gameResults)` → string
- Input: final standings, per-question stats, streaks, topic
- Output: 3-5 lines of text with final rankings, superlatives ("Speed Demon", "Comeback Kid"), and a closing quip
- Formatted for Telegram (plain text or basic Markdown — no HTML)
- Template fallback: simple standings list if API fails
- Returned as part of the `game_over` server state and available via REST API

**Deliverables**:
- `generateSummary()` function in `server.js`
- Template fallback
