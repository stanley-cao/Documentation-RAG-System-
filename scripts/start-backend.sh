#!/usr/bin/env bash
# Start the FastAPI backend (http://localhost:8000) on macOS/Linux.
# Usage: ./scripts/start-backend.sh
set -euo pipefail

# Resolve project root from this script's location (path contains spaces, so quote everything)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/backend"

# Use `python -m` rather than venv/bin/uvicorn so a moved venv's stale shebangs can't break startup
exec venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
