#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/daytona-refresh.sh <sandbox-id-or-name> [branch] [repo-dir]

Defaults:
  branch   main
  repo-dir /home/daytona/workspace/noter

Auth:
  Uses GITHUB_TOKEN if set, otherwise falls back to `gh auth token`.

Optional env:
  DAYTONA_REMOTE_URL  If set, updates remote.origin.url before fetch.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ -z "${1:-}" ]; then
  usage
  exit 1
fi

sandbox="$1"
branch="${2:-main}"
repo_dir="${3:-/home/daytona/workspace/noter}"

if ! command -v daytona >/dev/null 2>&1; then
  echo "daytona CLI not found in PATH."
  exit 1
fi

token="${GITHUB_TOKEN:-}"
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then
  token="$(gh auth token 2>/dev/null || true)"
fi

if [ -z "$token" ]; then
  echo "Missing GitHub token. Set GITHUB_TOKEN or run: gh auth login"
  exit 1
fi

if [ -n "${DAYTONA_REMOTE_URL:-}" ]; then
  daytona exec "$sandbox" -- git -C "$repo_dir" remote set-url origin "$DAYTONA_REMOTE_URL"
fi

basic="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
header="AUTHORIZATION: basic ${basic}"

daytona exec "$sandbox" -- git -C "$repo_dir" -c "http.extraHeader=$header" fetch origin "$branch" --depth=1
daytona exec "$sandbox" -- git -C "$repo_dir" checkout -f -B "$branch" FETCH_HEAD
daytona exec "$sandbox" -- git -C "$repo_dir" reset --hard FETCH_HEAD
sha="$(daytona exec "$sandbox" -- git -C "$repo_dir" rev-parse HEAD)"

echo "Refreshed $sandbox ($branch) -> $sha"
