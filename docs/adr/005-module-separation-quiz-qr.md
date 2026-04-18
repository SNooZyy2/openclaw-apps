# ADR-005: Module Separation — Quiz and QR as Independent Features

**Status**: Proposed
**Date**: 2026-03-31
**Author**: snoozyy

---

## Context

The quiz bot (`quiz-bot.js`) currently handles two unrelated features through a single polling loop and shared module space. The file's name itself is misleading — it handles QR and cost commands too, not just quizzes.

1. **Quiz** — Multiplayer trivia game (`/quiz`, `/quiz-reset`, `/quiz-stop`, `/start`)
2. **QR** — ATLAS-branded QR code generator (`/qr`)
3. **Shared** — Cost tracking (`/costs`), Telegram API wrapper, bot lifecycle

All 11 `.js` files live flat in `apps/trivia/`. When working on quiz, every QR file is in the way. When working on QR, every game file is noise. There's no structural boundary — only naming conventions and programmer discipline.

### Why This Matters Now

Active development is shifting to quiz (game modes, scoring, new question sources). The QR feature is stable and complete (ADR-004 just shipped). Without separation, quiz changes carry risk of accidentally breaking QR through shared-state side effects, require path changes, or import confusion.

### Current File Inventory

| File | Feature | Lines | Notes |
|------|---------|------:|-------|
| `quiz-bot.js` | **Both** | 298 | Polling loop + command dispatch for /quiz AND /qr (misleading name) |
| `game.js` | Quiz | 676 | Room state machine, player management |
| `gemini.js` | Quiz | 355 | LLM question generation (Perplexity, Gemini, OpenRouter) |
| `highscores.js` | Quiz | 88 | Leaderboard persistence |
| `auth.js` | Quiz | 105 | Telegram initData HMAC verification |
| `qr-encode.js` | QR | 415 | QR Code Model 2 encoder (GF(256), Reed-Solomon) |
| `qr-render.js` | QR | 220 | ATLAS-themed PNG renderer with logo compositing |
| `png-encode.js` | QR | 163 | PNG encode/decode (RGBA, node:zlib only) |
| `config.js` | Shared | 63 | Env vars, game timing, cost tracking |
| `server.js` | Shared | 388 | HTTP + WebSocket server, dependency wiring |
| `client.js` | Web UI | 503 | Browser-side game client |

### The Coupling Points

The features connect through exactly **one file**: `quiz-bot.js`. It imports `qr-render.js` for the `/qr` handler and `game.js`/`highscores.js` for the `/quiz` handler. Beyond that, quiz and QR share zero code.

There is one circular dependency between `game.js` and `quiz-bot.js`, currently resolved via dependency injection in `server.js` (`setQuizBotDeps()` / `setGameQuizBotDeps()`). This pattern would survive any restructuring.

---

## Options Considered

### Option A: Subdirectory Split (Feature Folders)

Move files into feature-scoped subdirectories under `apps/trivia/`:

```
apps/trivia/
  server.js            ← HTTP + WebSocket entry point, dependency wiring
  bot.js               ← Telegram polling + command routing (renamed from quiz-bot.js)
  config.js            ← shared config
  auth.js              ← Telegram initData verification
  quiz/
    handler.js         ← /quiz, /quiz-reset, /quiz-stop command logic
    game.js
    gemini.js
    highscores.js
  qr/
    handler.js         ← /qr command logic
    qr-encode.js
    qr-render.js
    png-encode.js
    atlas-logo.png
  web/
    index.html
    style.css
    client.js
```

