# OpenClaw Upgrade: 2026.3.14 → 2026.4.12-beta.1

**Date**: 2026-04-13
**Commits merged**: ~10,200 from upstream
**Conflicts resolved**: 3 (labeler.yml, pnpm-lock.yaml, media trust test) + 1 stash conflict (Dockerfile)
**Custom commits preserved**: 2 (QR code plugin)
**Quiz/QR bot impact**: None — runs as a separate process

---

## Major New Features

### Active Memory Plugin
Optional memory sub-agent that auto-recalls relevant preferences and context before each reply. Configurable modes, `/verbose` inspection, transcript persistence for debugging.

### Codex Provider
Bundled `codex/gpt-*` provider with Codex-managed auth, native threads, model discovery, and compaction. Separate from the normal `openai/gpt-*` path.

### LM Studio Integration
Bundled local/self-hosted provider with runtime model discovery, stream preload, and memory-search embeddings. Use your own local models alongside cloud providers.

### CLI: `openclaw exec-policy`
New `show`/`preset`/`set` subcommands for managing `tools.exec.*` config and exec approval sync.

### Gateway RPC: `commands.list`
Remote clients can now discover all runtime, text, skill, and plugin commands dynamically.

### macOS Talk Mode: Local MLX Speech
Experimental local speech provider with utterance playback, interruption handling, and system-voice fallback.

---

## Channel / Extension Updates

### Microsoft Teams
- Federated credentials (certificate + managed identity)
- Reaction support, pin/unpin/read actions
- Graph pagination for large conversations

### Matrix
- MSC4357 live markers — typewriter-style draft preview animation

### Feishu
- Richer document comment sessions with reactions and typing feedback

### fal/HeyGen
- Seedance 2.0 video generation models added

### Plugin Architecture
- Plugins can now declare activation/setup descriptors
- CLI, provider, and channel loading narrowed to manifest-declared needs only

---

## Security Fixes

- Removed `busybox`/`toybox` from interpreter-safe binaries
- Blocked env-argv assignment injection and broadened shell-wrapper detection
- Fixed empty approver list bypassing explicit approval authorization
- Blanked example gateway credentials; startup now fails on placeholder tokens
- Tightened Telegram `allowFrom` sender validation
- Hardened exec preflight, host env denylisting, plugin install dependency scanning
- QQBot SSRF media path fixes and browser/sandbox SSRF defenses
- Windows OAuth URLs now open via `explorer.exe` to prevent command injection

---

## Notable Bug Fixes

- **WhatsApp**: media sends, reconnect stability, default account routing, reaction routing
- **Dreaming**: heartbeat deduplication, narrative cleanup, promotion thresholds, diary timezones
- **Memory/QMD**: Unicode slug handling, nested daily notes, short-term recall, collection deduplication
- **Telegram**: approval button deadlock resolved; topic session path stability
- **Agents**: orphaned mid-run messages no longer dropped; cross-provider failover no longer inherits stale failure state
- **`openclaw update`**: fixed post-update plugin refresh crash on stale dist chunks

---

## Our Custom Additions (preserved through upgrade)

These commits were kept on top of upstream:

1. **`445e3d24ea`** — `feat(qrcode): add ATLAS-branded QR code generator plugin`
   - OpenClaw extension at `extensions/qrcode/`
   - Registers `generate_qr_code` tool for the gateway

2. **`6808087936`** — `fix(qrcode): trust generate_qr_code tool for local media delivery`
   - Adds `generate_qr_code` to the trusted media tools list
   - Allows QR images to be delivered as local files

---

## Post-Upgrade Configuration (2026-04-13)

### Exec policy: yolo → cautious

Previous config was `security: full, ask: off` (equivalent to `yolo` — anything runs).
Changed to `cautious` preset via:
```bash
docker exec openclaw-openclaw-gateway-1 node dist/index.js exec-policy preset cautious
```

