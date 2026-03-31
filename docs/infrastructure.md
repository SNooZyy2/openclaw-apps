# Infrastructure

## VPS

- **Hostname**: `srv1176342`
- **Public IP**: `72.62.89.238`
- **OS**: Debian Linux (kernel 6.8.0-106-generic)
- **User**: `snoozyy`

## Tailscale

- **Node name**: `srv1176342`
- **Tailscale IP**: `100.111.208.123`
- **DNS name**: `srv1176342.taile65f65.ts.net`
- **Funnel**: Active — `tailscale funnel 8080` → `https://srv1176342.taile65f65.ts.net`

### Funnel Management
```bash
tailscale funnel status          # Check funnel status
tailscale funnel 8080            # Re-enable if stopped
tailscale funnel --remove 8080   # Remove funnel
```

## Docker

- **OpenClaw container**: `openclaw-openclaw-gateway-1`
  - Ports: 18789-18790 (mapped to host)
  - Config: `/home/snoozyy/.openclaw/` (bind mount)
  - Image: `openclaw:local` (custom patched Dockerfile)
  - Compose file: `/home/snoozyy/openclaw/docker-compose.yml`

## Port Map

| Port | Service | Accessible |
|------|---------|------------|
| 18789 | OpenClaw gateway (WS + HTTP) | LAN (0.0.0.0) |
| 18790 | OpenClaw node bridge | LAN (0.0.0.0) |
| 18791 | Browser control (container internal) | localhost only |
| 8080 | Quiz bot + game server (systemd: atlas-quiz-bot) | Via Tailscale Funnel |

## Key File Paths

| Path | Description |
|------|-------------|
| `/home/snoozyy/openclaw/` | OpenClaw repo + docker-compose |
| `/home/snoozyy/.openclaw/` | OpenClaw runtime config (bind mount into container) |
| `/home/snoozyy/openclaw-apps/` | This project — apps, games, docs |
| `/home/snoozyy/openclaw-apps/apps/trivia/` | Quiz bot + game server (all trivia/QR code files) |
| `/home/snoozyy/.openclaw/workspace/` | Agent workspace (IDENTITY.md, TOOLS.md, etc.) |
