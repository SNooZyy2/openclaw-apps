# WP-2: Extract Command Handlers into Feature Handlers

**ADR**: [005 — Module Separation: Quiz and QR](../../adr/005-module-separation-quiz-qr.md)
**Status**: Pending
**Effort**: Medium
**Depends on**: WP-1 (directories exist)

---

## Objective

Split `bot.js` (formerly `quiz-bot.js`, 298 LOC) into a thin router + two feature handlers. After this, quiz logic lives in `quiz/` and QR logic lives in `qr/`, and `bot.js` is just the Telegram polling loop.

## Current State of bot.js (formerly quiz-bot.js)

| Lines | Old Name | New Name | Feature |
|-------|----------|----------|---------|
| 13–20 | `sendQuizBot()` | `sendBot()` | Shared — Telegram API wrapper |
| 22–34 | `sendQuizBotPhoto()` | `sendBotPhoto()` | QR — FormData photo upload |
| 36–66 | `handleQrCommand()` | *(extracted to qr/handler.js)* | QR — generate + send QR code |
| 68–74 | `get/setLastResultsMessage` | *(no rename)* | Shared — state accessors |
| 76–78 | `getQuizBotToken()` | `getBotToken()` | Shared — token accessor |
| 85–89 | `setDeps()` | *(no rename)* | Shared — dependency injection |
| 91–127 | `handleCostsCommand()` | *(no rename)* | Shared — /costs display |
| 129–158 | `handleQuizCommand()` | *(extracted to quiz/handler.js)* | Quiz — room creation |
| 160–252 | `pollQuizBot()` | `pollBot()` | Shared — polling loop + dispatch |
| 254–287 | `startQuizBot()` | `startBot()` | Shared — bot init + loop |
| 9 | `QUIZ_BOT_TOKEN` | `BOT_TOKEN` | Shared — env var constant |
| 10 | `quizBotOffset` | `botOffset` | Shared — polling state |

## Tasks

### 2.1 — Create `qr/handler.js`

Extract from `bot.js`:
- `sendBotPhoto()` (lines 22–34, renamed from `sendQuizBotPhoto`)
- `handleQrCommand()` (lines 36–66)

The handler receives `sendBot` as a dependency (for error messages) since that stays in the router.

```javascript
// qr/handler.js
const { renderAtlasQrPng } = require('./qr-render');

let _sendBot, _sendBotPhoto;

function setDeps({ sendBot, sendBotPhoto }) {
  _sendBot = sendBot;
  _sendBotPhoto = sendBotPhoto;
}

async function handleQrCommand(chatId, input, messageId) {
  // ... extracted from bot.js lines 36–66
  // Uses _sendBot for error messages, _sendBotPhoto for QR image
}

module.exports = { handleQrCommand, setDeps };
```

**Key detail**: `sendBotPhoto` uses `FormData` + `Blob` (Node 22 built-ins). It also needs the bot token — pass via `getBotToken()` or inject it.

**Decision**: Move `sendBotPhoto` into `qr/handler.js` since it's only used for QR photos. It needs the token, so inject it via `setDeps`.

### 2.2 — Create `quiz/handler.js`

Extract from `bot.js`:
- `handleQuizCommand()` (lines 129–158)
- The `/quiz-reset` logic (lines 200–211 in `pollBot`)
- The `/quiz-stop` logic (lines 214–232 in `pollBot`)

```javascript
// quiz/handler.js
const { saveHighscores } = require('./highscores');

let _getOrCreateRoom, _getHighscores, _sendBot;

function setDeps({ getOrCreateRoom, getHighscores, sendBot }) {
  _getOrCreateRoom = getOrCreateRoom;
  _getHighscores = getHighscores;
  _sendBot = sendBot;
}

async function handleQuizCommand(chatId, topic, messageId) {
  // ... extracted from bot.js lines 129–158
}

async function handleQuizReset(chatId, userId) {
  // ... extracted from pollBot lines 200–211
}

async function handleQuizStop(chatId, userId) {
  // ... extracted from pollBot lines 214–232
  // NOTE: line 220 has a dynamic require('./game') — stays './game'
  // since handler.js and game.js are in the same quiz/ directory
}

module.exports = { handleQuizCommand, handleQuizReset, handleQuizStop, setDeps };
```

