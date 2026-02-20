#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-$(pwd)}"
cd "$WORKSPACE_DIR"

"$WORKSPACE_DIR/scripts/bootstrap-worktree.js"

if ! command -v codex >/dev/null 2>&1; then
  echo "Installing @openai/codex..."
  npm install -g @openai/codex
fi

if [ -d ".codespace-agent" ] && [ ! -d ".codespace-agent/node_modules" ]; then
  echo "Installing .codespace-agent dependencies..."
  (cd .codespace-agent && npm install --no-package-lock)
fi
