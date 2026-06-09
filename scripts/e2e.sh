#!/usr/bin/env bash
# End-to-end test runner.
#
# Boots `next dev` against a fresh in-process PGlite database (no external
# services), waits for it to be ready, runs Playwright against it, then tears the
# server down. We manage the server here rather than via Playwright's `webServer`
# option because that spawns commands in a shell where the local `next` binary
# and `npx` don't resolve/behave reliably in every environment.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT=3100
DB_DIR="$ROOT/.e2e-tmp/db"
EMAIL_FILE="$ROOT/.e2e-tmp/emails.jsonl"
DEV_LOG="$ROOT/.e2e-tmp/dev.log"

export AGTLS_TEST_DB_DIR="$DB_DIR"
export AGTLS_TEST_EMAIL_FILE="$EMAIL_FILE"
export NEXT_PUBLIC_APP_URL="http://localhost:$PORT"
export BETTER_AUTH_URL="http://localhost:$PORT"
export BETTER_AUTH_SECRET="e2e-secret-not-used-for-anything-real"
export DATABASE_URL="postgresql://e2e:e2e@localhost/e2e"

# Fresh database + email log.
echo "[e2e] migrating test database..."
npx tsx test/e2e/migrate-db.ts || { echo "[e2e] migration failed"; exit 1; }

# Start the dev server.
echo "[e2e] starting next dev on port ${PORT}..."
npx next dev -p "$PORT" > "$DEV_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  pkill -P "$SERVER_PID" 2>/dev/null || true
  pkill -f "next dev -p $PORT" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for readiness (up to 90s).
echo "[e2e] waiting for server..."
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null "http://localhost:$PORT/"; then
    echo "[e2e] server ready"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[e2e] server exited early; dev log:"; tail -40 "$DEV_LOG"; exit 1
  fi
  sleep 1
done

if ! curl -sf -o /dev/null "http://localhost:$PORT/"; then
  echo "[e2e] server never became ready; dev log:"; tail -40 "$DEV_LOG"; exit 1
fi

# Run Playwright against the already-running server.
echo "[e2e] running playwright..."
npx playwright test "$@"
STATUS=$?

echo "[e2e] playwright exited with $STATUS"
exit $STATUS