**Key detail**: The `/quiz-stop` handler (line 220) does `const { rooms } = require('./game')` — a dynamic (lazy) require. Since both `handler.js` and `game.js` are now in `quiz/`, this path stays `./game` and just works.

### 2.3 — Slim down bot.js to a router

After extraction, `bot.js` keeps:
- `sendBot()` (lines 13–20, renamed from `sendQuizBot`) — shared Telegram API wrapper
- `get/setLastResultsMessage()`, `getBotToken()` (lines 68–78) — shared state
- `handleCostsCommand()` (lines 91–127) — shared `/costs` handler (not quiz or QR)
- `pollBot()` (renamed from `pollQuizBot`) — dispatch is now just handler calls:

```javascript
// In pollBot(), replace inline logic with handler calls:
const qrHandler = require('./qr/handler');
const quizHandler = require('./quiz/handler');

// /qr
if (text === '/qr' || ...) {
  await sendBot('sendMessage', { chat_id: chatId, text: usage });
} else if (text.startsWith('/qr ')) {
  await qrHandler.handleQrCommand(chatId, input, messageId);
}
// /quiz
else if (text.startsWith('/quiz') || text.startsWith('/start')) {
  await quizHandler.handleQuizCommand(chatId, topic, messageId);
}
// /quiz-reset
else if (...) {
  await quizHandler.handleQuizReset(chatId, userId);
}
// /quiz-stop
else if (...) {
  await quizHandler.handleQuizStop(chatId, userId);
}
```

- `startBot()` (renamed from `startQuizBot`) — unchanged logic
- `setDeps()` — updated to also wire dependencies into handlers

### 2.4 — Wire handler dependencies

In `bot.js`'s `setDeps()`, forward dependencies to handlers:

```javascript
function setDeps({ getOrCreateRoom, getHighscores, readAtlasUsage }) {
  _getOrCreateRoom = getOrCreateRoom;  // still needed for cost display
  _getHighscores = getHighscores;
  _readAtlasUsage = readAtlasUsage;

  quizHandler.setDeps({ getOrCreateRoom, getHighscores, sendBot });
  qrHandler.setDeps({ sendBot, sendBotPhoto });
}
```

### 2.5 — Rename internal identifiers in bot.js

Rename all "QuizBot" identifiers to match the new file name. This is a find-and-replace within `bot.js` only:

| Old | New | Occurrences |
|-----|-----|:-----------:|
| `QUIZ_BOT_TOKEN` | `BOT_TOKEN` | ~3 (declaration + usages) |
| `quizBotOffset` | `botOffset` | ~3 |
| `sendQuizBot` | `sendBot` | ~8 (function + calls + export) |
| `sendQuizBotPhoto` | `sendBotPhoto` | ~3 (removed to qr/handler, but update export name) |
| `pollQuizBot` | `pollBot` | ~3 |
| `startQuizBot` | `startBot` | ~2 (function + export) |
| `getQuizBotToken` | `getBotToken` | ~2 |

Update `module.exports` at the bottom of `bot.js`:

```javascript
module.exports = {
  sendBot,
  startBot,
  getLastResultsMessage,
  setLastResultsMessage,
  getBotToken,
  setDeps
};
```

Note: `sendBotPhoto` is removed from exports — it now lives in `qr/handler.js`.

## Files Created

| File | Lines (est.) | Content |
|------|-------------|---------|
| `quiz/handler.js` | ~90 | handleQuizCommand, handleQuizReset, handleQuizStop, setDeps |
| `qr/handler.js` | ~55 | handleQrCommand, sendBotPhoto, setDeps |

## Files Modified

| File | Change |
|------|--------|
| `bot.js` | Remove extracted functions, rename identifiers, add handler requires, update dispatch + exports |

## Verification

- `bot.js` should drop from ~298 to ~180 LOC
- `grep -r 'QuizBot\|quizBot' apps/trivia/*.js apps/trivia/**/*.js` should return **zero** matches (all renamed)
- `grep -r 'handleQrCommand\|handleQuizCommand' apps/trivia/` should show them only in handler files + the router dispatch