`quiz-bot.js` is renamed to `bot.js` (it's the bot layer, not quiz-specific) and becomes a thin router: parse command, delegate to `quiz/handler.js` or `qr/handler.js`.

**Pros:**
- Clear ownership boundaries — quiz and QR are visually and structurally separate
- Can work in `quiz/` without seeing QR files
- Feature folders are the industry standard for monorepo organization
- Each subdirectory is independently understandable
- Static assets (`atlas-logo.png`) live with the code that uses them

**Cons:**
- 13+ `require()` path updates across 4 files
- 3 `__dirname`-relative file paths break and need fixing (`highscores.json`, `questions.json`, `atlas-logo.png`)
- `game.js` has a dynamic `require('./game')` inside `/quiz-stop` handler that's easy to miss
- Slightly more complex mental model for newcomers (3 directories vs flat)
- One-time churn in git blame

**Risk:** Medium. Path updates are mechanical but the `__dirname` gotchas (`highscores.json`, `questions.json`, `atlas-logo.png`) could cause silent runtime failures if missed.

### Option B: Handler Extraction Only (Minimal Restructuring)

Keep the flat file layout. Extract quiz and QR command logic from `quiz-bot.js` into separate handler files:

```
apps/trivia/
  quiz-bot.js          ← polling loop + thin router only (not renamed)
  quiz-handler.js      ← /quiz, /quiz-reset, /quiz-stop
  qr-handler.js        ← /qr
  ... (everything else stays put)
```

**Pros:**
- Minimal disruption — only 1 file split, 2 new files
- Zero `__dirname` issues (nothing moves directories)
- No path updates in any other file
- Quiz and QR logic are separated at the code level
- Easy to review, easy to revert

**Cons:**
- 11 files still sit flat in one directory — visual clutter remains
- No structural enforcement of the boundary (just naming convention)
- Static assets like `atlas-logo.png` sit next to unrelated game files
- Doesn't address the growing file count problem as quiz evolves
- "We'll do the real restructuring later" — but will we?

**Risk:** Low. Almost nothing can break because no files move.

### Option C: Separate `apps/` Directories

Split into two top-level apps:

```
apps/
  quiz/               ← quiz game (server, bot, game logic, web UI)
    server.js
    quiz-bot.js
    game.js
    ...
  qr/                 ← QR generator (standalone service or library)
    qr-bot.js
    qr-encode.js
    qr-render.js
    png-encode.js
```

**Pros:**
- Maximum separation — each app is fully self-contained
- Matches the `apps/` directory philosophy ("each app is its own thing")
- Could run as separate processes if desired

**Cons:**
- QR and Quiz share one Telegram bot token and one polling loop — splitting the process means either:
  - Two bot tokens (two separate Telegram bots) — confusing for users
  - A shared polling proxy that routes to two services — over-engineered
- `config.js` would need to be duplicated or extracted to a shared location
- `/costs` command aggregates data from both features — splitting makes this harder
- `server.js` dependency injection wiring becomes cross-process coordination
- Significant deployment changes: two systemd services, two ports, two health checks
- Overkill for a 3,274-line codebase

**Risk:** High. The Telegram bot API fundamentally doesn't support two processes polling the same bot token. This forces either architectural gymnastics or user-facing changes (two bots).

### Option D: Do Nothing

Keep the flat layout. Use naming conventions and developer discipline.

**Pros:**
- Zero effort, zero risk
- Current codebase is only 3,274 lines — small enough to hold in your head
- No git blame churn

**Cons:**
- Quiz development requires ignoring 3 QR files and 1 PNG asset that have nothing to do with your work
- As quiz grows (new game modes, question types, scoring), the flat directory grows with it — and it's already 14 files
- No structural hint about which files belong to which feature
- Relies entirely on tribal knowledge

**Risk:** None now. Accumulating tech debt over time.

---

## Decision

**Option A (Subdirectory Split)** — with one modification: keep data files (`highscores.json`, `questions.json`) at the `trivia/` root to avoid `__dirname` path gymnastics, and move `atlas-logo.png` into `qr/` (updating the one path in `qr-render.js`).

### Why Not Option B?

Option B is tempting because it's low-risk. But it only solves half the problem — command logic is separated, but the directory is still a flat soup of 14+ files with no grouping. As quiz grows (which is the stated near-term plan), we'd end up doing Option A anyway but with more files to sort through.

### Why Not Option C?

The Telegram polling constraint kills it. One bot token = one polling loop. Splitting into separate processes would require either a webhook architecture (possible but heavy), a polling proxy, or two separate bots. None of these are justified for a project this size.

### Why Not Option D?

It's fine today. It won't be fine after 2-3 more quiz features land. The restructuring cost is lower now (14 files) than later (20+ files).

---

## Proposed Structure

```
apps/trivia/
  server.js              ← HTTP + WebSocket entry point, dependency wiring
  bot.js                 ← Telegram polling loop + thin command router (renamed from quiz-bot.js)
  config.js              ← Shared env vars, timing constants, cost tracking
  auth.js                ← Telegram initData verification
  highscores.json        ← Persistent leaderboard (stays at root)
  questions.json         ← Fallback question bank (stays at root)
  atlas-quiz-bot.service ← systemd unit
  package.json

  quiz/                  ← Quiz game feature
    handler.js           ← /quiz, /quiz-reset, /quiz-stop command handlers
    game.js              ← Room state machine, player management
    gemini.js            ← LLM question generation
    highscores.js        ← Leaderboard read/write

  qr/                    ← QR code feature
    handler.js           ← /qr command handler
    qr-encode.js         ← QR Code Model 2 encoder
    qr-render.js         ← ATLAS-themed PNG renderer
    png-encode.js        ← PNG encode/decode
    atlas-logo.png       ← Center logo for QR codes

  web/                   ← Telegram Mini App frontend
    index.html
    style.css
    client.js
```

### Naming Conventions

| Layer | File | Role |
|-------|------|------|
| HTTP | `server.js` | HTTP + WebSocket server, static files, dependency wiring |
| Bot | `bot.js` | Telegram long-polling, command routing, shared bot utilities |
| Config | `config.js` | Environment variables, constants, cost tracking |
| Auth | `auth.js` | Telegram initData HMAC verification |
| Feature entry | `<feature>/handler.js` | Command handlers — the entry point for each feature |
| Feature internals | `<feature>/<name>.js` | Domain logic, only imported by the feature's own handler or siblings |

**Rules**:
- `bot.js` is feature-agnostic — it routes, it doesn't know game rules or QR encoding
- `handler.js` is always the feature's public interface — the only file `bot.js` imports from a feature directory
- Feature internals (`game.js`, `qr-encode.js`, etc.) are never imported from outside their directory
- Shared files at root (`config.js`, `auth.js`) are imported by anyone

### Routing Pattern

`bot.js` (renamed from `quiz-bot.js`) is a dispatcher:

```javascript
// bot.js — thin router
const quizHandler = require('./quiz/handler');
const qrHandler = require('./qr/handler');

// In the polling loop:
if (text.startsWith('/qr'))        qrHandler.handle(msg);
else if (text.startsWith('/quiz')) quizHandler.handle(msg);
else if (text.startsWith('/start'))quizHandler.handle(msg);
// ...
```

Each handler exports a `handle(msg)` function and receives shared utilities (`sendBot`, `sendBotPhoto`) via dependency injection.

### Changes Required

| File | Change | Count |
|------|--------|:-----:|
| `quiz-bot.js` | Rename to `bot.js` | 1 |
| `bot.js` | Extract handlers to quiz/ and qr/, rename internal identifiers (`sendQuizBot` → `sendBot`, etc.) | ~20 |
| `server.js` | Update `require('./quiz-bot')` → `require('./bot')`, update game/highscores paths, static file paths, rename DI identifiers | ~16 |
| `quiz/game.js` | `require('./config')` → `require('../config')`, rename `setQuizBotDeps` → `setBotDeps` + internal refs | ~13 |
| `quiz/gemini.js` | `require('./config')` → `require('../config')` + `__dirname` fix | 2 |
| `quiz/highscores.js` | `__dirname` → `path.join(__dirname, '..')` for `highscores.json` | 1 |
| `qr/qr-render.js` | No changes needed — co-located with its dependencies | 0 |

**Total: ~53 edits across 5 files.** Most are mechanical find-and-replace identifier renames. qr/ needs zero changes.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `__dirname` path breaks for data files | QR codes fail to render; highscores lost | Keep data files at `trivia/` root; update paths with `path.join(__dirname, '..')` |
| Dynamic `require('./game')` in quiz-stop handler missed | `/quiz-stop` crashes at runtime | Grep for all `require(` calls, including those inside functions |
| Static file serving breaks after `web/` move | Mini App won't load | Update `server.js` static routes; test in Telegram before declaring done |
| Dependency injection wiring breaks | Quiz game won't start | `server.js` wiring is just `require()` path changes — mechanical update |
| Git blame lost for moved files | Harder to trace history | Use `git log --follow` for moved files; one-time cost |
| Identifier rename (`sendQuizBot` → `sendBot` etc.) missed somewhere | Runtime `undefined is not a function` | `grep -r 'QuizBot\|quizBot' apps/trivia/` must return zero matches after all renames |

---

## Implementation Plan

Detailed tickets: [`docs/implementation/adr-005-module-separation/`](../implementation/adr-005-module-separation/)

### WP-1: Create directory structure and move files
- Create `quiz/`, `qr/`, `web/` directories
- Move files to their new locations
- Move `atlas-logo.png` into `qr/`
- Rename `quiz-bot.js` → `bot.js`

### WP-2: Extract handlers from bot.js
- Create `quiz/handler.js` with quiz command logic extracted from `bot.js`
- Create `qr/handler.js` with QR command logic extracted from `bot.js`
- Slim `bot.js` down to polling loop + router

### WP-3: Update all require paths
- Fix all `require()` statements across `server.js`, `bot.js`, moved files
- Update `require('./quiz-bot')` → `require('./bot')` in server.js
- Fix `__dirname`-relative paths for `highscores.json`, `questions.json`

### WP-4: Smoke test
- `/qr test` — generates and sends QR code
- `/quiz` — creates room, join link works, game plays through
- `/costs` — shows cost data
- `/quiz-reset` — resets highscores
- Mini App loads in Telegram WebView

### WP-5: Update docs
- Update `docs/project-context.md` directory structure and QR file references
- Update `docs/qr-command.md`, `docs/operations.md`, `docs/atlas-trivia-workflow.md`
- Mark ADR-005 complete in `docs/masterplan.md`

---

## Open Questions

1. **Should `config.js` split?** Currently it has game timing constants (quiz-only) mixed with env vars (shared). Could split into `quiz/config.js` + shared `config.js`. Deferring — the file is only 63 lines.

2. **Where does `/costs` live?** It's not quiz or QR — it's infrastructure. Stays in `bot.js` (the router) since it's small (~35 lines). Extracting a 35-line handler into its own file is premature.

## Resolved Questions

- **`quiz-bot.js` rename**: Renamed to `bot.js`. The file is the Telegram bot layer, not quiz-specific. This also establishes a clean layer naming convention: `server.js` (HTTP), `bot.js` (Telegram), `config.js` (shared), `<feature>/handler.js` (commands).

- **Handler Telegram call ownership**: Handlers receive `sendBot` and `sendBotPhoto` via dependency injection (`.setDeps()`), consistent with the existing DI pattern. They do not import `bot.js` directly.

---

## References

- ADR-001: Multiplayer Trivia Game (original architecture)
- ADR-004: QR Code Rendering Overhaul (QR module split precedent)
- CLAUDE.md: 500-line file limit, self-contained app convention
