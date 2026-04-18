# WP-3: Update All require() and __dirname Paths

**ADR**: [005 — Module Separation: Quiz and QR](../../adr/005-module-separation-quiz-qr.md)
**Status**: Pending
**Effort**: Small (mechanical, but each one matters)
**Depends on**: WP-1 (files moved), WP-2 (handlers created)

---

## Objective

Fix every broken `require()` and `__dirname`-relative path after the file moves. This is the most error-prone WP — one missed path = runtime crash.

## Complete Path Update Inventory

### 3.1 — server.js require() updates

All on lines 10–30 of server.js:

| Line | Old | New | Why |
|------|-----|-----|-----|
| 19 | `require('./game')` | `require('./quiz/game')` | game.js moved to quiz/ |
| 20 | `require('./auth')` | `require('./auth')` | **No change** — auth stays at root |
| 21 | `require('./highscores')` | `require('./quiz/highscores')` | highscores.js moved to quiz/ |
| 29 | `require('./quiz-bot')` | `require('./bot')` | Renamed quiz-bot.js → bot.js |
| 30 | `require('./game')` (second import) | `require('./quiz/game')` | Same as line 19 |

**Total: 4 path changes in server.js requires.**

### 3.2 — server.js static file path updates

| Line | Old | New |
|------|-----|-----|
| 71 | `path.join(__dirname, 'index.html')` | `path.join(__dirname, 'web', 'index.html')` |
| 97 | `path.join(__dirname, 'style.css')` | `path.join(__dirname, 'web', 'style.css')` |
| 102 | `path.join(__dirname, 'client.js')` | `path.join(__dirname, 'web', 'client.js')` |
| 200 | `path.join(__dirname, 'index.html')` | `path.join(__dirname, 'web', 'index.html')` |

**Total: 4 path changes in server.js static serving.**

### 3.3 — bot.js require() updates

File was renamed from `quiz-bot.js` → `bot.js` in WP-1.

| Line | Old | New | Notes |
|------|-----|-----|-------|
| 5 | `require('./config')` | `require('./config')` | **No change** |
| 6 | `require('./highscores')` | `require('./quiz/highscores')` | highscores moved |
| 7 | `require('./qr-render')` | **Remove** | QR rendering is now in qr/handler.js |

Add new requires (after WP-2):
```javascript
const qrHandler = require('./qr/handler');
const quizHandler = require('./quiz/handler');
```

**Total: 1 path change + 1 removal + 2 additions.**

### 3.4 — quiz/game.js require() updates

game.js moves from `apps/trivia/` to `apps/trivia/quiz/`:

| Line | Old | New |
|------|-----|-----|
| 22 | `require('./config')` | `require('../config')` |
| 29 | `require('./gemini')` | `require('./gemini')` | **No change** — gemini.js is in same quiz/ dir |
| 30 | `require('./highscores')` | `require('./highscores')` | **No change** — same dir |

**Total: 1 path change in game.js.**

### 3.5 — quiz/gemini.js require() and __dirname updates

gemini.js moves from `apps/trivia/` to `apps/trivia/quiz/`:

| Line | Old | New | Type |
|------|-----|-----|------|
| 5 | `require('./config')` | `require('../config')` | require |
| 247 | `path.join(__dirname, 'questions.json')` | `path.join(__dirname, '..', 'questions.json')` | __dirname |

**Total: 2 path changes in gemini.js.**

### 3.6 — quiz/highscores.js __dirname update

highscores.js moves from `apps/trivia/` to `apps/trivia/quiz/`:

| Line | Old | New |
|------|-----|-----|
| 6 | `path.join(__dirname, 'highscores.json')` | `path.join(__dirname, '..', 'highscores.json')` |

**Total: 1 path change in highscores.js.**

### 3.7 — qr/qr-render.js require() and __dirname updates

qr-render.js moves from `apps/trivia/` to `apps/trivia/qr/`:

| Line | Old | New | Notes |
|------|-----|-----|-------|
| 6 | `require('./qr-encode')` | `require('./qr-encode')` | **No change** — same dir |
| 7 | `require('./png-encode')` | `require('./png-encode')` | **No change** — same dir |
| 23 | `path.join(__dirname, 'atlas-logo.png')` | `path.join(__dirname, 'atlas-logo.png')` | **No change** — logo moved to qr/ too |

**Total: 0 changes in qr-render.js.** Everything is co-located.

### 3.8 — Rename identifiers in server.js (to match bot.js renames from WP-2)

After WP-2 renames the exports of `bot.js`, the import aliases in `server.js` must match:

