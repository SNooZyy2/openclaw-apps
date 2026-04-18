# Meteor Bot — Setup Log

> Chronological record of everything done to deploy Meteor alongside Atlas.
> Date: 2026-04-13

---

## 1. Capacity Assessment

Checked VPS resources before planning:

| Resource | Total | Used | Available |
|----------|-------|------|-----------|
| RAM | 7.8 GB | 2.6 GB | 5.1 GB |
| CPU | 2 vCPU (AMD EPYC 9354P) | Mostly idle | Ample |
| Disk | 96 GB | 69 GB (72%) | 27 GB |

One OpenClaw container uses ~370 MB idle, ~600 MB active. Two instances fit comfortably with 5+ GB headroom.

---

## 2. ADR-007 Written

Created `docs/adr/007-multi-instance-openclaw-meteor.md` covering:

- **Why**: Separate operators, separate purposes, security boundary
- **Decision**: Separate Docker Compose projects (not single compose, not separate VPS)
- **Architecture**: `~/instances/atlas/` and `~/instances/meteor/`, each with own `.env` and `docker-compose.yml`, sharing `openclaw:local` image
- **Meteor config**: Own `~/.openclaw-meteor/` directory with openclaw.json, exec-approvals, workspace
- **Vault placement**: Inside workspace at `~/.openclaw-meteor/workspace/vault/`
- **Obsidian sync**: Git-based via Obsidian Git plugin (deferred to WP-6)
- **Port allocation**: Atlas 18789/18790, Meteor 18791/18792

Options considered and rejected:
- Single Docker Compose (lifecycle coupling unacceptable)
- Separate VPS instances (resource waste)

---

## 3. ADR Deep Review

Spawned a Plan agent to critically review ADR-007 against actual system state. Found **14 issues**:

### Critical (5)

| # | Issue | Fix Applied |
|---|-------|-------------|
| C1 | `openclaw-cli` service missing from ADR | Added to both compose files with `profiles: [cli]` (not auto-started) |
| C2 | `gateway.controlUi.allowedOrigins` hardcoded to port 18789 | Meteor config uses port 18791 |
| C3 | Gateway auth token must be unique per instance | Generated fresh token via `openssl rand -hex 24` |
| C4 | Device identity keys must be unique | Noted: OpenClaw auto-generates on first startup |
| C5 | Telegram credentials are instance-specific | Created `telegram-default-allowFrom.json` for Meteor |

### Moderate (7)

| # | Issue | Fix Applied |
|---|-------|-------------|
| M1 | No `name:` in current compose → renaming container | Atlas keeps project name `openclaw` to preserve container name |
| M2 | Mixed file ownership in `.openclaw/` | All Meteor files set to `ubuntu:ubuntu` (uid 1000 = `node` in container) |
| M3 | Exec-approvals socket path looks suspicious | Confirmed: resolves inside container mount, works correctly |
| M4 | `QUIZ_BOT_TOKEN` not addressed in migration | Documented: quiz bot is unaffected (separate systemd service) |
| M5 | `OPENCLAW_GATEWAY_TOKEN` env var not set | Documented: not needed, auth is in `openclaw.json` |
| M6 | vLLM provider references Tailscale IP | Omitted from Meteor config (Atlas-specific) |
| M7 | Meteor starts with empty memory/sessions | Documented: do NOT copy runtime dirs from Atlas |

### Minor (5)

Nested git repos, runtime dirs auto-created, TTS settings, diagram label fix, removed unused `~/vaults/` reference.

All fixes applied to the ADR before execution.

---

## 4. Directory Structure Created

```bash
mkdir -p ~/instances/atlas ~/instances/meteor
sudo mkdir -p ~/.openclaw-meteor/workspace/vault
sudo chown -R ubuntu:ubuntu ~/.openclaw-meteor/
```

---

## 5. Atlas Instance Config (WP-2)

### ~/instances/atlas/docker-compose.yml

- Copied from `~/openclaw/docker-compose.yml`
- Added `name: openclaw` (preserves existing container name `openclaw-openclaw-gateway-1`)
- Added `profiles: [cli]` to `openclaw-cli` service (not auto-started)

### ~/instances/atlas/.env

- Copied from `~/openclaw/.env` (identical content)
- Contains: `OPENCLAW_CONFIG_DIR`, `OPENCLAW_WORKSPACE_DIR`, ports, API keys, bot tokens

---

## 6. Meteor Instance Config (WP-3)

### ~/instances/meteor/docker-compose.yml

- Project name: `meteor`
- Same structure as Atlas but:
  - Stripped Claude session keys (not needed)
  - Added `MINIMAX_API_KEY` passthrough
  - Default ports 18791/18792

### ~/instances/meteor/.env

```
OPENCLAW_CONFIG_DIR=/home/snoozyy/.openclaw-meteor
OPENCLAW_WORKSPACE_DIR=/home/snoozyy/.openclaw-meteor/workspace
OPENCLAW_GATEWAY_PORT=18791
OPENCLAW_BRIDGE_PORT=18792
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_IMAGE=openclaw:local
OPENROUTER_API_KEY=<shared>
TELEGRAM_BOT_TOKEN=<Meteor bot token from BotFather>
PERPLEXITY_API_KEY=<shared>
GEMINI_API_KEY=<shared>
MINIMAX_API_KEY=<direct MiniMax key>
```

