# Atlas Trivia Game Workflow

How Atlas (the bot) creates and manages trivia games via the game server.

## Prerequisites

- Game server running on port 8080: `node apps/trivia/server.js`
- Tailscale Funnel active: `tailscale funnel 8080`

## Flow

### 1. User Requests a Game

User says something like:
- "Atlas, start a trivia game"
- "Atlas, quiz us about space"
- "Atlas, trivia time!"

### 2. Atlas Creates a Room

```bash
curl -s http://localhost:8080/api/create-room -X POST \
  -H 'Content-Type: application/json' \
  -d '{"topic":"space","questionCount":7}'
```

Response:
```json
{
  "roomCode": "a1b2c3",
  "joinUrl": "https://srv1176342.taile65f65.ts.net/game?room=a1b2c3",
  "status": "LOBBY",
  "players": 0
}
```

### 3. Atlas Sends the Web App Button

Atlas sends a message to the group with an InlineKeyboardButton:
```
web_app: { url: "https://srv1176342.taile65f65.ts.net/game?room=a1b2c3" }
```

Message example:
> Trivia time! Topic: **Space** (7 questions)
> Tap the button below to join!

### 4. (Optional) Atlas Monitors the Lobby

```bash
curl -s http://localhost:8080/api/room/a1b2c3
```

Atlas can announce: "3 players have joined so far!"

### 5. Game Plays (Automatic)

The first player to join is the room creator and can start the game from the WebView. The game runs automatically through all questions.

### 6. Atlas Fetches Results

After the game ends (state becomes `GAME_OVER`):

```bash
curl -s http://localhost:8080/api/results/a1b2c3
```

Response:
```json
{
  "roomCode": "a1b2c3",
  "topic": "space",
  "standings": [
    { "rank": 1, "name": "Alice", "score": 5200, "correct": 5 },
    { "rank": 2, "name": "Bob", "score": 3800, "correct": 4 }
  ],
  "summary": "Alice dominated the Space round with 5200 points...",
  "totalQuestions": 7,
  "duration": 180000
}
```

Atlas posts the `summary` field to the group chat, or crafts its own message from the structured data.

### 7. Error Handling

If the game server is down:
> "The game server isn't running right now. Let me check on that."

If room creation fails:
> "Something went wrong setting up the game. Try again in a moment."

## TOOLS.md Snippet

Paste this into Atlas's workspace TOOLS.md for the exec tool:

```
## Trivia Game

Create multiplayer trivia games for the group.

### Create a game
curl -s http://localhost:8080/api/create-room -X POST -H 'Content-Type: application/json' -d '{"topic":"TOPIC","questionCount":7}'
Returns: { roomCode, joinUrl, status, players }
Use joinUrl for the web_app button URL.

### Check game status
curl -s http://localhost:8080/api/room/ROOMCODE
Returns: { status, players, currentQuestion, totalQuestions }

### Get results (after game ends)
curl -s http://localhost:8080/api/results/ROOMCODE
Returns: { standings, summary, totalQuestions, duration }
Post the summary to chat.
```
