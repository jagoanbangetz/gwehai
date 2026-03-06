#!/usr/bin/env bash
# Run backend and frontend locally with npm.
# Usage: ./local.sh [--db]
#   --db    Start PostgreSQL with docker compose before running apps

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

START_DB=false
for arg in "$@"; do
  case "$arg" in
    --db) START_DB=true ;;
  esac
done

cleanup() {
  echo "Stopping backend..."
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

if [ "$START_DB" = true ]; then
  echo "Starting PostgreSQL..."
  docker compose up -d postgres
  echo "Waiting for Postgres to be ready..."
  sleep 3
fi

echo "Starting backend (npm run start:dev)..."
(cd "$ROOT/backend" && npm run start:dev) &
BACKEND_PID=$!

echo "Waiting for backend to listen..."
sleep 5

echo "Starting frontend (npm run dev)..."
(cd "$ROOT/frontend" && npm run dev)
