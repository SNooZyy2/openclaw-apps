# App Ideas & Demo Plans

## Priority: Multiplayer Telegram Game

### Concept
Real-time multiplayer game that runs inside Telegram as a Web App (Mini App). Bot sends a "Play" button → everyone taps → joins the same game instance → plays together live.

### Requirements
- **HTTPS endpoint**: Tailscale Funnel (`tailscale funnel <port>`) → `https://srv1176342.taile65f65.ts.net`
- **WebSocket server**: Node.js on the VPS for real-time state sync
- **HTML client**: Single-file, responsive, works in Telegram's WebView
- **Telegram Web App API**: `window.Telegram.WebApp` for user identity, theme colors

### Game Ideas (ranked by demo impact)

1. **Reaction Race** — A prompt appears, first to tap wins the round. 10 rounds, leaderboard. Dead simple, instantly engaging.
2. **Live Trivia** — Bot generates questions, everyone answers on their phone, scores update in real-time. Shows AI + multiplayer.
3. **Drawing Guess** — One player draws (touch canvas), others guess. Classic Pictionary energy.
4. **Tug of War** — Two teams, tap as fast as you can. Pure chaos, great for groups.
5. **Word Chain** — Each player has 5 seconds to type a word starting with the last letter. Pressure + fun.

### Architecture
```
Telegram Group Chat
    │
    ├── Bot sends InlineKeyboardButton { web_app: { url: "https://srv1176342.taile65f65.ts.net/game" } }
    │
    └── Players tap button
         │
         ├── Telegram opens WebView → loads game HTML
         │
         └── HTML connects via WebSocket to game server
              │
              └── Node.js WebSocket server (same VPS)
                   ├── Manages game rooms
                   ├── Syncs state to all players
                   └── Reports results back to bot (optional)
```

### Implementation Plan
1. Set up Tailscale Funnel on a port (e.g. 8080)
2. Build game server (`apps/reaction-race/server.js`)
3. Build game client (`apps/reaction-race/index.html`)
4. Test locally via browser
5. Connect to bot — bot triggers new game rounds, sends Web App button

---

## Other Demo Ideas (no HTTPS needed)

### Ready Now (pure text/media)
- **ASCII art generator** — drop a word, get styled ASCII art
- **Roast bot** — playful roasts per person
- **Trivia game** — text-based, bot tracks scores across messages
- **Compatibility test** — two names in, absurd scoring categories out
- **Group yearbook** — superlatives based on answers
- **Daily standup parody** — fake news briefing with group context

### Ready with Exec (owner only)
- **QR code generator** — `npx qrcode` available in container
- **Plot/chart generation** — needs matplotlib (pip not available) or use Node.js canvas alternative
- **Live benchmark** — CPU/memory stress test from container
- **Build a CLI tool** — write + test + report

### Blocked / Needs Work
- **HTML games in chat** — needs HTTPS (Tailscale Funnel)
- **Plot generation** — no pip/matplotlib, would need Node.js charting lib
- **Browser automation** — no Chrome in container
