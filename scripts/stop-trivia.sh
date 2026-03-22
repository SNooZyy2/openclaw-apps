#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$ROOT_DIR/apps/trivia"
PID_FILE="$APP_DIR/server.pid"
PORT="${PORT:-8080}"

# Stop server
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "[trivia] Server stopped (PID $PID)"
  else
    echo "[trivia] Server not running (stale PID file)"
  fi
  rm -f "$PID_FILE"
else
  echo "[trivia] No PID file found, nothing to stop"
fi

# Stop Tailscale Funnel
echo "[trivia] To stop Funnel: tailscale funnel --remove $PORT"
