# Atlas Quiz — Operations Guide

## Server Management

The quiz bot runs as a systemd service (`atlas-quiz-bot`). It auto-restarts on crash (5s delay).

```bash
# Service management (preferred)
sudo systemctl status atlas-quiz-bot
sudo systemctl restart atlas-quiz-bot
sudo systemctl stop atlas-quiz-bot
sudo systemctl start atlas-quiz-bot

# View live logs
tail -f ~/openclaw-apps/apps/trivia/server.log

# View last 50 log lines
tail -50 ~/openclaw-apps/apps/trivia/server.log

# Health check
curl -s https://srv1176342.taile65f65.ts.net/health | jq
```

### systemd Service

Unit file: `/etc/systemd/system/atlas-quiz-bot.service`
Source: `apps/trivia/atlas-quiz-bot.service`

- Runs as user `snoozyy`
- Loads env vars from `~/openclaw/.env` (needs `QUIZ_BOT_TOKEN`, `GEMINI_API_KEY`)
- Logs to `apps/trivia/server.log`
- `Restart=always`, `RestartSec=5`

To update the service file after editing:
```bash
sudo cp ~/openclaw-apps/apps/trivia/atlas-quiz-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart atlas-quiz-bot
```

## Telegram Bot Commands (in group chat)

| Command | Who | What |
|---------|-----|------|
| `/quiz [topic]` | Anyone | Start a new quiz game |
| `/quiz` | Anyone | Start with "General Knowledge" topic |
| `/qr <text or URL>` | Anyone | Generate an ATLAS-branded QR code |
| `/cost` | Anyone | Show Atlas API token usage and costs |
| `/quizstop` | Owner only | Kill all active game rooms immediately |
| `/quizreset` | Owner only | Wipe all highscores |

## API Endpoints

```bash
# Room status
curl -s https://srv1176342.taile65f65.ts.net/api/room/ROOMCODE | jq

# Create a room manually
curl -s -X POST https://srv1176342.taile65f65.ts.net/api/create-room \
  -H 'Content-Type: application/json' \
  -d '{"topic":"cats","questionCount":5}' | jq

# View highscores
curl -s https://srv1176342.taile65f65.ts.net/api/highscores | jq

# Atlas usage stats
curl -s https://srv1176342.taile65f65.ts.net/api/atlas-usage | jq
```

## File Locations

| File | Purpose |
|------|---------|
| `apps/trivia/server.log` | Server logs (all game activity) |
| `apps/trivia/highscores.json` | Persistent highscore data |
| `apps/trivia/questions.json` | Fallback question bank (used when LLM APIs are down) |
| `apps/trivia/qr-encode.js` | QR Code Model 2 encoder (EC-H, standalone) |
| `apps/trivia/qr-render.js` | ATLAS-branded QR renderer (logo compositing, neon glow) |
| `apps/trivia/png-encode.js` | PNG encode/decode (only node:zlib) |
| `apps/trivia/atlas-logo.png` | 152×152 center logo for QR codes |
| `apps/trivia/atlas-quiz-bot.service` | systemd unit file (source of truth) |
| `~/openclaw/.env` | API keys (GEMINI_API_KEY, QUIZ_BOT_TOKEN, PERPLEXITY_API_KEY, etc.) |

## Tailscale Funnel

```bash
# Check funnel status
tailscale funnel status

# Re-enable funnel if it stopped
tailscale funnel 8080

# Remove funnel
tailscale funnel --remove 8080
```

## Troubleshooting

**Bot not responding to /quiz:**
- Check logs: `tail -20 ~/openclaw-apps/apps/trivia/server.log`
- Look for `poll error` or missing `QUIZ_BOT_TOKEN`
- Restart the server

**Players can't join:**
- Check if server is running (health check above)
- Check if Tailscale funnel is active
- Look for `initData verification failed` in logs

**Game stuck / can't start new game:**
- Use `/quizstop` in the group chat to kill all rooms
- Or restart the server

**Highscores corrupted:**
- Use `/quizreset` in the group chat
- Or manually: `echo '{"games":[],"players":{}}' > ~/openclaw-apps/apps/trivia/highscores.json`
