# ADR-007: Multi-Instance OpenClaw — Atlas + Meteor with Obsidian Vault Management

**Status**: Accepted
**Date**: 2026-04-13
**Author**: snoozyy

---

## Context

We run one OpenClaw instance ("Atlas") on a single VPS (2 vCPU, 8 GB RAM, 96 GB disk). Atlas handles AI chat, fact-checking, image generation, TTS, memory, and is complemented by a separate quiz bot process for `/quiz` and `/qr`.

A second use case has emerged: an AI-managed **Obsidian vault**. A new bot ("Meteor") should manage a markdown knowledge base — creating, organizing, linking, and searching notes — accessible both through Telegram and from Obsidian app/desktop clients.

### Why a Separate Instance?

1. **Separate operators.** Different people will operate Atlas and Meteor. They need isolated configs, personalities, exec policies, and Telegram tokens. One operator's changes must never affect the other.
2. **Different purpose.** Atlas is a general-purpose AI assistant with custom skills (quiz, QR, fact-check, mediation). Meteor is a knowledge management bot. Mixing them would bloat both.
3. **Security boundary.** Each operator controls their own exec policy, workspace, and API keys. Meteor's operator should not be able to read Atlas's memory, conversations, or credentials — and vice versa.

### Current Single-Instance Setup

```
~/openclaw/                     # OpenClaw source + Dockerfile
  docker-compose.yml            # Single gateway + CLI
  .env                          # All tokens and keys in one file
~/.openclaw/                    # Config dir (mounted into container)
  openclaw.json                 # Model config, plugins, agent identity
  exec-approvals.json           # Exec allowlist
  workspace/                    # Agent workspace
    AGENTS.md                   # Atlas personality + instructions
    TOOLS.md                    # Tool documentation
    skills/                     # fact-check/, mediation/
    memory/                     # Atlas's persistent memory
```

One `.env`, one `docker-compose.yml`, one config directory. No isolation.

### VPS Resource Budget

| Resource | Total | Currently Used | Available |
|----------|-------|----------------|-----------|
| RAM | 7.8 GB | ~2.6 GB (Atlas container + quiz bot + OS) | ~5.1 GB |
| CPU | 2 vCPU (AMD EPYC 9354P) | Mostly idle (I/O-bound workload) | Ample |
| Disk | 96 GB | 69 GB (72%) | 27 GB |
| Swap | 4 GB | 178 MB | 3.8 GB |

An OpenClaw container uses ~370 MB idle, ~600 MB under load. Two instances fit comfortably. Three would work with staggered usage.

---

## Decision

**Run Atlas and Meteor as separate Docker Compose projects**, each with:
- Its own Telegram bot (separate BotFather token)
- Its own `.env` file
- Its own config directory (`~/.openclaw/`, `~/.openclaw-meteor/`)
- Its own `docker-compose.yml`
- A shared Docker image (`openclaw:local`, built once)

Meteor gets an **Obsidian vault directory** mounted into its workspace, with external access via **Obsidian Git** (git-based sync).

---

## Options Considered

### Option A: Separate Docker Compose Projects (Chosen)

Each instance gets its own project directory under `~/instances/`:

```
~/instances/
  atlas/
    docker-compose.yml
    .env
  meteor/
    docker-compose.yml
    .env
```

Each project uses the same `openclaw:local` image but different config dirs, ports, and tokens.

**Pros:**
- Complete isolation — separate containers, configs, networks
- `docker compose` commands are project-scoped (no accidental cross-instance actions)
- Can start/stop/restart instances independently
- Each operator's config is a separate directory tree
- Shared image means build-once, run-many

**Cons:**
- Two `.env` files and two compose files to maintain
- Port allocation must be manually coordinated
- Slightly more operational overhead than a single compose file

### Option B: Single Docker Compose with Multiple Services

One `docker-compose.yml` with `atlas-gateway`, `meteor-gateway`, etc.

**Pros:**
- Single file to manage
- Shared network by default

**Cons:**
- `docker compose down` takes down BOTH bots — dangerous for separate operators
- `.env` is shared — one operator can see the other's tokens
- Lifecycle is coupled: a bad config change affects both
- Violates the "separate operators" requirement

**Rejected** — lifecycle coupling is unacceptable when different people operate the bots.

### Option C: Separate VMs/VPS Instances

Run each bot on its own VPS.

**Pros:**
- Maximum isolation (OS-level)
- No resource contention

**Cons:**
- 2-3x hosting cost
- 2-3x maintenance burden (OS updates, Docker, etc.)
- Overkill for the workload — each instance uses <600 MB RAM

**Rejected** — resource waste. One VPS handles this easily.

