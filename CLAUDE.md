# OpenClaw Apps

Apps, games, and interactive experiences for the Atlas Telegram bot powered by OpenClaw.

## Architecture

- **VPS**: `srv1176342` (72.62.89.238), Debian, running Docker
- **Tailscale**: `srv1176342.taile65f65.ts.net` — use Tailscale Funnel for public HTTPS
- **OpenClaw gateway**: Docker container `openclaw-openclaw-gateway-1`, ports 18789-18790
- **Bot**: `@SNooZyy_bot` (identity: "Atlas"), Telegram group `-1003889708134`
- **Owner Telegram ID**: `467473650`

## Bot Configuration

- **LLM**: `google/gemini-2.5-flash` (free tier, direct Google API via `GEMINI_API_KEY`)
- **Image gen**: `google/gemini-2.5-flash-image` (patched to ignore agent model overrides — see docs/patches.md)
- **STT**: `google/gemini-2.5-flash`
- **TTS**: Microsoft Edge TTS, `de-DE-FlorianMultilingualNeural` (German male, multilingual)
- **Memory**: Gemini embeddings, semantic vector search
- **Web search**: Perplexity (via `PERPLEXITY_API_KEY`)
- **Fallback LLMs**: OpenRouter (stepfun free, deepseek, claude-3.5-sonnet)
- **Exec**: Elevated exec enabled for owner only (Telegram ID 467473650)

## Environment

- **Container runtime**: Node.js 24.14, Python 3.11 (no pip), curl available
- **Available in container**: jimp (image processing), qrcode (npm), basic Node.js/Python stdlib
- **NOT available**: pip, matplotlib, Chrome/browser (headless browser tool fails)
- **OpenClaw version**: 2026.3.14

## Telegram Integration

- Agent identity name "Atlas" — responds to "Atlas" or @mention in groups (`requireMention: true` + identity-derived mention patterns)
- Group `-1003889708134`: anyone can trigger, only owner can use exec/elevated
- Streaming mode: `partial` (live text preview while generating)
- `configWrites: false` — bot cannot modify its own config
- Telegram Web Apps require HTTPS — use Tailscale Funnel (`tailscale funnel`) for public endpoints

## Apps Directory Structure

```
apps/           — Self-contained app directories (each app is its own thing)
  trivia/
    server.js   — HTTP + WebSocket entry point
    quiz-bot.js — Telegram polling loop (/quiz, /qr, /costs, admin commands)
    qr-encode.js — QR Code Model 2 encoder (EC-H, GF(256), Reed-Solomon)
    qr-render.js — ATLAS-themed QR renderer (logo compositing, neon glow)
    png-encode.js — PNG encode/decode (RGBA, only node:zlib)
    atlas-logo.png — 152×152 center logo for QR codes
    game.js     — Quiz game room logic
    gemini.js   — Gemini API for question generation
    client.js   — Web UI (Telegram Mini App)
    index.html, style.css — Frontend
    atlas-quiz-bot.service — systemd unit file
docs/           — Project documentation
scripts/        — Helper scripts (deploy, start, stop)
```

## Building Apps

### Telegram Web Apps (Mini Apps)
- Bot sends an `InlineKeyboardButton` with `web_app: { url }` pointing to HTTPS endpoint
- HTML/JS game loads inside Telegram's built-in browser
- Use `window.Telegram.WebApp` API for user identity, theme, haptic feedback
- Multiplayer: WebSocket server on the VPS, Funnel provides HTTPS

### HTTPS via Tailscale Funnel
```bash
# Expose a local port publicly with HTTPS
tailscale funnel 8080

# Result: https://srv1176342.taile65f65.ts.net → localhost:8080
```

### Connecting Apps to the Bot
The bot can:
1. Write game files to disk (exec tool)
2. Start/stop game servers (exec tool)
3. Send Web App buttons to the group chat
4. Track scores/state in its memory system

## Conventions

- Apps must be self-contained (single directory, no global installs)
- Use Node.js for servers (available in container and on host)
- Keep HTML games as single-file where possible (inline CSS/JS)
- All apps should work on mobile Telegram (responsive design)
- No external CDN dependencies — bundle everything inline
- Game servers should be lightweight and auto-cleanup after inactivity

## Code Style

- **Max 500 lines per file.** If a file grows beyond 500 lines, split it into modules. This applies to docs, source files, and HTML. For the single-file `index.html`, inline JS and CSS count toward the limit — extract into separate files if needed.

## Quiz Bot Process

The quiz bot (`@AtlasQuizBotBot`) runs as a **separate process** from the OpenClaw gateway, managed by systemd (`atlas-quiz-bot.service`). This is intentional — slash commands (`/quiz`, `/qr`, `/costs`) survive gateway crashes.

- **Runtime**: Node.js 22+ (CommonJS, NOT ESM). Do not add `import`/`export` or `"type": "module"`.
- **Dependencies**: Only `ws` (WebSocket). Do not add npm packages — use Node built-ins.
- **Telegram**: Raw `fetch()` against `https://api.telegram.org/bot${TOKEN}/METHOD`. No bot framework.
- **Photo uploads**: Node 22 built-in `FormData` + `Blob`. No multipart libraries.
- **Service management**: `sudo systemctl restart atlas-quiz-bot` (not nohup)
- **Env vars**: Loaded from `~/openclaw/.env` via systemd `EnvironmentFile`

### QR Code Integration (2026-03-31)

The `/qr` command was extracted from the OpenClaw gateway plugin system (`extensions/qrcode/`) into the quiz bot. The QR renderer was overhauled for scannability and visual quality (see ADR-004).

**File structure:**
- `qr-encode.js` — QR Code Model 2 encoder (~415 LOC, GF(256) + Reed-Solomon, EC level H)
- `qr-render.js` — ATLAS-themed PNG renderer (~220 LOC, logo compositing, neon glow)
- `png-encode.js` — PNG encode + decode (~163 LOC, RGBA, all 5 filter types). Uses only `node:zlib`.
- `atlas-logo.png` — 152×152 pre-rendered center logo (globe + ring + ATLAS text)

**Key details:**
- Error correction level H (30% recovery) — required because center logo intentionally covers QR modules
- Scale 48 (each module = 48×48px), margin 2 modules — fills the frame, sharp on Telegram
- Logo is decoded at startup via `decodePngRgba()` and cached; composited with bilinear scaling + alpha blending
- The `generate_qr_code` agent tool was intentionally NOT ported — only the `/qr` slash command
- The OpenClaw repo still has `extensions/qrcode/` (upstream code) but it is no longer loaded locally

## Known Issues & Patches

- Image generation model override patch required (see docs/patches.md)
- Duplicate image bug: tool result + final reply both send image (workaround in TOOLS.md workspace file)
- Free Google API rate limits: 15 RPM, 1500 RPD for Gemini 2.5 Flash
