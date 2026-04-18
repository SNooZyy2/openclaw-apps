# Architecture Overview

> How Atlas and its apps fit together.

---

## System Diagram

```
                     Telegram Cloud
                    ┌──────────────────────────────────┐
                    │  Group: -1003889708134            │
                    │  ┌──────────┐  ┌───────────────┐ │
                    │  │ @SNooZyy │  │ @AtlasQuizBot │ │
                    │  │ _bot     │  │ Bot           │ │
                    │  └────┬─────┘  └──────┬────────┘ │
                    └───────┼───────────────┼──────────┘
                            │               │
              long-poll     │               │  long-poll
              (TELEGRAM_    │               │  (QUIZ_BOT_
               BOT_TOKEN)   │               │   TOKEN)
                            │               │
  ┌─────────────────────────┼───────────────┼──────────────┐
  │  VPS: srv1176342        │               │              │
  │  (72.62.89.238)         │               │              │
  │                         ▼               ▼              │
  │  ┌──────────────────┐  ┌──────────────────────────┐    │
  │  │ Docker Container │  │ systemd: atlas-quiz-bot  │    │
  │  │ openclaw:local   │  │ Node.js 22+ (CommonJS)   │    │
  │  │                  │  │                          │    │
  │  │ OpenClaw Gateway │  │ ┌──────────┐             │    │
  │  │ v2026.4.12-beta  │  │ │ bot.js   │ command     │    │
  │  │                  │  │ │ (router) │ routing     │    │
  │  │ Providers:       │  │ └──┬───┬───┘             │    │
  │  │  - DeepSeek v3.2 │  │    │   │                 │    │
  │  │  - vLLM (Qwen)   │  │    ▼   ▼                 │    │
  │  │  - OpenRouter     │  │ ┌────┐ ┌──┐             │    │
  │  │  - Google Gemini  │  │ │quiz│ │qr│             │    │
  │  │                  │  │ └──┬─┘ └──┘             │    │
  │  │ Channels:        │  │    │                     │    │
  │  │  - Telegram      │  │    ▼                     │    │
  │  │                  │  │ ┌────────────┐           │    │
  │  │ Plugins:         │  │ │ server.js  │           │    │
  │  │  - qrcode        │  │ │ HTTP + WS  │◄──────┐   │    │
  │  │  - memory-core   │  │ │ :8080      │       │   │    │
  │  │  - web-search    │  │ └────────────┘       │   │    │
  │  │                  │  │                      │   │    │
  │  │ :18789 (LAN)     │  └──────────────────────┼───┘    │
  │  └──────────────────┘                         │        │
  │                                               │        │
  │  Tailscale Funnel (:8080 → public HTTPS) ─────┘        │
  └────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Mobile player │
                    │ Telegram      │
                    │ WebView       │
                    │ (Mini App)    │
                    └───────────────┘
```

---

## Two Bots, Two Processes

| | Atlas (main) | Quiz Bot |
|---|---|---|
| **Handle** | `@SNooZyy_bot` | `@AtlasQuizBotBot` |
| **Token env var** | `TELEGRAM_BOT_TOKEN` | `QUIZ_BOT_TOKEN` |
| **Runtime** | Docker container | systemd service |
| **Codebase** | `/home/snoozyy/openclaw` (fork) | `/home/snoozyy/openclaw-apps/apps/trivia` |
| **Process** | `node dist/index.js gateway` | `node server.js` |
| **Purpose** | AI chat, `/fact_check`, image gen, TTS, memory | `/quiz`, `/qr`, `/costs` |
| **Dependencies** | Full OpenClaw stack | Only `ws` (WebSocket) |

Both bots are in the same Telegram group. Each has its own token and polling loop — they do not interfere with each other.

---

## OpenClaw Gateway

