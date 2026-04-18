# OpenClaw Apps

Apps, games, and interactive experiences for the Atlas Telegram bot powered by OpenClaw.

## Key Documents

- **[docs/masterplan.md](docs/masterplan.md)** — Current focus, active work, status. **Read and update on every task.**
- **[docs/project-context.md](docs/project-context.md)** — Architecture, infrastructure, bot config. Load when needed.
- **[docs/architecture.md](docs/architecture.md)** — System diagram, all three bots, exec policy, chart delivery.
- **[docs/operations.md](docs/operations.md)** — Service management, troubleshooting.
- **[docs/upgrade-2026.4.12.md](docs/upgrade-2026.4.12.md)** — Upgrade changelog and lessons learned.
- **[docs/adr/](docs/adr/)** — Architecture Decision Records.
- **[docs/implementation/meteor-bot/](docs/implementation/meteor-bot/)** — Meteor bot: setup log, tutorial, architecture spec, **[backlog](docs/implementation/meteor-bot/backlog.md)**.
- **`~/vps-config/multi-instance-deployment.md`** — VPS admin: multi-instance operations, port map, adding new instances.

## Code Conventions

- **Max 500 lines per file.** Split into modules when exceeded. Applies to source, docs, and HTML.
- **CommonJS only.** No `import`/`export`, no `"type": "module"`. Node 22+ CommonJS.
- **No npm packages beyond `ws`.** Use Node built-ins for everything. No bot frameworks, no image libraries.
- **Apps are self-contained.** Each app directory has everything it needs. No global installs, no shared libs between apps.
- **Mobile-first.** All apps must work on mobile Telegram (responsive design).
- **No external CDN.** Bundle everything inline.
- **Telegram API**: Raw `fetch()` against `https://api.telegram.org/bot${TOKEN}/METHOD`. No bot framework.
- **Photo uploads**: Node 22 built-in `FormData` + `Blob`. No multipart libraries.

## Naming Conventions (apps/trivia/)

| Layer | File | Role |
|-------|------|------|
| HTTP | `server.js` | HTTP + WebSocket server, static files, dependency wiring |
| Bot | `bot.js` | Telegram long-polling, command routing, shared bot utilities |
| Config | `config.js` | Environment variables, constants, cost tracking |
| Auth | `auth.js` | Telegram initData HMAC verification |
| Feature entry | `<feature>/handler.js` | Command handlers — the only file `bot.js` imports from a feature dir |
| Feature internals | `<feature>/<name>.js` | Domain logic, only imported within the feature directory |

## Three Bots, Three Processes

| Bot | Handle | Token var | Runtime | Model | Purpose |
|-----|--------|-----------|---------|-------|---------|
| Atlas (main) | `@SNooZyy_bot` | `TELEGRAM_BOT_TOKEN` | Docker (`openclaw` project) | DeepSeek v3.2 (OpenRouter) | AI chat, `/fact_check`, image gen, TTS, memory |
| Meteor | `@MeteorBotBot` | `TELEGRAM_BOT_TOKEN` | Docker (`meteor` project) | MiniMax M2.7 (direct) | Obsidian vault / llm-wiki knowledge management |
| Quiz Bot | `@AtlasQuizBotBot` | `QUIZ_BOT_TOKEN` | systemd (`atlas-quiz-bot`) | Perplexity / Gemini | `/quiz`, `/qr`, `/costs` |

Atlas and Meteor are **separate Docker Compose projects** sharing the `openclaw:local` image. Each has its own config dir, tokens, and ports. They do not interfere. See [ADR-007](docs/adr/007-multi-instance-openclaw-meteor.md).

Quiz Bot runs as a separate systemd service and shares `~/openclaw/.env` with Atlas.

### Meteor-Specific Notes

