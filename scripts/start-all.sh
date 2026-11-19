#!/usr/bin/env bash
# Start backend and frontend together; Ctrl+C stops both.
# Usage: ./scripts/start-all.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/start-backend.sh" &
BACKEND_PID=$!
"$SCRIPT_DIR/start-frontend.sh" &
FRONTEND_PID=$!

# Kill both child processes when this script exits
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' EXIT INT TERM
wait
