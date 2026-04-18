# Meteor Bot — Architecture & Specification

> Complete reference for every file, directory, config, and protocol in the Meteor deployment.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VPS (srv1176342)                          │
│                    2 vCPU / 8 GB RAM                        │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │ Atlas Container   │  │ Meteor Container  │  │ Quiz Bot  │ │
│  │ openclaw-gateway  │  │ openclaw-gateway  │  │ (systemd) │ │
│  │ :18789/:18790     │  │ :18791/:18792     │  │ :8080     │ │
│  │                   │  │                   │  │           │ │
│  │ DeepSeek v3.2     │  │ MiniMax M2.7      │  │ Node.js   │ │
│  │ (OpenRouter)      │  │ (Direct API)      │  │           │ │
│  │                   │  │                   │  │           │ │
│  │ @SNooZyy_bot      │  │ @MeteorBotBot     │  │ @AtlasQBB │ │
│  └────────┬─────────┘  └────────┬─────────┘  └─────┬─────┘ │
│           │                     │                   │       │
│  ┌────────┴─────────┐  ┌───────┴──────────┐        │       │
│  │ ~/.openclaw/      │  │ ~/.openclaw-     │        │       │
│  │ (Atlas config)    │  │   meteor/        │        │       │
│  │                   │  │ (Meteor config)  │        │       │
│  │ workspace/        │  │ workspace/       │        │       │
│  │   AGENTS.md       │  │   AGENTS.md      │        │       │
│  │   skills/         │  │   TOOLS.md       │        │       │
│  │   memory/         │  │   vault/ ←───────┼── Obsidian    │
│  └───────────────────┘  └──────────────────┘   (Git sync)  │
│                                                             │
│  ┌──────────────────────────────────────────┐               │
│  │ ~/openclaw/  (shared source + Dockerfile) │               │
│  │ Image: openclaw:local (built once)        │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Three Bots, Three Processes

| Bot | Handle | Token Env Var | Runtime | Model | Purpose |
|-----|--------|---------------|---------|-------|---------|
| Atlas | `@SNooZyy_bot` | `TELEGRAM_BOT_TOKEN` | Docker (`openclaw`) | DeepSeek v3.2 | AI chat, fact-check, image gen, TTS |
| Meteor | `@MeteorBotBot` | `TELEGRAM_BOT_TOKEN` | Docker (`meteor`) | MiniMax M2.7 | Obsidian vault / wiki management |
| Quiz Bot | `@AtlasQuizBotBot` | `QUIZ_BOT_TOKEN` | systemd | N/A (Perplexity/Gemini) | `/quiz`, `/qr`, `/costs` |

---

## Port Map

| Port | Service | Instance | Access |
|------|---------|----------|--------|
| 8080 | Quiz bot game server | Atlas | Public (Tailscale Funnel) |
| 18789 | OpenClaw gateway | Atlas | LAN (0.0.0.0) |
| 18790 | OpenClaw bridge | Atlas | LAN |
| 18791 | OpenClaw gateway | Meteor | LAN |
| 18792 | OpenClaw bridge | Meteor | LAN |
| 18793-18800 | Reserved | Future instances | — |

---

## External Dependencies

### APIs

| Service | Used By | Key Env Var | Endpoint |
|---------|---------|-------------|----------|
| MiniMax | Meteor (primary) | `MINIMAX_API_KEY` | `api.minimax.io` (international) |
| OpenRouter | Atlas (primary), Meteor (fallback) | `OPENROUTER_API_KEY` | `openrouter.ai` |
| Google Gemini | Both (memory search, image gen) | `GEMINI_API_KEY` | `generativelanguage.googleapis.com` |
| Perplexity | Quiz bot, research | `PERPLEXITY_API_KEY` | `api.perplexity.ai` |
| OVHCloud | Atlas | `OVHCLOUD_API_KEY` | `api.ovh.com` |

### Repos