---

## Architecture

### Directory Layout

```
~/openclaw/                          # Shared: OpenClaw source + Dockerfile
  Dockerfile
  src/
  ...

~/instances/                         # Per-instance deployment configs
  atlas/
    docker-compose.yml
    .env
  meteor/
    docker-compose.yml
    .env

~/.openclaw/                         # Atlas config (existing, unchanged)
  openclaw.json
  exec-approvals.json
  workspace/
    AGENTS.md
    TOOLS.md
    skills/
      fact-check/
      mediation/
    memory/

~/.openclaw-meteor/                  # Meteor config (new, owned by ubuntu:ubuntu uid 1000)
  openclaw.json
  exec-approvals.json
  workspace/
    AGENTS.md                        # Meteor personality — knowledge manager
    TOOLS.md
    vault/                           # Obsidian vault (git repo, nested inside workspace repo)
      .git/
      .obsidian/                     # Obsidian settings (synced)
      README.md
      ...notes...
    memory/
```

### Vault Placement Decision

The Obsidian vault lives **inside the workspace** at `~/.openclaw-meteor/workspace/vault/` rather than as a separate mount. Reasons:

1. **OpenClaw agents access workspace files via relative paths.** The agent sees `/home/node/.openclaw/workspace/vault/` and can read/write notes directly with its built-in tools (read, write, edit, exec). No special configuration needed.
2. **Single mount point.** The workspace volume already maps `~/.openclaw-meteor/workspace/` → `/home/node/.openclaw/workspace/`. The vault is just a subdirectory — no extra Docker volume.
3. **Git lives with the content.** The vault is a git repo. Git metadata (`.git/`) stays with the vault, not in a separate bare repo.
4. **Nested git repos work fine.** The workspace directory is itself a git repo (created by OpenClaw). The vault is a nested git repo inside it. Git naturally ignores subdirectories that are separate repositories — no submodule configuration needed.

### Obsidian External Access — Git-Based Sync

Obsidian clients (mobile app, desktop) sync to the vault via the **Obsidian Git** community plugin:

```
VPS (source of truth)
  ~/.openclaw-meteor/workspace/vault/    ← git repo (working repo, source of truth)
       ↑ OpenClaw (Meteor) reads/writes directly
       ↓ push/pull

Remote Git Host (GitHub/Gitea private repo)
       ↑ push/pull
  Obsidian Desktop / Mobile
       (Obsidian Git plugin — auto-commit, auto-pull)
```

**How it works:**
1. The vault directory is initialized as a git repo.
2. A **private GitHub/Gitea repo** acts as the remote origin.
3. **On the VPS**: A cron job or inotify watcher auto-commits and pushes changes made by Meteor.
4. **On Obsidian clients**: The Obsidian Git plugin auto-pulls on open and auto-commits/pushes on change.
5. **Conflict resolution**: Git merge. Obsidian Git plugin handles this. If Meteor and a human edit the same note simultaneously (rare), git creates a merge conflict file that the human resolves in Obsidian.

**Why Git over alternatives:**
- **Obsidian Livesync (CouchDB)**: Stores data in CouchDB, not as flat files. OpenClaw can't read/write the vault directly — it would need CouchDB API calls. Adds ~100 MB RAM for a CouchDB container. Over-engineered for this use case.
- **Syncthing**: Needs Syncthing running on all clients. No version history. Conflict handling is file-level (duplicate files), not line-level.
- **WebDAV (Remotely Save plugin)**: Needs a WebDAV server. Obsidian plugin is less mature than Obsidian Git. No version history.
- **Obsidian Sync (paid)**: $8/month, proprietary, can't be accessed by OpenClaw from inside Docker.

Git is the simplest option that gives: version history, conflict resolution, multi-client sync, and direct filesystem access for OpenClaw.

### Port Allocation

| Instance | Gateway Port | Bridge Port |
|----------|-------------|-------------|
| Atlas | 18789 | 18790 |
| Meteor | 18791 | 18792 |
| *(Future instance 3)* | 18793 | 18794 |

### Container Naming

The current compose project is named `openclaw` (directory-based default), producing containers like `openclaw-openclaw-gateway-1`. To avoid a breaking rename during Atlas migration, the Atlas project retains the name `openclaw`. Only Meteor gets the new name `meteor`.

Container names:
- `openclaw-openclaw-gateway-1` (Atlas — unchanged)
- `meteor-openclaw-gateway-1` (Meteor — new)

### Network Isolation

Each Docker Compose project creates its own default network:
- `atlas_default`
- `meteor_default`

Containers cannot communicate across projects unless explicitly networked. This is the desired isolation.

