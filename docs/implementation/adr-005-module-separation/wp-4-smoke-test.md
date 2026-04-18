# WP-4: Smoke Test All Features

**ADR**: [005 — Module Separation: Quiz and QR](../../adr/005-module-separation-quiz-qr.md)
**Status**: Pending
**Effort**: Small
**Depends on**: WP-1 + WP-2 + WP-3 (all path work complete)

---

## Objective

Verify every user-facing feature works after the restructuring. The code logic is unchanged — only paths moved and identifiers renamed — so failures here mean a missed path update or stale identifier.

## Test Plan

### 4.0 — Stale identifier check (before starting the service)

```bash
cd ~/openclaw-apps
grep -rn 'QuizBot\|quizBot\|QUIZ_BOT' apps/trivia/*.js apps/trivia/quiz/*.js apps/trivia/qr/*.js
```

**Pass criteria**: Zero matches. Every `QuizBot`/`quizBot`/`QUIZ_BOT` identifier should have been renamed in WP-2 and WP-3. If any remain, fix them before proceeding.

**Exception**: `QUIZ_BOT_TOKEN` in the environment (`process.env.QUIZ_BOT_TOKEN`) is an external env var name — the code reads it but stores it as `BOT_TOKEN`. The `process.env.QUIZ_BOT_TOKEN` reference is acceptable (env var names are external, not ours to rename).

### 4.1 — Service starts clean

```bash
sudo systemctl restart atlas-quiz-bot
sleep 2
sudo systemctl status atlas-quiz-bot --no-pager
# Must show: active (running)
# Check for require() errors in logs:
tail -20 ~/openclaw-apps/apps/trivia/server.log
```

**Pass criteria**: No `MODULE_NOT_FOUND` errors. Service stays running for >10 seconds.

### 4.2 — /qr command

In Telegram group, send:
```
/qr https://example.com
```

**Pass criteria**:
- Bot replies with a photo (PNG QR code)
- QR code is scannable (use phone camera)
- Atlas logo visible in center
- No error message from bot

Also test bare `/qr` (no args) — should reply with usage text.

### 4.3 — /quiz command

In Telegram group, send:
```
/quiz test
```

**Pass criteria**:
- Bot replies with join link (inline keyboard button)
- Clicking the link opens the Mini App in Telegram
- Mini App loads (no blank screen, no JS errors)
- Game lobby shows player name and avatar

### 4.4 — Mini App static files

```bash
# From the server itself:
curl -s http://localhost:8080/ | head -5         # Should return HTML
curl -s http://localhost:8080/style.css | head -5  # Should return CSS
curl -s http://localhost:8080/client.js | head -5  # Should return JS
```

**Pass criteria**: All three return correct content types, not 404.

### 4.5 — /costs command

In Telegram group, send:
```
/costs
```

**Pass criteria**: Bot replies with cost breakdown text (token counts, EUR/USD estimates).

### 4.6 — /quiz-reset (owner only)

In Telegram group (as owner), send:
```
/quiz-reset
```

**Pass criteria**: Bot confirms highscores reset. `highscores.json` is cleared.

### 4.7 — Fallback question bank

```bash
# Verify questions.json is still found:
node -e "
  const path = require('path');
  const fs = require('fs');
  const p = path.join(__dirname, 'apps/trivia/quiz/gemini.js');
  // Just verify the path resolution logic:
  const quizDir = path.dirname(p);
  const qFile = path.join(quizDir, '..', 'questions.json');
  console.log('Path:', qFile);
  console.log('Exists:', fs.existsSync(qFile));
"
```

### 4.8 — Health endpoint

```bash
curl -s https://srv1176342.taile65f65.ts.net/health
```

**Pass criteria**: Returns JSON health status (200 OK).

## Failure Runbook

If any test fails:

1. Check `server.log` for the exact error (almost certainly `MODULE_NOT_FOUND` or `ENOENT`)
2. The error message includes the attempted path — compare against the path update table in WP-3
3. Fix the path, restart: `sudo systemctl restart atlas-quiz-bot`
4. Re-run the failing test

If the Mini App loads but is blank/broken, check browser console (Telegram → three dots → "Inspect" if on desktop) for 404 errors on `style.css` or `client.js`.

If you see `TypeError: ... is not a function`, a renamed identifier was missed. Run the stale identifier check from 4.0 and cross-reference with the rename tables in WP-2 (task 2.5) and WP-3 (tasks 3.8, 3.9).
