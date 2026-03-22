#!/bin/sh
# Usage: start-game.sh "topic" [chat_id]
# Creates a room and sends the join button to Telegram. Returns the room code.
TOPIC="${1:-General Knowledge}"
CHAT_ID="${2:--1003889708134}"
SERVER="https://srv1176342.taile65f65.ts.net"

# Create room
RESPONSE=$(curl -s "$SERVER/api/create-room" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"$TOPIC\",\"questionCount\":5}")

ROOM_CODE=$(echo "$RESPONSE" | grep -o '"roomCode":"[^"]*"' | cut -d'"' -f4)
JOIN_URL=$(echo "$RESPONSE" | grep -o '"joinUrl":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ROOM_CODE" ]; then
  echo "ERROR: Failed to create room. Is the game server running? Response: $RESPONSE"
  exit 1
fi

# Send Telegram message with join button
SEND_RESULT=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":$CHAT_ID,\"text\":\"🎯 Atlas Quiz!\\n\\nTopic: $TOPIC\\n5 questions, 15 seconds each\\n\\nTap below to join!\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"▶ Join Atlas Quiz\",\"url\":\"$JOIN_URL\"}]]}}")

OK=$(echo "$SEND_RESULT" | grep -o '"ok":true')
if [ -z "$OK" ]; then
  echo "ERROR: Failed to send Telegram message. Response: $SEND_RESULT"
  exit 1
fi

echo "Game created! Room: $ROOM_CODE | Join: $JOIN_URL"
echo "To check results later: curl -s $SERVER/api/results/$ROOM_CODE"
