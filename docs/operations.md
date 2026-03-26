# Atlas Quiz — Operations Guide

## Server Management

```bash
# Start the server
~/openclaw-apps/scripts/start-trivia.sh

# Stop the server
~/openclaw-apps/scripts/stop-trivia.sh

# Restart (stop + start)
~/openclaw-apps/scripts/stop-trivia.sh && ~/openclaw-apps/scripts/start-trivia.sh

# Check if server is running
cat ~/openclaw-apps/apps/trivia/server.pid && kill -0 $(cat ~/openclaw-apps/apps/trivia/server.pid) 2>/dev/null && echo "running" || echo "not running"

# View live logs
tail -f ~/openclaw-apps/apps/trivia/server.log

# View last 50 log lines
tail -50 ~/openclaw-apps/apps/trivia/server.log

# Health check
curl -s https://srv1176342.taile65f65.ts.net/health | jq
```

## Telegram Bot Commands (in group chat)

| Command | Who | What |
|---------|-----|------|
| `/quiz [topic]` | Anyone | Start a new quiz game |
| `/quiz` | Anyone | Start with "General Knowledge" topic |
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
| `apps/trivia/server.pid` | PID of running server |
| `apps/trivia/highscores.json` | Persistent highscore data |
| `apps/trivia/questions.json` | Fallback question bank (used when Gemini is down) |
| `~/openclaw/.env` | API keys (GEMINI_API_KEY, QUIZ_BOT_TOKEN, etc.) |

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