The gateway is the upstream [OpenClaw](https://github.com/openclaw/openclaw) project, forked at `github.com/SNooZyy2/openclaw`. It runs as a Docker container and provides Atlas's AI capabilities.

### Provider Chain (LLM)

```
Primary: openrouter/deepseek/deepseek-v3.2  (text-only, no images)
    ↓ fallback
google/gemma-4-31b-it:free               (text + image + video)
    ↓ fallback
minimax/minimax-m2.7                     (requires reasoning enabled)
    ↓ fallback
deepseek/deepseek-chat-v3-0324
    ↓ fallback
anthropic/claude-3.5-sonnet
```

A local vLLM instance (`qwen3.5-27b` at `100.93.82.98:8001`) is also configured.

**Fallback behavior**: When the primary model fails (e.g. image sent to text-only DeepSeek),
OpenClaw falls to the next model. Beware: the gateway **auto-locks the session** to the
fallback model (`modelOverride` with `modelOverrideSource: auto` in `sessions.json`). To
reset, clear the `model`, `modelOverride`, `modelOverrideSource`, `providerOverride`, and
`modelProvider` fields from the session entry in
`/home/node/.openclaw/agents/main/sessions/sessions.json` and restart the gateway.

### Workspace Skills (Slash Commands)

Atlas slash commands are defined as **workspace skills** inside the container.
They live in `/home/node/.openclaw/workspace/skills/` and are auto-discovered at startup.
The `user-invocable: true` frontmatter flag registers them as Telegram slash commands.

| Command | Skill directory | Description |
|---------|----------------|-------------|
| `/fact_check` | `skills/fact-check/SKILL.md` | Fact-check claims via web search, cross-reference sources, return verdict |
| `/mediation` | `skills/mediation/SKILL.md` | Mediate group chat disagreements, summarize positions, find common ground |

These are **not** in `openclaw.json` — they are discovered from the workspace filesystem.
To add a new slash command, create `skills/<name>/SKILL.md` with the appropriate frontmatter.

### Custom Extensions (our additions)

| Extension | Purpose |
|-----------|---------|
| `extensions/qrcode` | ATLAS-branded QR code generation plugin for the gateway |
| `extensions/web-search-trigger` | Web search integration |

### Key Config

- **Config file**: `/home/snoozyy/.openclaw/openclaw.json` (bind-mounted into container)
- **Env vars**: `~/openclaw/.env`
- **TTS**: Microsoft Edge, `de-DE-FlorianMultilingualNeural`
- **Memory**: Gemini embeddings
- **Image gen**: `gemini-2.5-flash-image` (direct Google API)
- **Elevated exec**: Owner only (`467473650`)

---

## Quiz Bot (`apps/trivia/`)

A self-contained Node.js app with zero npm dependencies beyond `ws`.

### File Layout

```
apps/trivia/
├── server.js          # HTTP + WebSocket server, static files, DI wiring
├── bot.js             # Telegram long-polling, command routing
├── config.js          # Environment vars, constants, cost tracking
├── auth.js            # Telegram initData HMAC verification
├── highscores.json    # Persistent player stats
├── quiz/
│   ├── handler.js     # /quiz command handler (entry point for bot.js)
│   ├── game.js        # Game state machine, room management
│   ├── gemini.js      # LLM calls (Perplexity primary, Gemini fallback)
│   └── highscores.js  # Score persistence
├── qr/
│   ├── handler.js     # /qr command handler (entry point for bot.js)
│   ├── qr-encode.js   # QR matrix generation
│   ├── qr-render.js   # PNG rendering with logo compositing
│   └── png-encode.js  # Raw PNG encoder (zlib only)
└── web/
    ├── index.html      # Mini App UI (single file, <50KB)
    ├── client.js       # WebSocket client, game UI logic
    └── style.css       # Neon-terminal theme
```

### Question Generation Pipeline

```
/quiz [topic]
    ↓
Perplexity sonar (search-grounded, primary)
    ↓ fallback
OpenRouter (QUIZ_LLM_MODEL)
    ↓ fallback
Google Gemini (gemini-3-flash-preview)
```

### Game Flow

1. `/quiz topic` → bot creates room, starts question pre-generation
2. Bot posts `InlineKeyboardButton` with Mini App link
3. Players open WebView → WebSocket connects
4. Server verifies Telegram `initData` (HMAC-SHA256)
5. State machine: `LOBBY → PREGAME → QUESTION → ANSWER_REVEAL → LEADERBOARD → loop → GAME_OVER`
6. Results posted to group, scores saved

---

## Exec Policy & Security

The gateway runs `cautious` exec policy (set 2026-04-13). Config file: `~/.openclaw/exec-approvals.json`.

### How it works

- **`security: allowlist`** — only pre-approved commands run without prompting
- **`ask: on-miss`** — unknown commands require manual approval (owner only)
- **`askFallback: deny`** — if approval daemon is unreachable, block execution

### Allowlisted commands (agent: `main`)

Patterns **must use full paths** — the matcher requires a `/` in the pattern.
Bare names like `python3 *` are silently skipped.

| Pattern | Purpose |
|---------|---------|
| `/usr/bin/python3 *` | Charts (matplotlib), data processing |
| `/usr/bin/cat *` | Read files |
| `/usr/bin/ls *` | List directories |
| `/usr/bin/date *` | Date/time |
| `/usr/bin/echo *` | Print text |
| `/usr/bin/head *` | Read file headers |
| `/usr/bin/tail *` | Read file tails |
| `/usr/bin/wc *` | Word/line counts |
| `/usr/bin/find *` | File search |
| `/usr/bin/grep *` | Text search |

### Blocked (requires approval or denied)

`curl`, `wget`, `rm`, `mv`, `cp`, `bash`, `sh`, `node`, `apt`, `pip`, and everything else.

### Elevated exec (disabled)

Elevated exec is **disabled** (`tools.elevated.enabled: false`). It was causing all exec calls
to require socket-based approval (hardcoded `defaultLevel: "on"`), which timed out because no
approval daemon was running. The `cautious` allowlist policy provides the security gate instead.

Previously: `elevated.enabled: true` + `elevated.allowFrom.telegram: ["467473650"]`.
This intercepted every exec before the allowlist was checked, making the allowlist useless.

### Chart delivery

Atlas generates charts via `python3` + `matplotlib` inside the container.

**⚠️ `MEDIA:` auto-delivery is broken since 2026.4.12.** The old method (printing `MEDIA:/path` in exec output) no longer delivers files to chat. The working method is a 2-step process:

1. Generate the chart via `exec` and save PNG to `/tmp/`
2. Send the file using the `message` tool: `{"action": "send", "filePath": "/tmp/chart.png", "caption": "Description"}`

This was diagnosed on 2026-04-13: exec produces the files correctly, but the framework's `MEDIA:` prefix scanner no longer triggers delivery. The `message` tool with `filePath` is the confirmed working alternative. Instructions are in workspace `TOOLS.md`.

Atlas does NOT need data APIs for charts — it has `web_search` and `web_fetch` built-in for finding data on the open web. It should use those first, then plot with matplotlib.

### Key files

- **Agent instructions**: `~/.openclaw/workspace/AGENTS.md` (NOT `CLAUDE.md`)
- **Tool notes**: `~/.openclaw/workspace/TOOLS.md` (matplotlib usage, image gen rules)
- **Exec approvals**: `~/.openclaw/exec-approvals.json`
- **Config**: `~/.openclaw/openclaw.json`

---

## Shared Environment

Both bots load from the same env file (`~/openclaw/.env`):

| Variable | Atlas | Quiz Bot |
|----------|-------|----------|
| `TELEGRAM_BOT_TOKEN` | Yes | No |
| `QUIZ_BOT_TOKEN` | No | Yes |
| `GEMINI_API_KEY` | Yes | Yes (fallback) |
| `OPENROUTER_API_KEY` | Yes | Yes (fallback) |
| `PERPLEXITY_API_KEY` | Yes | Yes (primary) |

---

## Service Management

```bash
# Quiz bot
sudo systemctl restart atlas-quiz-bot
sudo systemctl status atlas-quiz-bot
tail -f ~/openclaw-apps/apps/trivia/server.log

# OpenClaw gateway
cd ~/openclaw && docker compose up -d
docker logs openclaw-openclaw-gateway-1 --tail 50

# Rebuild after upgrade
cd ~/openclaw && docker build -t openclaw:local . && docker compose up -d
```
