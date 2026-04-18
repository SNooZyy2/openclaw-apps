# ADR-009: Thread-Aware Quiz Results Posting

**Status**: Implemented
**Date**: 2026-04-18
**Author**: snoozyy

---

## Context

The Telegram group now uses **topics** (forum mode). When a user sends `/quiz` in a specific thread (e.g. `#games`), the bot should post the results back to that same thread. Currently, all bot messages — invite, results, errors — use only `chat_id` and ignore the thread context entirely.

### How Telegram Topics Work

When a group enables topics, every message belongs to a `message_thread_id`. The "General" topic may or may not include a thread ID in incoming updates (behavior varies by group configuration). Custom topics always have a unique numeric thread ID. The Telegram Bot API exposes this on incoming messages:

```json
{
  "message": {
    "chat": { "id": -1003889708134, "is_forum": true },
    "message_thread_id": 12345,
    "text": "/quiz Animals"
  }
}
```

To reply in the correct thread, outgoing `sendMessage` calls must include `message_thread_id`. Using `reply_to_message_id` alone does NOT place the message in the correct topic — it only creates a reply chain within whichever topic the message is sent to. Without `message_thread_id`, the message goes to General or fails silently.

### Current Message Flow — Quiz Lifecycle

Two outgoing `sendMessage` calls are tied to the quiz game lifecycle:

| Step | File | What happens | Missing thread ID? |
|------|------|-------------|---------------------|
| 1. Invite | `quiz/handler.js` | `sendMessage` with "Join Atlas Quiz" inline keyboard | Yes |
| 2. Delete invite | `quiz/game.js` | `deleteMessage` on the invite when game ends | N/A (`message_id` is sufficient) |
| 3. Post results | `quiz/game.js` | `sendMessage` with game results | Yes |
| 4. Delete prev results | `quiz/handler.js` | `deleteMessage` on previous game's results | N/A (`message_id` is sufficient) |

Steps 1 and 3 are the problem — both send messages without `message_thread_id`, so they land in General instead of the thread where `/quiz` was invoked.

### Full Audit of `sendMessage` / `sendPhoto` Call Sites

Beyond the quiz lifecycle, every outgoing message the bot sends needs thread awareness:

| # | File | Function / Context | Type |
|---|------|--------------------|------|
| 1 | `bot.js` | `/qr` bare usage reply (inline) | `sendMessage` |
| 2 | `bot.js` | `handleCostsCommand()` — separate function, needs `threadId` param | `sendMessage` (×2: success + error) |
| 3 | `quiz/handler.js` | `handleQuizCommand()` — quiz invite | `sendMessage` |
| 4 | `quiz/handler.js` | `handleQuizReset()` — owner response | `sendMessage` |
| 5 | `quiz/handler.js` | `handleQuizStop()` — owner response | `sendMessage` |
| 6 | `quiz/game.js` | `endGame()` — results posting | `sendMessage` |
| 7 | `qr/handler.js` | `sendBotPhoto()` — QR code image | `sendPhoto` via raw `fetch` + `FormData` |
| 8 | `qr/handler.js` | `handleQrCommand()` — error/fallback messages | `sendMessage` (×2) |

**10 call sites** across **4 files**. The `qr/handler.js` case is notable: `sendBotPhoto` uses raw `fetch` with `FormData` (not the `sendBot` JSON wrapper), so `message_thread_id` must be appended as a form field, not spread into a JSON body.

### Data Flow

The thread ID must travel from the incoming `/quiz` command through several layers:

```
bot.js (poll)
  → msg.message_thread_id captured from Telegram update
  → passed to quizHandler.handleQuizCommand()
    → stored on room.telegramMessage alongside chatId and messageId
      → used in game.js endGame() when posting results
```

Currently `room.telegramMessage` is `{ chatId, messageId }`. It needs to become `{ chatId, messageId, threadId }`.

## Decision

Thread-awareness is added by passing `message_thread_id` through the existing data flow. No new abstractions — just an additional field threaded through the call chain.

### Changes Required

#### 1. `bot.js` — Capture thread ID, pass to all handlers

Extract `msg.message_thread_id` once at the top of the message loop, pass it to every command handler and inline `sendMessage` call.

```js
const threadId = msg.message_thread_id || null;
```

The `handleCostsCommand(chatId, messageId)` function signature becomes `handleCostsCommand(chatId, messageId, threadId)`, and both its `sendMessage` calls gain the thread spread.

Every inline `sendMessage` in the poll loop (e.g. `/qr` bare usage) gets:
```js
...(threadId && { message_thread_id: threadId })
```

#### 2. `quiz/handler.js` — Forward thread ID to invite, reset, stop

All three exported handlers gain a `threadId` parameter:

- `handleQuizCommand(chatId, topic, messageId, threadId)` — spreads into invite `sendMessage` and stores on `room.telegramMessage`
- `handleQuizReset(chatId, userId, messageId, threadId)` — spreads into response
- `handleQuizStop(chatId, userId, messageId, threadId)` — spreads into response

```js
room.telegramMessage = { chatId, messageId: result.result.message_id, threadId };
```

#### 3. `quiz/game.js` — Use thread ID when posting results

In `endGame()`, read `this.telegramMessage.threadId` and spread into the results `sendMessage`:

```js
_sendBot('sendMessage', {
  chat_id: chatId,
  text,
  disable_notification: true,
  ...(this.telegramMessage.threadId && { message_thread_id: this.telegramMessage.threadId })
});
```

#### 4. `qr/handler.js` — Thread-aware QR responses and photo upload

`handleQrCommand(chatId, input, messageId)` becomes `handleQrCommand(chatId, input, messageId, threadId)`.

The `sendBotPhoto` function uses `FormData`, so thread ID is appended as a form field:
```js
if (threadId) form.append('message_thread_id', String(threadId));
```

All `sendMessage` calls in error paths get the same spread pattern.

### What Does NOT Need to Change

- **`deleteMessage` calls** — `message_id` is globally unique within a chat; thread ID is irrelevant for deletion.
- **`lastResultsMessage`** — Only used for deletion, so `{ chatId, messageId }` is sufficient.
- **WebSocket / game client** — Thread context is a Telegram-only concern. The web app never sees it.
- **`server.js`** — No changes. Thread ID lives entirely in the bot → handler → room → endGame path.

## Consequences

### Positive

- Quiz games started in `#games` post results back to `#games`, not General.
- All bot responses (`/costs`, `/qr`, error messages) reply in the correct thread.
- No behavioral change for non-forum groups — `message_thread_id` is omitted when `null`.

### Negative

- Every command handler gains a `threadId` parameter. Mechanical but touches several function signatures.

### Risks

- **None significant.** `message_thread_id` is ignored by Telegram for non-forum groups, so this is fully backwards-compatible. If a thread is deleted between game start and end, the `sendMessage` with the stale thread ID will fail — the existing `.catch(() => {})` handles this gracefully.

## Implementation Estimate

4 files, 10 call sites, ~25 lines changed. No new dependencies. Smoke test: start a quiz in a non-General thread, verify invite and results both land in that thread.