### ~/.openclaw-meteor/openclaw.json

Key differences from Atlas:
- `agents.list[0].identity.name`: `"Meteor"` (not Atlas)
- `gateway.auth.token`: Fresh token `f81b3d9d86e9b359...`
- `gateway.controlUi.allowedOrigins`: Port 18791
- `plugins.allow`: `["telegram", "openrouter", "memory-core"]` (no `qrcode`, no `web-search-trigger`)
- `models.providers`: No `vllm` block
- `channels.telegram.groups`: Empty (no pre-configured groups)
- `messages.tts`: Removed (no TTS needed)
- `agents.defaults.model.primary`: `minimax/MiniMax-M2.7`

### ~/.openclaw-meteor/exec-approvals.json

Conservative allowlist. Socket path `/home/node/.openclaw/exec-approvals.sock` (correct — resolves inside container). Empty allowlist (agent has full exec).

### ~/.openclaw-meteor/workspace/AGENTS.md

Full llm-wiki v0.2 protocol (see architecture.md for details).

### ~/.openclaw-meteor/workspace/TOOLS.md

Wiki-specific tool patterns: vault access, search, web operations, log appending, index updating.

---

## 7. Atlas Migration (WP-4)

```bash
cd ~/openclaw && docker compose down      # Stopped old container
cd ~/instances/atlas && docker compose up -d  # Started from new location
```

- Container name preserved: `openclaw-openclaw-gateway-1`
- Health check passed: `{"ok":true,"status":"live"}`
- Downtime: ~15 seconds
- Original `~/openclaw/docker-compose.yml` and `.env` left as backups

---

## 8. Meteor Bot Created

User created `@MeteorBotBot` via BotFather. Token: `8705409608:AAEgmnsXs077VgdF4mCffpRgXTDWaYodnu0`

Added to `~/instances/meteor/.env`.

---

## 9. Meteor Deployed (WP-5)

```bash
cd ~/instances/meteor && docker compose up -d
```

- Container: `meteor-openclaw-gateway-1`
- Health check: healthy
- Telegram provider started: `@MeteorBotBot`
- Pairing: User sent code `TGQFU6QQ`, approved by writing `telegram-default-allowFrom.json` with user ID `467473650`

---

## 10. MiniMax M2.7 Configured

### Problem: Initial "Unknown model" warmup error

- First tried `minimax/minimax-m2.7` (lowercase) — warmup failed
- Source inspection revealed correct ID: `MiniMax-M2.7` (mixed case)
- Fixed to `minimax/MiniMax-M2.7`
- OpenClaw auto-detected `MINIMAX_API_KEY` and auto-enabled the MiniMax plugin

### Final model stack

- **Primary**: `minimax/MiniMax-M2.7` (direct via api.minimax.io — international endpoint)
- **Fallbacks**: DeepSeek v3.2 (OpenRouter), Gemma 4 31B (OpenRouter free)

### Config warning fixed

Removed stale `web-search-trigger` from plugins.allow (plugin not found in image).

---

## 11. LLM-Wiki Implemented

Cloned `https://github.com/nvk/llm-wiki` for reference. Implemented v0.2 protocol:

### Vault directory structure created

```
~/.openclaw-meteor/workspace/vault/
├── .obsidian/          (app.json, appearance.json, graph.json)
├── _index.md           (master index with stats + quick nav)
├── config.md           (wiki scope and conventions)
├── log.md              (activity log — initialized)
├── inbox/.processed/
├── raw/
│   ├── _index.md
│   ├── articles/_index.md
│   ├── papers/_index.md
│   ├── repos/_index.md
│   ├── notes/_index.md
│   └── data/_index.md
├── wiki/
│   ├── _index.md
│   ├── concepts/_index.md
│   ├── topics/_index.md
│   ├── references/_index.md
│   └── theses/_index.md
└── output/
    ├── _index.md
    └── projects/.archive/
```

### AGENTS.md rewritten

Full llm-wiki protocol adapted for OpenClaw:
- Ingest, Compile, Query, Research (topic/question/thesis modes), Output, Lint, Retract
- Dual-linking convention (`[[wikilink]]` + `(markdown link)`)
- Confidence scoring (high/medium/low based on source credibility)
- 3-hop navigation strategy
- Structural guardian (auto-check indexes after writes)
- Credibility scoring for research sources

### Vault committed to git

```
git init → git add -A → git commit -m "Implement llm-wiki v0.2 vault structure"
```

Branch: `main`. Ready for remote once GitHub repo is created.

---

## 12. Final State

### Running containers

| Container | Status | Ports | Model |
|-----------|--------|-------|-------|
| `openclaw-openclaw-gateway-1` (Atlas) | healthy | 18789/18790 | DeepSeek v3.2 |
| `meteor-openclaw-gateway-1` (Meteor) | healthy | 18791/18792 | MiniMax M2.7 |

### Pending work

- **WP-6**: Vault git sync (needs GitHub private repo + Obsidian Git plugin setup)
- **Meteor operator ID**: Currently set to 467473650 (snoozyy). Change if different operator.