---

## Compose Services — Gateway and CLI

The current `docker-compose.yml` defines two services:

1. **`openclaw-gateway`** — the main runtime: Telegram polling, agent loop, exec, tools. Always running.
2. **`openclaw-cli`** — an interactive debug/admin shell that shares the gateway's network. Not required for autonomous operation. Currently in `Exited` state.

Both Atlas and Meteor compose files include `openclaw-cli` as an optional service (not auto-started). It can be used on-demand for debugging:

```bash
cd ~/instances/meteor && docker compose run --rm openclaw-cli
```

---

## Meteor Configuration

### openclaw.json (Meteor)

Derived from Atlas's config with these key differences:

- **Agent identity**: `"name": "Meteor"` (not "Atlas")
- **Gateway auth token**: Freshly generated via `openssl rand -hex 24`. Must NOT reuse Atlas's token.
- **Control UI origins**: References Meteor's port (`http://localhost:18791`, `http://127.0.0.1:18791`)
- **No Atlas-specific plugins**: Plugin allowlist omits `qrcode`. No workspace skills (fact-check, mediation).
- **No vLLM provider**: The `vllm` local GPU config (Tailscale IP `100.93.82.98`) is Atlas-specific. Omit unless Meteor operator has Tailscale access.
- **Telegram channels**: Meteor's `channels.telegram` config has its own group IDs and `allowFrom` lists.
- **Same model stack**: Shares OpenRouter/Gemini as primary. Operator can customize later.

### exec-approvals.json (Meteor)

Starts with a conservative allowlist. The socket path `/home/node/.openclaw/exec-approvals.sock` is correct — it resolves inside the container relative to the mount point, not the host. Each container mounts its own config dir to `/home/node/.openclaw/`, so this path works independently per instance.

### Device Identity and Credentials

OpenClaw auto-generates `identity/device.json` (cryptographic keys) and `credentials/` on first startup when they don't exist. **Do NOT copy these from Atlas** — Meteor must generate its own.

The `credentials/telegram-default-allowFrom.json` will need the Meteor **operator's Telegram user ID** once known. This can be set after first pairing, or pre-created if the ID is known.

### Runtime Directories

OpenClaw creates `cron/`, `tasks/`, `delivery-queue/`, `cache/`, `media/`, `telegram/`, `logs/`, `agents/`, `memory/` automatically on first startup. Only `workspace/` and the root config files (`openclaw.json`, `exec-approvals.json`) need to be pre-created.

### AGENTS.md (Meteor)

Meteor's personality and instructions. Key directives:
- Primary job: manage the Obsidian vault at `workspace/vault/`
- Create, edit, organize, link, and search markdown notes
- Maintain consistent formatting, frontmatter, and linking conventions
- Respond to note-related queries by reading the vault
- Auto-commit changes to git after modifications
- No quiz, QR, fact-check, or mediation capabilities

### File Ownership

All files in `~/.openclaw-meteor/` must be owned by `ubuntu:ubuntu` (uid 1000, gid 1000). Inside the container, the `node` user is uid 1000 — ownership must match or the container can't write config, sessions, or vault files.

```bash
sudo chown -R ubuntu:ubuntu ~/.openclaw-meteor/
```

### What Meteor Does NOT Have

| Feature | Atlas | Meteor |
|---------|-------|--------|
| `/quiz` game | Yes | No |
| `/qr` code generator | Yes | No |
| `/fact_check` skill | Yes | No |
| `/mediation` skill | Yes | No |
| Quiz bot process | Yes | No |
| TTS settings | Yes | No (can be added later) |
| vLLM local GPU | Yes | No (can be added later) |
| Obsidian vault management | No | Yes |

---

## Migration Plan for Atlas

Atlas's current setup (`~/openclaw/docker-compose.yml` + `~/openclaw/.env`) must move to the new structure without downtime:

1. **Create `~/instances/atlas/`** with a new `docker-compose.yml` and `.env`.
2. **The new compose file** uses project name `openclaw` (matching the current directory-based default) to preserve the existing container name `openclaw-openclaw-gateway-1`. This avoids breaking monitoring, cron jobs, or scripts that reference the container name.
3. **Stop the old container** (`cd ~/openclaw && docker compose down`).
4. **Start from the new location** (`cd ~/instances/atlas && docker compose up -d`).
5. **Verify** Atlas responds on Telegram.
6. The original `~/openclaw/docker-compose.yml` and `~/openclaw/.env` remain as backups. The source directory is still needed for `docker build`.

The config directory (`~/.openclaw/`) does not move. The `.env` is copied to `~/instances/atlas/.env`.