| Repo | Purpose | Location |
|------|---------|----------|
| OpenClaw | Gateway source + Dockerfile | `~/openclaw/` (local fork) |
| openclaw-apps | Quiz bot, ADRs, docs | `~/openclaw-apps/` |
| llm-wiki | Protocol reference | `https://github.com/nvk/llm-wiki` |
| Obsidian Git | Vault sync plugin | `https://github.com/Vinzent03/obsidian-git` |

---

## Complete Directory Tree

### Deployment Configs

```
~/instances/
├── atlas/
│   ├── docker-compose.yml      # Project name: openclaw
│   └── .env                    # Atlas tokens, ports 18789/18790
└── meteor/
    ├── docker-compose.yml      # Project name: meteor
    └── .env                    # Meteor tokens, ports 18791/18792, MINIMAX_API_KEY
```

### Atlas Config (unchanged from before migration)

```
~/.openclaw/                    # Owned by ubuntu:ubuntu (uid 1000)
├── openclaw.json               # Model config, plugins, agent identity "Atlas"
├── exec-approvals.json         # Exec allowlist (cautious policy)
├── agents/                     # Agent session state
├── cache/                      # Runtime cache
├── canvas/                     # Canvas UI state
├── credentials/                # Telegram pairing, auth
├── cron/                       # Scheduled tasks
├── delivery-queue/             # Message delivery state
├── devices/                    # Paired device records
├── extensions/                 # qrcode extension (root-owned)
├── identity/                   # Cryptographic device keys
├── logs/                       # Gateway logs
├── media/                      # Media files
├── memory/                     # Agent memory (SQLite)
├── settings/                   # TTS settings
├── tasks/                      # Task state
├── telegram/                   # Telegram-specific state
└── workspace/                  # Agent workspace (git repo)
    ├── AGENTS.md               # Atlas personality + instructions
    ├── TOOLS.md                # Tool documentation
    ├── MEMORY.md               # Agent memory notes
    ├── IDENTITY.md             # Atlas identity
    ├── SOUL.md                 # Atlas soul/personality
    ├── USER.md                 # User context
    ├── skills/                 # Atlas-only skills
    │   ├── fact-check/SKILL.md
    │   └── mediation/SKILL.md
    ├── memory/                 # Persistent memory files
    └── (various workspace files)
```

### Meteor Config

```
~/.openclaw-meteor/             # Owned by ubuntu:ubuntu (uid 1000)
├── openclaw.json               # Model config: MiniMax M2.7 primary
├── exec-approvals.json         # Conservative allowlist
├── credentials/                # Auto-created on first startup
│   ├── telegram-pairing.json
│   └── telegram-default-allowFrom.json  # Approved user IDs
├── (runtime dirs auto-created: agents/, cache/, cron/, delivery-queue/,
│    devices/, identity/, logs/, media/, memory/, tasks/, telegram/)
└── workspace/                  # Agent workspace
    ├── AGENTS.md               # LLM-Wiki protocol (full v0.2)
    ├── TOOLS.md                # Wiki tool patterns
    └── vault/                  # Obsidian vault (git repo)
        └── (see Vault Structure below)
```

### Vault Structure (llm-wiki v0.2)

