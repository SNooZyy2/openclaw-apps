# Project Context

> **Reference document** — stable information about architecture, infrastructure, and how things work.
> Load this when you need depth. Not needed for every task.
> For current status and active work, see [masterplan.md](masterplan.md).

---

## What This Project Is

Apps, games, and interactive experiences for the **Atlas** Telegram bot, powered by [OpenClaw](https://github.com/nicepkg/openclaw). Atlas (`@SNooZyy_bot`) is an AI assistant running in a Telegram group. This repo (`openclaw-apps`) contains companion apps that run alongside the main bot — currently a multiplayer trivia game and a QR code generator.

---

## Infrastructure

### VPS
- **Hostname**: `srv1176342` (72.62.89.238)
- **OS**: Debian Linux
- **User**: `snoozyy`

### Tailscale
- **DNS**: `srv1176342.taile65f65.ts.net`
- **Funnel**: `tailscale funnel 8080` → public HTTPS for the quiz game server

### Docker (OpenClaw gateway)
- **Container**: `openclaw-openclaw-gateway-1`
- **Ports**: 18789 (WS+HTTP), 18790 (node bridge)
- **Config**: `/home/snoozyy/.openclaw/` (bind mount)
- **Compose**: `/home/snoozyy/openclaw/docker-compose.yml`

### Port Map

| Port | Service | Access |
|------|---------|--------|
| 18789 | OpenClaw gateway | LAN |
| 18790 | OpenClaw node bridge | LAN |
| 8080 | Quiz bot + game server | Public via Tailscale Funnel |

---

## Bot Configuration

### Atlas (main bot)
- **Handle**: `@SNooZyy_bot`, identity name "Atlas"
- **Group**: `-1003889708134`
- **Owner Telegram ID**: `467473650`
- **Group policy**: allowlist, requireMention
- **Streaming**: partial
- **Config writes**: disabled
- **Elevated exec**: owner only

### Models (as of 2026-04-13)

| Purpose | Provider | Model | Cost |
|---------|----------|-------|------|
| Primary LLM | OpenRouter | deepseek/deepseek-v3.2 | Paid |
| Local LLM | vLLM (self-hosted) | qwen3.5-27b (100.93.82.98:8001) | Free |
| Fallback 1 | OpenRouter | minimax/minimax-m2.7 | Paid |
| Fallback 2 | OpenRouter | google/gemma-4-31b-it | Paid |
| Fallback 3 | OpenRouter | deepseek/deepseek-chat-v3-0324 | Paid |
| Fallback 4 | OpenRouter | anthropic/claude-3.5-sonnet | Paid |
| Image gen | Google (direct) | gemini-2.5-flash-image | Free |
| STT | Google (direct) | gemini-2.5-flash | Free |
| TTS | Microsoft Edge | de-DE-FlorianMultilingualNeural | Free |
| Memory embeddings | Google (direct) | Gemini embeddings | Free |
| Quiz questions | Perplexity | sonar (search-grounded) | Free tier |

### API Keys (loaded from `~/openclaw/.env`)

| Variable | Used by |
|----------|---------|
| `GEMINI_API_KEY` | Gateway (LLM, STT, images, embeddings) + Quiz bot (questions) |
| `OPENROUTER_API_KEY` | Gateway (fallback LLMs) + Quiz bot (fallback questions) |
| `TELEGRAM_BOT_TOKEN` | Gateway (main bot) |
| `PERPLEXITY_API_KEY` | Gateway (web search) + Quiz bot (primary question gen) |
| `QUIZ_BOT_TOKEN` | Quiz bot only (`@AtlasQuizBotBot`) |

### Free Tier Limits (Google Gemini)
- 15 requests/minute, 1,500 requests/day, 1M tokens/minute
- Monitor: https://aistudio.google.com/app/plan

---

## Quiz Bot Architecture

The quiz bot (`@AtlasQuizBotBot`) runs as a **separate process** from the OpenClaw gateway, managed by systemd. This is intentional — slash commands survive gateway crashes.

### Runtime
- Node.js 22+ (CommonJS, NOT ESM)
- Only npm dependency: `ws` (WebSocket)
- Telegram API: raw `fetch()`, no bot framework
- Photo uploads: Node 22 built-in `FormData` + `Blob`
- Service: `sudo systemctl restart atlas-quiz-bot`
- Env: `~/openclaw/.env` via systemd `EnvironmentFile`

### How a Game Works

1. User sends `/quiz [topic]` in Telegram group
2. Bot creates a room (6-char hex code), starts pre-generating questions via Perplexity/Gemini
3. Bot sends `InlineKeyboardButton` with Mini App link
4. Players tap → Telegram opens WebView → WebSocket connects to game server
5. State machine: `LOBBY → PREGAME (3s) → QUESTION (15s) → ANSWER_REVEAL (5s) → LEADERBOARD (5s) → loop → GAME_OVER`
6. Scoring: 1000 base + up to 500 speed bonus + up to 500 streak bonus
7. Results posted to group chat, recorded in `highscores.json`

### QR Code System

The `/qr` command generates ATLAS-branded QR codes entirely in-process:
- Error correction level H (30% recovery — required for center logo)
- Scale 48px per module, 2-module margin
- Logo decoded at startup, cached, composited with bilinear scaling + alpha blending
- Zero external dependencies (only `node:zlib`)

### Commands

| Command | Who | What |
|---------|-----|------|
| `/quiz [topic]` | Anyone | Start a quiz game |
| `/qr <text>` | Anyone | Generate ATLAS-branded QR code |
| `/costs` | Anyone | Show API token usage and costs |
| `/quizstop` | Owner | Kill all active game rooms |
| `/quizreset` | Owner | Wipe all highscores |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/create-room` | POST | Manual room creation |
| `/api/room/:code` | GET | Room status |
| `/api/results/:code` | GET | Game results |
| `/api/highscores` | GET | Leaderboard |
| `/api/atlas-usage` | GET | Atlas usage stats |

---

## Container Environment (OpenClaw gateway)

- Node.js 24.x, Python 3.11 + matplotlib 3.6.3
- Available: jimp, qrcode (npm), curl, matplotlib (python3)
- NOT available: pip, numpy, Chrome/headless browser
- OpenClaw version: 2026.4.12-beta.1 (upgraded 2026-04-13 from 2026.3.14)
- Exec policy: `cautious` (allowlist + approval on unknown commands)
- Agent instructions file: `AGENTS.md` in workspace (not `CLAUDE.md`)

---

## Known Issues & Patches

- **Image gen model override**: Gemini agent ignores configured model, always picks paid tier. Patched in compiled dist to return `undefined`. Lost on container rebuild. See [docs/patches.md](patches.md).
- **Free tier rate limits**: 15 RPM, 1500 RPD for Gemini 2.5 Flash.
- **`MEDIA:` auto-delivery broken (2026.4.12)**: The `MEDIA:/path` convention in exec output no longer delivers files to chat. Use the `message` tool with `filePath` instead. Documented in workspace `TOOLS.md`.
- **`edit` tool rejects new files (2026.4.12)**: The `edit` tool fails when `oldText` is empty (creating new files). DeepSeek must use `write` for new files. Documented in workspace `TOOLS.md`.
- **Duplicate message delivery in groups**: The gateway occasionally re-delivers the same Telegram message to the agent, causing duplicate responses. Mitigated via AGENTS.md dedup instructions; root cause may be related to `streaming.mode: "partial"`.
- **DeepSeek NO_REPLY in groups**: DeepSeek was too aggressive about staying silent in group chats, even when directly mentioned. Fixed by adding mandatory-respond rules to AGENTS.md (2026-04-13).

---

## Telegram Web Apps (Mini Apps)

- Bot sends `InlineKeyboardButton` with `web_app: { url }` pointing to HTTPS endpoint
- HTML/JS loads inside Telegram's built-in browser
- Use `window.Telegram.WebApp` API for user identity, theme, haptic feedback
- Multiplayer via WebSocket, HTTPS via Tailscale Funnel
- Must work on mobile (responsive design)

---

## Operations Quick Reference

```bash
# Service management
sudo systemctl status atlas-quiz-bot
sudo systemctl restart atlas-quiz-bot

# Logs
tail -f ~/openclaw-apps/apps/trivia/server.log

# Health check
curl -s https://srv1176342.taile65f65.ts.net/health | jq

# Funnel
tailscale funnel status
tailscale funnel 8080
```

Full operations guide: [docs/operations.md](operations.md)