**Quiz bot is unaffected.** It runs as a separate systemd service (`atlas-quiz-bot`), not via Docker Compose. The `QUIZ_BOT_TOKEN` env var remains in Atlas's `.env` for reference but is consumed by the systemd service via its `EnvironmentFile` directive (still pointing to `~/openclaw/.env`).

**`OPENCLAW_GATEWAY_TOKEN` env var**: Not set in the current `.env` and not required. Gateway authentication is configured in `openclaw.json` under `gateway.auth.token`. This env var can remain empty in both instances' `.env` files.

---

## Implementation Plan

### WP-1: Create directory structure

- Create `~/instances/atlas/` and `~/instances/meteor/`
- Create `~/.openclaw-meteor/workspace/vault/` (full path, recursive)
- Set ownership: `sudo chown -R ubuntu:ubuntu ~/.openclaw-meteor/`
- Initialize vault as git repo

### WP-2: Write Atlas instance config

- Write `~/instances/atlas/docker-compose.yml` (from current, project name `openclaw`, include CLI service)
- Write `~/instances/atlas/.env` (copy from current `~/openclaw/.env`)

### WP-3: Write Meteor instance config

- Write `~/instances/meteor/docker-compose.yml` (project name `meteor`, include CLI service)
- Write `~/instances/meteor/.env` (ports 18791/18792, config dir `~/.openclaw-meteor`, placeholder bot token)
- Write `~/.openclaw-meteor/openclaw.json`:
  - Agent name "Meteor"
  - Fresh gateway auth token (via `openssl rand -hex 24`)
  - Control UI origins on port 18791
  - No vLLM provider
  - Plugin allowlist without qrcode
  - Telegram channels unconfigured (operator sets up after pairing)
- Write `~/.openclaw-meteor/exec-approvals.json` (conservative allowlist, fresh socket token)
- Write `~/.openclaw-meteor/workspace/AGENTS.md` (Meteor personality — vault manager)
- Write `~/.openclaw-meteor/workspace/TOOLS.md` (vault tool documentation)
- Do NOT copy identity/, credentials/, memory/, sessions/, or any runtime dirs from Atlas

### WP-4: Migrate Atlas to new structure

- Stop current Atlas container
- Start Atlas from `~/instances/atlas/`
- Verify Atlas responds on Telegram

### WP-5: Deploy Meteor

- User creates Meteor bot via BotFather (manual step — needs bot token)
- Add bot token to `~/instances/meteor/.env`
- Start Meteor: `cd ~/instances/meteor && docker compose up -d`
- Verify Meteor responds on Telegram

### WP-6: Set up vault git sync

- Initialize vault as git repo
- User creates private GitHub/Gitea repo (manual step)
- Add remote origin to vault repo
- Set up auto-commit cron job on VPS
- User installs Obsidian Git plugin and configures remote

### WP-7: Update docs

- Create `/home/snoozyy/vps-config/` with deployment documentation
- Update `docs/masterplan.md`
- Update `docs/operations.md` with multi-instance commands

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Atlas downtime during migration | Bot unresponsive for 10-30 seconds | Migration is stop-old → start-new, minimal gap. Do during low-traffic hours. |
| Shared API keys hit rate limits | Both bots throttled | Monitor usage. Meteor operator can bring their own keys. |
| Git sync conflicts | Note content garbled | Git merge is line-level. Obsidian Git plugin surfaces conflicts. Rare scenario (AI and human editing same note simultaneously). |
| Disk space pressure (72% used) | Vault growth fills disk | Vault is text — even 10K notes < 100 MB. Monitor with `df`. |
| Operator accidentally modifies wrong instance | Config corruption | Separate directories, separate compose projects. `docker compose` is project-scoped. |
| Meteor bot token not yet created | Can't deploy Meteor | WP-5 blocks on user creating bot via BotFather. Non-blocking for all other work. |

---

## Open Questions

1. **Git remote for vault sync** — GitHub (free private repos) or self-hosted Gitea? GitHub is simpler. Gitea keeps data on the VPS but adds another service. Defer to operator preference.
2. **Auto-commit frequency** — Cron every 5 minutes? Inotify-based immediate commit? Start with cron, upgrade if needed.
3. **Meteor's model stack** — Same as Atlas (DeepSeek v3.2 via OpenRouter) or different? Start with same, operator can customize.
4. **Owner Telegram ID for Meteor** — Same as Atlas (467473650) or different person? Needs to be set in openclaw.json.

---

## References

- ADR-005: Module Separation (precedent for structural separation)
- ADR-006: Atlas Skill Improvements
- [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git)
- [OpenClaw documentation](~/openclaw/docs/)
