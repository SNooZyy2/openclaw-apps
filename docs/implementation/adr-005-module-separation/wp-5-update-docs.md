# WP-5: Update Documentation

**ADR**: [005 — Module Separation: Quiz and QR](../../adr/005-module-separation-quiz-qr.md)
**Status**: Pending
**Effort**: Small
**Depends on**: WP-4 (everything works)

---

## Objective

Update all documentation that references file paths or the directory structure so it matches the new layout.

**Note**: As of 2026-03-31, the doc structure was reorganized into three tiers:
- `CLAUDE.md` — slim conventions + pointers (loaded every task)
- `docs/masterplan.md` — active work + status (loaded and updated every task)
- `docs/project-context.md` — architecture + infra reference (loaded on demand)

The old CLAUDE.md content (architecture, bot config, directory structure, QR details) now lives in `project-context.md`. Tasks 5.1 and 5.2 below target `project-context.md`, not CLAUDE.md.

## Tasks

### 5.1 — Update project-context.md directory structure

The "Quiz Bot Architecture" section in `docs/project-context.md` does not yet reflect the new directory layout. After the module separation lands, update the file references to show:

```
apps/trivia/
  server.js         — HTTP + WebSocket entry point, dependency wiring
  bot.js            — Telegram polling loop + thin command router
  config.js         — Shared env vars, game timing, cost tracking
  auth.js           — Telegram initData HMAC verification
  quiz/
    handler.js      — /quiz, /quiz-reset, /quiz-stop command handlers
    game.js         — Quiz game room logic (state machine, players)
    gemini.js       — Gemini/Perplexity question generation
    highscores.js   — Leaderboard persistence
  qr/
    handler.js      — /qr command handler
    qr-encode.js    — QR Code Model 2 encoder (EC-H, GF(256), Reed-Solomon)
    qr-render.js    — ATLAS-themed QR renderer (logo compositing, neon glow)
    png-encode.js   — PNG encode/decode (RGBA, only node:zlib)
    atlas-logo.png  — 152×152 center logo for QR codes
  web/
    index.html      — Game frontend (Telegram Mini App)
    style.css       — Neon-terminal theme styles
    client.js       — Browser-side game client
  highscores.json   — Persistent leaderboard data
  questions.json    — Fallback question bank
  atlas-quiz-bot.service — systemd unit file
```

### 5.2 — Update project-context.md QR section

Update QR Code System references:
- `qr-encode.js` → `qr/qr-encode.js`
- `qr-render.js` → `qr/qr-render.js`
- `png-encode.js` → `qr/png-encode.js`
- `atlas-logo.png` → `qr/atlas-logo.png`

### 5.3 — Update docs/qr-command.md

Update any file path references to point to `qr/` subdirectory.

### 5.4 — Update docs/operations.md

Update file paths in the "File Locations" table:
- `apps/trivia/qr-encode.js` → `apps/trivia/qr/qr-encode.js`
- `apps/trivia/qr-render.js` → `apps/trivia/qr/qr-render.js`
- `apps/trivia/png-encode.js` → `apps/trivia/qr/png-encode.js`
- `apps/trivia/atlas-logo.png` → `apps/trivia/qr/atlas-logo.png`

The systemd service, port, and env vars are unchanged.

### 5.5 — Update docs/atlas-trivia-workflow.md

Update references to `bot.js` handling commands — it's now a router that delegates to `quiz/handler.js` and `qr/handler.js`. The `getOrCreateRoom` call is now in `quiz/handler.js`, not `bot.js`.

### 5.6 — Update implementation README

Already done (2026-03-31). ADR-005 entry was added to `docs/implementation/README.md`.

### 5.7 — Update masterplan.md

Mark all ADR-005 WPs as completed. Move ADR-005 from "Active" to "Completed Work" table.

## Files Modified

| File | Change |
|------|--------|
| `docs/project-context.md` | Directory structure + QR section path updates |
| `docs/qr-command.md` | File path references |
| `docs/operations.md` | File path references |
| `docs/atlas-trivia-workflow.md` | Handler delegation description |
| `docs/masterplan.md` | Mark ADR-005 complete |