```
~/.openclaw-meteor/workspace/vault/     # Git repo, branch: main
├── .git/                               # Git metadata
├── .obsidian/                          # Obsidian vault config
│   ├── app.json                        # Link format, view mode
│   ├── appearance.json                 # Font sizes
│   └── graph.json                      # Graph view colors (raw=blue, wiki=green, output=orange)
├── _index.md                           # Master index: stats, quick nav, recent changes
├── config.md                           # Wiki title, scope, conventions
├── log.md                              # Append-only activity log
├── inbox/                              # Drop zone for files
│   └── .processed/                     # Processed inbox items
├── raw/                                # Immutable source material
│   ├── _index.md                       # Sources overview + links to type indexes
│   ├── articles/                       # Web articles, blog posts
│   │   └── _index.md
│   ├── papers/                         # Academic papers, arxiv
│   │   └── _index.md
│   ├── repos/                          # GitHub/GitLab repositories
│   │   └── _index.md
│   ├── notes/                          # Freeform text, quotes, manual input
│   │   └── _index.md
│   └── data/                           # CSV, JSON, datasets
│       └── _index.md
├── wiki/                               # Compiled articles (Meteor-maintained)
│   ├── _index.md                       # Articles overview + links to category indexes
│   ├── concepts/                       # Bounded ideas (1-3 pages each)
│   │   └── _index.md
│   ├── topics/                         # Broad themes spanning concepts
│   │   └── _index.md
│   ├── references/                     # Curated collections and resource lists
│   │   └── _index.md
│   └── theses/                         # Thesis investigations with evidence + verdicts
│       └── _index.md
└── output/                             # Generated artifacts
    ├── _index.md                       # Output overview + project list
    └── projects/                       # Multi-file outputs
        └── .archive/                   # Archived projects
```

---

## Config File Specifications

### ~/instances/meteor/docker-compose.yml

```yaml
name: meteor

services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE:-openclaw:local}
    environment:
      HOME, TERM, OPENCLAW_GATEWAY_TOKEN, OPENCLAW_ALLOW_INSECURE_PRIVATE_WS,
      TZ, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, PERPLEXITY_API_KEY,
      GEMINI_API_KEY, MINIMAX_API_KEY
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
    ports: 18791:18789, 18792:18790
    healthcheck: /healthz every 30s
    restart: unless-stopped

  openclaw-cli:       # Optional debug shell (not auto-started)
    profiles: [cli]   # Start with: docker compose run --rm openclaw-cli
```

### ~/.openclaw-meteor/openclaw.json (key fields)

```json
{
  "agents.list[0].identity.name": "Meteor",
  "agents.defaults.model.primary": "minimax/MiniMax-M2.7",
  "agents.defaults.model.fallbacks": [
    "openrouter/deepseek/deepseek-v3.2",
    "openrouter/google/gemma-4-31b-it:free"
  ],
  "gateway.auth.token": "<unique per instance>",
  "gateway.controlUi.allowedOrigins": ["http://localhost:18791", "http://127.0.0.1:18791"],
  "plugins.allow": ["telegram", "openrouter", "memory-core"],
  "channels.telegram.dmPolicy": "pairing",
  "channels.telegram.groupAllowFrom": ["467473650"],
  "tools.elevated.enabled": false,
  "tools.exec.security": "full"
}
```

No vLLM, no qrcode plugin, no TTS, no image generation, no group chat configs.

### ~/.openclaw-meteor/exec-approvals.json

```json
{
  "version": 1,
  "socket": { "path": "/home/node/.openclaw/exec-approvals.sock" },
  "defaults": { "security": "allowlist", "ask": "on-miss", "askFallback": "deny" },
  "agents": {
    "main": { "security": "full", "ask": "off", "allowlist": [] }
  }
}
```

Agent `main` has full exec. Socket path resolves inside container (each instance mounts own config dir to `/home/node/.openclaw/`).

---

## LLM-Wiki Protocol Summary

Based on `https://github.com/nvk/llm-wiki` v0.2 (MIT License).

### Core Concept

Raw sources are "source code". The LLM (Meteor) is the "compiler". Wiki articles are the "executable". The human rarely edits the wiki — Meteor maintains it.

### File Formats

**Raw source** (immutable):
```yaml
---
title: "Title"
source: "URL or MANUAL"
type: articles|papers|repos|notes|data
ingested: YYYY-MM-DD
tags: [tag1, tag2]
summary: "2-3 sentence summary"
---
```

