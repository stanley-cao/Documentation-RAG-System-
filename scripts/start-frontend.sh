#!/usr/bin/env bash
# Start the Vite frontend (http://localhost:5173) on macOS/Linux.
# Usage: ./scripts/start-frontend.sh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/frontend"

exec npm run dev
