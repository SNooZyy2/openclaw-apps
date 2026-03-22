#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$ROOT_DIR/apps/trivia"
PID_FILE="$APP_DIR/server.pid"
PORT="${PORT:-8080}"

# Source API keys from OpenClaw env if not already set
if [ -f "$HOME/openclaw/.env" ]; then
  [ -z "${GEMINI_API_KEY:-}" ] && GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' "$HOME/openclaw/.env" | cut -d= -f2-)
  [ -z "${OPENROUTER_API_KEY:-}" ] && OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' "$HOME/openclaw/.env" | cut -d= -f2-)
  QUIZ_BOT_TOKEN=$(grep '^QUIZ_BOT_TOKEN=' "$HOME/openclaw/.env" | cut -d= -f2- || true)
  export GEMINI_API_KEY OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
  export QUIZ_BOT_TOKEN="${QUIZ_BOT_TOKEN:-}"
fi

# Check if already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[trivia] Already running (PID $(cat "$PID_FILE"))"
  exit 0
fi

# Install deps if needed
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "[trivia] Installing dependencies..."
  cd "$APP_DIR" && npm install --silent
fi

# Start server
echo "[trivia] Starting server on port $PORT..."
cd "$APP_DIR"
PORT="$PORT" GEMINI_API_KEY="$GEMINI_API_KEY" OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}" QUIZ_BOT_TOKEN="${QUIZ_BOT_TOKEN:-}" nohup node server.js >> "$APP_DIR/server.log" 2>&1 &
echo $! > "$PID_FILE"
echo "[trivia] Server started (PID $(cat "$PID_FILE"))"
echo "[trivia] Logs: tail -f $APP_DIR/server.log"
echo "[trivia] Game URL: https://srv1176342.taile65f65.ts.net/game"
