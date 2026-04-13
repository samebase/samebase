#!/usr/bin/env bash

set -euo pipefail

# The checks and Playwright jobs need the exact same anonymous Convex bootstrap
# so generated files, env writes, waits, and cleanup stay aligned.
CONVEX_AGENT_MODE=anonymous pnpm --filter noter exec convex dev --until-success --typecheck=disable --tail-logs=disable > /tmp/convex-bootstrap.log 2>&1 &
bootstrap_pid=$!

dump_bootstrap_log() {
  echo "Recent Convex bootstrap log:"
  tail -n 200 /tmp/convex-bootstrap.log 2>/dev/null || true
}

fail_bootstrap_wait() {
  local description="$1"
  local timeout_seconds="$2"
  echo "Timed out waiting for ${description} after ${timeout_seconds}s."
  dump_bootstrap_log
  if kill -0 "$bootstrap_pid" 2>/dev/null; then
    kill "$bootstrap_pid" || true
    wait "$bootstrap_pid" || true
  fi
  exit 1
}

wait_for_bootstrap() {
  local description="$1"
  local timeout_seconds="$2"
  local command="$3"
  timeout "$timeout_seconds" bash -c "$command" || fail_bootstrap_wait "$description" "$timeout_seconds"
}

# Fail fast if bootstrap exits immediately instead of waiting for timeouts.
sleep 2
if ! kill -0 "$bootstrap_pid" 2>/dev/null; then
  echo "Convex bootstrap exited early:"
  dump_bootstrap_log
  exit 1
fi

# Blacksmith runners occasionally need longer to materialize apps/noter/.env.local
# and bring the local backend online than our happy-path runs.
wait_for_bootstrap "CONVEX_DEPLOYMENT in apps/noter/.env.local" 120 'until grep -q "^CONVEX_DEPLOYMENT=" apps/noter/.env.local 2>/dev/null; do sleep 1; done'
wait_for_bootstrap "local Convex backend on http://127.0.0.1:3210/instance_name" 120 'until curl -sf http://127.0.0.1:3210/instance_name >/dev/null; do sleep 1; done'

pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_CLIENT_ID ci-placeholder
pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_CLIENT_SECRET ci-placeholder
pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_REDIRECT_URL https://example.com/oauth/github/callback

wait_for_bootstrap "Convex functions ready!" 180 'until grep -q "Convex functions ready!" /tmp/convex-bootstrap.log; do sleep 1; done'

if kill -0 "$bootstrap_pid" 2>/dev/null; then
  kill "$bootstrap_pid" || true
  wait "$bootstrap_pid" || true
fi

tail -n 80 /tmp/convex-bootstrap.log