| Line | Old | New |
|------|-----|-----|
| 22–29 | `const { sendQuizBot, startQuizBot, ..., getQuizBotToken, setDeps: setQuizBotDeps } = require('./quiz-bot');` | `const { sendBot, startBot, ..., getBotToken, setDeps: setBotDeps } = require('./bot');` |
| 30 | `const { setQuizBotDeps: setGameQuizBotDeps } = require('./game');` | `const { setBotDeps: setGameBotDeps } = require('./quiz/game');` |
| 35 | `setQuizBotDeps({ ... });` | `setBotDeps({ ... });` |
| 38–44 | `setGameQuizBotDeps({ sendQuizBot, ..., getQuizBotToken, ... });` | `setGameBotDeps({ sendBot, ..., getBotToken, ... });` |
| 387 | `startQuizBot();` | `startBot();` |

**Total: 5 identifier updates in server.js.**

### 3.9 — Rename identifiers in quiz/game.js (to match bot.js renames)

`game.js` receives bot functions via dependency injection. The injected variable names and the export name must be updated:

| Line | Old | New |
|------|-----|-----|
| 90 | `function setQuizBotDeps({ sendQuizBot, ..., getQuizBotToken, ... })` | `function setBotDeps({ sendBot, ..., getBotToken, ... })` |
| 91–95 | `_sendQuizBot = sendQuizBot;` etc. | `_sendBot = sendBot;` etc. |
| ~675 | `module.exports = { ..., setQuizBotDeps }` | `module.exports = { ..., setBotDeps }` |
| all | Internal references: `_sendQuizBot(...)`, `_getQuizBotToken()` | `_sendBot(...)`, `_getBotToken()` |

Use `grep -n 'QuizBot\|quizBot' quiz/game.js` to find all occurrences. Expect ~10–15 identifier renames within `game.js`.

**Total: ~12 identifier renames in game.js.**

### 3.10 — Update DI wiring in server.js

The dependency injection calls in `server.js` are the glue between modules. After handler extraction (WP-2), some dependencies that were injected into `bot.js` now need to reach the handlers. Verify the full wiring:

**bot.js `setDeps()`** receives from server.js:
- `getOrCreateRoom` — forwarded to `quiz/handler.js`
- `getHighscores` — forwarded to `quiz/handler.js`
- `readAtlasUsage` — used by `handleCostsCommand()` (stays in bot.js)

**quiz/game.js `setBotDeps()`** receives from server.js:
- `sendBot` — calls Telegram API from game events
- `getLastResultsMessage` — tracks results message for cleanup
- `setLastResultsMessage` — updates tracked message
- `getBotToken` — used for Telegram API URL construction
- `readAtlasUsage` — cost tracking

The circular dependency (`game.js ↔ bot.js`) is resolved the same way as before: `server.js` requires both, then injects cross-references after both are loaded. The only change is the path (`require('./quiz/game')`) and the identifier names.

## Summary

| File | require() changes | __dirname changes | Identifier renames | Total |
|------|:-----------------:|:-----------------:|:------------------:|:-----:|
| server.js | 4 | 4 | ~8 | **~16** |
| bot.js | 2 + 2 new | 0 | *(done in WP-2)* | **4** |
| quiz/game.js | 1 | 0 | ~12 | **~13** |
| quiz/gemini.js | 1 | 1 | 0 | **2** |
| quiz/highscores.js | 0 | 1 | 0 | **1** |
| qr/qr-render.js | 0 | 0 | 0 | **0** |

**Grand total: ~36 edits across 5 files.** The increase from the original 16 is due to the identifier renames (which are mechanical find-and-replace). qr/ remains completely self-contained with zero changes needed.

## Verification

```bash
# Quick syntax check — every require must resolve
node -e "require('./apps/trivia/server')" 2>&1 | head -5

# Or check individually:
node -e "require('./apps/trivia/quiz/game')"
node -e "require('./apps/trivia/quiz/gemini')"
node -e "require('./apps/trivia/quiz/highscores')"
node -e "require('./apps/trivia/qr/qr-render')"
```

## Gotchas

1. **Dynamic require in /quiz-stop handler**: The original `quiz-bot.js` line 220 has `require('./game')` inside a function. After WP-2 this moves to `quiz/handler.js` where `./game` resolves correctly. If WP-2 is skipped, this must change to `require('./quiz/game')` in `bot.js`.

2. **highscores.json creation**: `highscores.js` creates this file if it doesn't exist. After the `__dirname` fix, it will still create it at `apps/trivia/highscores.json` (correct). Verify this with a fresh start.

3. **questions.json path**: Read-only, but a wrong path causes the fallback question bank to silently fail (caught by try/catch in gemini.js). Test by temporarily renaming the file and checking logs.
