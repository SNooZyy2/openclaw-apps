# WP-1: Create Directory Structure and Move Files

**ADR**: [005 — Module Separation: Quiz and QR](../../adr/005-module-separation-quiz-qr.md)
**Status**: Pending
**Effort**: Small
**Depends on**: Nothing (do this first)

---

## Objective

Create the `quiz/`, `qr/`, and `web/` subdirectories and move files into them. No code changes — just `git mv`. This isolates the blast radius: if anything breaks, it's purely a path issue, not a logic issue.

## Tasks

### 1.1 — Create subdirectories

```bash
cd apps/trivia
mkdir quiz qr web
```

### 1.2 — Move quiz files

```bash
git mv game.js quiz/
git mv gemini.js quiz/
git mv highscores.js quiz/
```

**Do NOT move**: `config.js` (shared), `auth.js` (shared). `quiz-bot.js` stays at root but is renamed in task 1.5.

### 1.3 — Move QR files

```bash
git mv qr-encode.js qr/
git mv qr-render.js qr/
git mv png-encode.js qr/
git mv atlas-logo.png qr/
```

### 1.4 — Move web frontend files

```bash
git mv index.html web/
git mv style.css web/
git mv client.js web/
```

### 1.5 — Rename quiz-bot.js → bot.js

```bash
git mv quiz-bot.js bot.js
```

The file is the Telegram bot layer (polling, routing, shared utilities), not quiz-specific. The new name matches the layer convention: `server.js` (HTTP), `bot.js` (Telegram), `config.js` (shared), `<feature>/handler.js` (commands).

### 1.6 — Data files stay at root

These files use `__dirname`-relative paths and are written to at runtime. Keep them at `apps/trivia/`:

- `highscores.json` — written by `highscores.js`
- `questions.json` — read by `gemini.js`

## Files Touched

Only `git mv` — no edits. 10 files moved, 1 file renamed, 0 files modified.

## Verification

```bash
# Confirm structure
find apps/trivia -type f -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.png' | sort
```

Expected:
```
apps/trivia/auth.js
apps/trivia/bot.js
apps/trivia/config.js
apps/trivia/qr/atlas-logo.png
apps/trivia/qr/png-encode.js
apps/trivia/qr/qr-encode.js
apps/trivia/qr/qr-render.js
apps/trivia/quiz/game.js
apps/trivia/quiz/gemini.js
apps/trivia/quiz/highscores.js
apps/trivia/server.js
apps/trivia/web/client.js
apps/trivia/web/index.html
apps/trivia/web/style.css
```

**Note**: The app will be broken after this WP until WP-3 (path updates) is completed. That's expected — WP-1 and WP-3 should be done together in a single commit.
