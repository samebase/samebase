#!/usr/bin/env bash

set -euo pipefail

# The checks and Playwright jobs need the exact same anonymous Convex bootstrap
# so generated files, env writes, waits, and cleanup stay aligned.
CONVEX_AGENT_MODE=anonymous pnpm --filter noter exec convex dev --until-success --typecheck=disable --tail-logs=disable > /tmp/convex-bootstrap.log 2>&1 &
bootstrap_pid=$!

# Fail fast if bootstrap exits immediately instead of waiting for timeouts.
sleep 2
if ! kill -0 "$bootstrap_pid" 2>/dev/null; then
  echo "Convex bootstrap exited early:"
  cat /tmp/convex-bootstrap.log
  exit 1
fi

timeout 60 bash -c 'until grep -q "^CONVEX_DEPLOYMENT=" apps/noter/.env.local 2>/dev/null; do sleep 1; done'
timeout 90 bash -c 'until curl -sf http://127.0.0.1:3210/instance_name >/dev/null; do sleep 1; done'

pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_CLIENT_ID ci-placeholder
pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_CLIENT_SECRET ci-placeholder
pnpm --filter noter exec convex env set PROVIDER_GITHUB_OAUTH_REDIRECT_URL https://example.com/oauth/github/callback

timeout 180 bash -c 'until grep -q "Convex functions ready!" /tmp/convex-bootstrap.log; do sleep 1; done'

if kill -0 "$bootstrap_pid" 2>/dev/null; then
  kill "$bootstrap_pid" || true
  wait "$bootstrap_pid" || true
fi

tail -n 80 /tmp/convex-bootstrap.log