Allowlist added to `~/.openclaw/exec-approvals.json` under `agents.main.allowlist`:
`python3`, `cat`, `ls`, `date`, `echo`, `head`, `tail`, `wc`, `find`, `grep`.

Deliberately excluded: `curl`, `wget` (network exfiltration risk), `rm`/`mv`/`cp` (destructive),
`bash`/`sh` (shell escape), `node` (arbitrary JS), `apt`/`pip` (package installs).

**Lessons learned**:
- The allowlist lives inside `agents.<agentId>` (not top-level). The agent ID is `main`.
- The gateway needs a restart to pick up allowlist changes.
- `tools.elevated.enabled: true` with `defaultLevel: "on"` (hardcoded in `bash-command.ts:355`)
  intercepts ALL exec calls before the allowlist is checked, routing them through socket-based
  approval. With no approval daemon running, every exec times out. Fix: disable elevated exec
  (`tools.elevated.enabled: false`) and rely on the `cautious` allowlist policy instead.
- Allowlist patterns **must use full paths** (e.g. `/usr/bin/python3 *`, not `python3 *`).
  The matcher in `exec-command-resolution.ts:351` checks `hasPath` — patterns without `/`
  are silently skipped and never match. Use `which <cmd>` inside the container to find paths.

### matplotlib installed

Added `python3-matplotlib` to the container (via `apt-get` live, and in Dockerfile for persistence).

**`MEDIA:` auto-delivery is broken.** The old method (printing `MEDIA:/tmp/chart.png` in exec output)
no longer delivers files to chat. Diagnosis (2026-04-13): exec creates the PNG correctly, but the
framework never picks up the `MEDIA:` prefix. The working method is the `message` tool with `filePath`:
```json
{"action": "send", "filePath": "/tmp/chart.png", "caption": "Description"}
```

### `edit` tool rejects new files

The `edit` tool now fails when `oldText` is empty (i.e., creating a new file via edit). DeepSeek
must use `write` for new files. This caused silent failures on every message because DeepSeek tried
to create daily memory files via `edit`. Added guidance to workspace `TOOLS.md`.

### DeepSeek NO_REPLY in group chats

DeepSeek v3.2 was too aggressive about using `NO_REPLY` (staying silent) in group chats, even when
directly mentioned by name. Root cause: the AGENTS.md "stay silent" rules didn't explicitly exempt
direct mentions. Fixed by adding mandatory-respond rules: "When someone mentions you by name, you
MUST ALWAYS respond with text. Never use NO_REPLY when directly addressed."

### Duplicate message delivery in groups

The gateway occasionally re-delivers the same Telegram message to the agent, causing duplicate
responses (e.g., charts sent twice). Observed pattern: first delivery processes normally, then
~2 minutes later the same message re-appears (sometimes with `stop=error` on first retry).
May be related to `streaming.mode: "partial"` config. Mitigated via AGENTS.md dedup instructions.

### Agent instructions

OpenClaw reads `AGENTS.md` from the workspace dir (`~/.openclaw/workspace/AGENTS.md`), NOT
`CLAUDE.md`. A stale `CLAUDE.md` was sitting in the config root unread — removed it.
Tool-specific notes go in `TOOLS.md` (same workspace dir).

### Workspace files updated (2026-04-13)

- **TOOLS.md**: Added `edit` vs `write` guidance, replaced `MEDIA:` chart delivery with `message` tool method
- **AGENTS.md**: Added mandatory-respond rule for direct mentions, dedup instructions, no-bare-filename rule

---

## Upgrade Process (for future reference)

```bash
cd ~/openclaw
git fetch upstream
git stash push -m "pre-upgrade changes"
git merge upstream/main --no-edit
# resolve conflicts
git commit --no-edit --no-verify  # skip lint for upstream code
git stash pop
# resolve stash conflicts if any
docker build -t openclaw:local .
docker compose up -d
```
