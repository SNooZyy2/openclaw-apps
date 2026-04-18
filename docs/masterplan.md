# Masterplan

> **This is the living project management document for openclaw-apps.**
> It is the single source of truth for current focus, active work, and status.
> Read it at the start of every task. Update it after every increment.

**Last updated**: 2026-04-18

---

## Standing Instructions

1. **Every agent and task MUST read this file before starting work.**
2. **Every agent and task MUST update this file after producing an increment** — even a small one. Update the relevant status, move items between sections, add notes.
3. For architecture, infra, and reference details, see [docs/project-context.md](project-context.md). Only load it when you need that depth.
4. For code conventions and style rules, see [CLAUDE.md](../CLAUDE.md).

---

## Current Focus

**Quiz game improvements** — the quiz feature is the active development area. QR is stable and complete (ADR-004, shipped 2026-03-31).

### Active: ADR-005 — Module Separation (Quiz and QR)

Restructure `apps/trivia/` from a flat file layout into feature directories (`quiz/`, `qr/`, `web/`). Rename `quiz-bot.js` → `bot.js`. Extract command handlers. Rename all internal "QuizBot" identifiers.

**ADR**: [docs/adr/005-module-separation-quiz-qr.md](adr/005-module-separation-quiz-qr.md)
**Tickets**: [docs/implementation/adr-005-module-separation/](implementation/adr-005-module-separation/)

| WP | Name | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 1 | [Directory structure + file moves](implementation/adr-005-module-separation/wp-1-directory-structure.md) | Small | Done | git mv only, rename quiz-bot.js → bot.js |
| 2 | [Extract handlers + rename identifiers](implementation/adr-005-module-separation/wp-2-extract-handlers.md) | Medium | Done | Created quiz/handler.js + qr/handler.js, slimmed bot.js |
| 3 | [Update paths + DI wiring](implementation/adr-005-module-separation/wp-3-update-paths.md) | Small | Done | All paths fixed, zero stale identifiers |
| 4 | [Smoke test](implementation/adr-005-module-separation/wp-4-smoke-test.md) | Small | Pending | Stale identifier check + all commands + Mini App |
| 5 | [Update docs](implementation/adr-005-module-separation/wp-5-update-docs.md) | Small | Pending | CLAUDE.md, operations, workflow docs |

**Execution order**: WP-1 → WP-2 → WP-3 (do together, single commit) → WP-4 → WP-5

---

## Completed Work

| When | What | ADR |
|------|------|-----|
| 2026-03-21 | Multiplayer trivia game — live Kahoot-style quiz via Telegram Mini App | ADR-001 |
| 2026-03-22 | Frontend design — neon-terminal theme, animations, sound effects | ADR-002 |
| 2026-03-26 | Telegram identity verification — server-side initData HMAC | ADR-003 |
| 2026-03-31 | QR code rendering overhaul — EC-H, logo compositing, hi-res | ADR-004 |
| 2026-04-13 | OpenClaw upgrade 2026.3.14 → 2026.4.12-beta.1 | — |
| 2026-04-13 | Post-upgrade fixes: MEDIA delivery, edit tool, group chat NO_REPLY, dedup | — |
| 2026-04-13 | Multi-instance deploy: Atlas migrated to ~/instances/atlas/, Meteor deployed as @MeteorBotBot | ADR-007 |
| 2026-04-18 | Fix blank screen on quiz question transitions during WebSocket reconnection ([#5](https://github.com/SNooZyy2/openclaw-apps/issues/5)) | — |
| 2026-04-18 | Reveal screen: more reading time (5→8 s) and fun-fact visual bump | ADR-010 |

---

### Active: ADR-007 — Multi-Instance OpenClaw (Atlas + Meteor)

Deploy a second OpenClaw instance ("Meteor") as a separate Docker container alongside Atlas. Meteor manages an Obsidian vault. Separate operators, separate configs, shared image.

**ADR**: [docs/adr/007-multi-instance-openclaw-meteor.md](adr/007-multi-instance-openclaw-meteor.md)

| WP | Name | Status | Notes |
|----|------|--------|-------|
| 1 | Directory structure | Done | `~/instances/`, `~/.openclaw-meteor/`, vault git repo |
| 2 | Atlas instance config | Done | `~/instances/atlas/` — project name `openclaw`, migrated from `~/openclaw/` |
| 3 | Meteor instance config | Done | `~/instances/meteor/`, openclaw.json, exec-approvals, AGENTS.md, TOOLS.md |
| 4 | Migrate Atlas | Done | Stopped old, started from `~/instances/atlas/`, container name preserved |
| 5 | Deploy Meteor | Done | `@MeteorBotBot` running, Telegram pairing approved |
| 6 | Vault git sync | Pending | Needs private GitHub repo, Obsidian Git plugin setup |
| 7 | Update docs | Done | ADR-007, vps-config/multi-instance-deployment.md, masterplan |

---

## Backlog / Ideas

*(Add future work items here as they come up. Move to "Active" when starting.)*

- Quiz: new game modes (e.g. speed round, team play)
- Quiz: more question sources / difficulty levels
- Quiz: per-topic leaderboards
- Config split: `config.js` has quiz-only timing mixed with shared env vars (63 LOC, not urgent)

---

## Key Decisions in Effect

- **Three bots, three processes**: Atlas (`@SNooZyy_bot`) and Meteor (`@MeteorBotBot`) each run in their own OpenClaw Docker container; quiz bot (`@AtlasQuizBotBot`) runs as a separate systemd service. See ADR-007.
- **No npm packages beyond `ws`**: Use Node built-ins for everything. No bot frameworks, no image libraries beyond what we wrote.
- **CommonJS only**: No ESM (`import`/`export`), no `"type": "module"`. Node 22+ CommonJS.
- **500-line file limit**: Split into modules when exceeded. Applies to source, docs, and HTML.
- **Apps are self-contained**: Each app directory has everything it needs. No global installs, no shared libraries between apps.