- **Config dir**: `~/.openclaw-meteor/` (NOT `~/.openclaw/` — that's Atlas)
- **Workspace**: `~/.openclaw-meteor/workspace/` — contains `AGENTS.md` (llm-wiki v0.2 protocol), `TOOLS.md`, and the vault
- **Vault**: `~/.openclaw-meteor/workspace/vault/` — Obsidian-compatible git repo, synced to [SNooZyy2/meteor-vault](https://github.com/SNooZyy2/meteor-vault) (private)
- **Ports**: 18791 (gateway), 18792 (bridge)
- **Compose**: `~/instances/meteor/docker-compose.yml` + `.env`
- **No Atlas features**: No quiz, QR, fact-check, mediation, image gen, TTS
- **Full docs**: [docs/implementation/meteor-bot/](docs/implementation/meteor-bot/) — setup log, tutorial, architecture spec

## Service Management

```bash
# Atlas
cd ~/instances/atlas && docker compose restart
docker logs openclaw-openclaw-gateway-1 --tail 50

# Meteor
cd ~/instances/meteor && docker compose restart
docker logs meteor-openclaw-gateway-1 --tail 50

# Quiz bot
sudo systemctl restart atlas-quiz-bot
tail -f ~/openclaw-apps/apps/trivia/server.log

# Rebuild image (shared by Atlas + Meteor)
cd ~/openclaw && docker build -t openclaw:local .
cd ~/instances/atlas && docker compose up -d
cd ~/instances/meteor && docker compose up -d

# Status of everything
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

- **Atlas env**: `~/instances/atlas/.env` (also backup at `~/openclaw/.env`)
- **Meteor env**: `~/instances/meteor/.env`
- **Quiz bot env**: `~/openclaw/.env` via systemd `EnvironmentFile`
- **Owner Telegram ID**: `467473650`
- **OpenClaw version**: 2026.4.12-beta.1 (upgraded 2026-04-13)
- **VPS admin docs**: `~/vps-config/multi-instance-deployment.md`

## OpenClaw Gateway — Key Facts

Things that tripped us up — so you don't repeat them:

- **Agent instructions file is `AGENTS.md`**, NOT `CLAUDE.md`. Lives in `~/.openclaw/workspace/AGENTS.md`. Tool notes go in `~/.openclaw/workspace/TOOLS.md`.
- **Exec policy is `cautious`** (allowlist + deny on unknown). Allowlist uses **full paths** (e.g. `/usr/bin/python3 *`) — bare names are silently ignored by the matcher. Config: `~/.openclaw/exec-approvals.json`.
- **Elevated exec is disabled** (`tools.elevated.enabled: false`). When enabled, it hardcodes `defaultLevel: "on"` which requires socket-based approval for ALL exec calls — before the allowlist is even checked. With no approval daemon running, every exec times out. The `cautious` allowlist is the security gate instead.
- **`curl` is NOT in the allowlist** (network exfiltration risk). Atlas has `web_search` and `web_fetch` built-in tools for web access.
- **`matplotlib` is installed** in the container. **`MEDIA:` auto-delivery is broken in 2026.4.12.** Charts must be sent via the `message` tool with `filePath` (2-step: exec generates PNG, then `message` sends it). See TOOLS.md in the workspace.
- **`edit` tool rejects new files.** DeepSeek must use `write` (not `edit`) to create files that don't exist yet. `edit` with empty `oldText` fails in 2026.4.12.
- **Duplicate message delivery** can occur in group chats — the gateway occasionally re-delivers the same Telegram message, causing DeepSeek to respond twice. Mitigated via AGENTS.md dedup instructions.
- **Config file**: `~/.openclaw/openclaw.json`. Gateway needs restart after exec-approvals changes.
- **Dockerfile patch**: `python3-matplotlib` added to apt install line. `COPY src` and `COPY extensions` lines required for extension loading.

## Standing Instructions

1. **Read [docs/masterplan.md](docs/masterplan.md) at the start of every task.**
2. **Update [docs/masterplan.md](docs/masterplan.md) after producing any increment.**
3. Load [docs/project-context.md](docs/project-context.md) only when you need architecture/infra depth.
4. Load [docs/architecture.md](docs/architecture.md) for exec policy, system diagram, and chart delivery details.