**Wiki article** (synthesized):
```yaml
---
title: "Article Title"
category: concept|topic|reference
sources: [raw/type/file1.md, ...]
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
aliases: [alternate names]
confidence: high|medium|low
summary: "2-3 sentence summary"
---
```

**Output artifact**:
```yaml
---
title: "Output Title"
type: summary|report|study-guide|slides|timeline|glossary|comparison
sources: [wiki/category/article.md, ...]
generated: YYYY-MM-DD
---
```

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Raw source | `YYYY-MM-DD-slug.md` | `2026-04-13-attention-is-all-you-need.md` |
| Wiki article | `slug.md` | `transformer-architecture.md` |
| Output | `{type}-{topic}-{date}.md` | `summary-transformers-2026-04-13.md` |

All lowercase, hyphens, no special chars, max 60 chars.

### Dual-Linking Convention

Every cross-reference uses both formats on the same line:

```markdown
[[slug|Display Name]] ([Display Name](../category/slug.md))
```

- Obsidian reads `[[wikilink]]` for graph view and backlinks
- The LLM follows `(markdown link)` for navigation
- GitHub renders the markdown link as clickable

### Operations

| Operation | What It Does |
|-----------|-------------|
| **Ingest** | Fetch URL or text → save to `raw/` with frontmatter → update indexes |
| **Compile** | Read new raw sources → synthesize into `wiki/` articles → dual-link → update indexes |
| **Query** | Read indexes → find relevant articles → answer with citations |
| **Research** | Web search → ingest → compile (automated pipeline) |
| **Thesis** | For/against research on a claim → evidence tables → verdict |
| **Output** | Generate artifact (report, summary, etc.) from wiki content |
| **Lint** | Check structure, indexes, links, tags, coverage → auto-fix |
| **Retract** | Remove source → clean references → update indexes → log reason |

### Confidence Scoring

Based on source credibility:
- **High**: Multiple peer-reviewed sources agree, or single systematic review
- **Medium**: Single credible source, or multiple with partial agreement
- **Low**: Non-peer-reviewed, sources disagree, or anecdotal

### Navigation (3-Hop Strategy)

1. Read `_index.md` → overview and stats
2. Read `wiki/{category}/_index.md` → scan summaries and tags
3. Read only matched article files

Never scan directories blindly. Indexes are the entry point.

---

## Obsidian Configuration

### .obsidian/app.json

- `alwaysUpdateLinks: true` — auto-update links when files move
- `newLinkFormat: "relative"` — use relative paths
- `useMarkdownLinks: false` — prefer wikilinks
- `showFrontmatter: true` — display YAML frontmatter

### .obsidian/graph.json

Color coding in graph view:
- **Blue** (`#50A0EC`): `path:raw` — source material
- **Green** (`#318555`): `path:wiki` — compiled articles
- **Orange** (`#FFA500`): `path:output` — generated artifacts

---

## Network Isolation

Each Docker Compose project creates its own network:
- `openclaw_default` (Atlas)
- `meteor_default` (Meteor)

Containers cannot communicate across projects. Atlas cannot read Meteor's vault, and vice versa. The only shared resource is the Docker image `openclaw:local`.

---

## File Ownership

All files in `~/.openclaw-meteor/` must be owned by `ubuntu:ubuntu` (uid 1000, gid 1000). Inside the container, the `node` user is uid 1000. Ownership mismatch = container can't write.

Fix: `sudo chown -R ubuntu:ubuntu ~/.openclaw-meteor/`

---

## Resource Usage

| Component | RAM (idle) | RAM (active) |
|-----------|-----------|-------------|
| Atlas container | ~370 MB | ~600 MB |
| Meteor container | ~370 MB | ~600 MB |
| Quiz bot | ~50 MB | ~80 MB |
| OS + buffers | ~800 MB | ~800 MB |
| **Total** | **~1.6 GB** | **~2.1 GB** |
| **Available** | **7.8 GB** | **7.8 GB** |

Headroom: 5-6 GB. A third instance fits easily.
