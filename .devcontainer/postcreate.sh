#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-$(pwd)}"
cd "$WORKSPACE_DIR"

CACHE_ROOT=""
if [ -d /vscode ] && [ -w /vscode ]; then
  CACHE_ROOT="/vscode/noter-cache"
  mkdir -p "$CACHE_ROOT"
  export PNPM_HOME="${PNPM_HOME:-$CACHE_ROOT/pnpm-home}"
  export PNPM_STORE_DIR="${PNPM_STORE_DIR:-$CACHE_ROOT/pnpm-store}"
  export PATH="$PNPM_HOME:$PATH"
fi

hash_inputs=()
for file in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
  if [ -f "$file" ]; then
    hash_inputs+=("$file")
  fi
done

if [ -d "apps" ]; then
  while IFS= read -r file; do
    hash_inputs+=("$file")
  done < <(find apps -maxdepth 3 -name package.json -print | sort)
fi

hash_file="${CACHE_ROOT:-$WORKSPACE_DIR/.devcontainer}/pnpm-install.hash"
current_hash=""
if [ ${#hash_inputs[@]} -gt 0 ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    current_hash="$(
      for file in "${hash_inputs[@]}"; do
        printf "%s\n" "$file"
        cat "$file"
      done | sha256sum | awk '{print $1}'
    )"
  else
    current_hash="$(
      for file in "${hash_inputs[@]}"; do
        printf "%s\n" "$file"
        cat "$file"
      done | shasum -a 256 | awk '{print $1}'
    )"
  fi
fi

previous_hash=""
if [ -f "$hash_file" ]; then
  previous_hash="$(cat "$hash_file")"
fi

if [ ! -d node_modules ] || [ -z "$current_hash" ] || [ "$current_hash" != "$previous_hash" ]; then
  echo "Installing dependencies with pnpm..."
  pnpm install --frozen-lockfile --prefer-offline
  if [ -n "$current_hash" ]; then
    mkdir -p "$(dirname "$hash_file")"
    echo "$current_hash" > "$hash_file"
  fi
else
  echo "Dependencies unchanged; skipping pnpm install."
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Installing @openai/codex..."
  npm install -g @openai/codex
fi

if [ -d ".codespace-agent" ] && [ ! -d ".codespace-agent/node_modules" ]; then
  echo "Installing .codespace-agent dependencies..."
  (cd .codespace-agent && npm install --no-package-lock)
fi
