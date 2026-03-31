# WP-1: Infrastructure

**Depends on**: Nothing
**Enables**: All other work packages

## Goal

Set up the project scaffolding, Tailscale Funnel, and lifecycle scripts so that all subsequent work has a running HTTPS endpoint to deploy into.

---

## Issues

### 1.1 — Project scaffolding

**Type**: Task
**Effort**: Small

Create the `apps/trivia/` directory with placeholder files and initialize the Node.js project.

**Acceptance criteria**:
- `apps/trivia/` exists with `server.js`, `index.html`, `questions.json`
- `package.json` exists with `ws` as the only dependency
- `node_modules` is gitignored
- `node apps/trivia/server.js` starts without errors and logs "listening on :8080"

**Deliverables**:
- `apps/trivia/package.json`
- `apps/trivia/server.js` (minimal — HTTP server that serves `index.html` and responds 200 on `/health`)
- `apps/trivia/index.html` (placeholder — "Trivia game loading...")
- `.gitignore` entry for `node_modules`

---

### 1.2 — Tailscale Funnel setup & verification

**Type**: Task
**Effort**: Small

Configure Tailscale Funnel on port 8080 and verify HTTPS works end-to-end from an external device.

**Acceptance criteria**:
- `tailscale funnel 8080` is running
- `https://srv1176342.taile65f65.ts.net/health` returns 200 from an external network
- Documented if ACL changes were needed in Tailscale admin

**Deliverables**:
- Verified HTTPS endpoint
- Notes in `docs/infrastructure.md` if any Tailscale config changes were required

---

### 1.3 — Start/stop lifecycle scripts

**Type**: Task
**Effort**: Small

Scripts to start and stop the game server + funnel in one command.

**Acceptance criteria**:
- `scripts/start-trivia.sh` starts the Node.js server (backgrounded) and Tailscale Funnel, writes PID to a file
- `scripts/stop-trivia.sh` kills the server process using the PID file, tears down funnel
- Both scripts are idempotent (running start twice doesn't spawn duplicates, stop when not running is a no-op)

**Deliverables**:
- `scripts/start-trivia.sh`
- `scripts/stop-trivia.sh`
