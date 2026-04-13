#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_LINUX_IMAGE:-mcr.microsoft.com/playwright:v1.58.2-noble}"
PLAYWRIGHT_ROOT_DIR_IN_CONTAINER="/tmp/noter-playwright-linux"
PLAYWRIGHT_CONFIG_PATH="playwright.config.ts"
PNPM_STORE_DIR="/pnpm/store"
HOST_PNPM_STORE_DIR="${PLAYWRIGHT_LINUX_PNPM_STORE:-${HOME}/.cache/noter-playwright-linux-pnpm-store}"
COPY_UPDATED_SNAPSHOTS=0
PLAYWRIGHT_ARGS=()

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run Linux Playwright visuals locally." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but the daemon is not running." >&2
  exit 1
fi

if [ ! -f "${ROOT_DIR}/apps/noter/${PLAYWRIGHT_CONFIG_PATH}" ]; then
  echo "Expected apps/noter/${PLAYWRIGHT_CONFIG_PATH} in ${ROOT_DIR}." >&2
  exit 1
fi

mkdir -p "${HOST_PNPM_STORE_DIR}"

for arg in "$@"; do
  case "${arg}" in
    --update-snapshots)
      COPY_UPDATED_SNAPSHOTS=1
      PLAYWRIGHT_ARGS+=("--update-snapshots=changed")
      ;;
    --update-snapshots=*)
      COPY_UPDATED_SNAPSHOTS=1
      PLAYWRIGHT_ARGS+=("${arg}")
      ;;
    *)
      PLAYWRIGHT_ARGS+=("${arg}")
      ;;
  esac
done

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp/home \
  --env CI=true \
  --env COPY_UPDATED_SNAPSHOTS="${COPY_UPDATED_SNAPSHOTS}" \
  --env PLAYWRIGHT_SKIP_BUILD=1 \
  --env PLAYWRIGHT_VITE_PORT=43121 \
  --env PLAYWRIGHT_HOST_ROOT=/host \
  --volume "${ROOT_DIR}:/host" \
  --volume "${HOST_PNPM_STORE_DIR}:${PNPM_STORE_DIR}" \
  "${PLAYWRIGHT_IMAGE}" \
  bash -lc '
    set -euo pipefail

    mkdir -p "$HOME"
    rm -rf "'"${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"'"
    mkdir -p "'"${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"'"

    # Copy the current worktree into an isolated Linux workspace so the host
    # node_modules stay native to macOS while Linux-only snapshots can still be refreshed.
    tar \
      --exclude=.git \
      --exclude=.turbo \
      --exclude=node_modules \
      --exclude=apps/noter/e2e/live-test-results \
      --exclude=apps/noter/e2e/playwright-report \
      --exclude=apps/noter/e2e/test-results \
      -C /host \
      -cf - . | tar -C "'"${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"'" -xf -

    cd "'"${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"'"

    pnpm_cmd() {
      npx --yes pnpm@9.15.0 "$@"
    }

    pnpm_cmd --store-dir "'"${PNPM_STORE_DIR}"'" install --frozen-lockfile
    PLAYWRIGHT=1 pnpm_cmd --filter noter build:ci

    test_exit=0
    pnpm_cmd --filter noter exec playwright test -c "'"${PLAYWRIGHT_CONFIG_PATH}"'" "$@" || test_exit=$?

    if [ "${COPY_UPDATED_SNAPSHOTS}" = "1" ]; then
      find apps/noter/e2e -type d -name "*-snapshots" -print0 | while IFS= read -r -d "" snapshot_dir; do
        mkdir -p "/host/${snapshot_dir}"
        cp -a "${snapshot_dir}/." "/host/${snapshot_dir}/"
      done
    fi

    exit "${test_exit}"
  ' bash "${PLAYWRIGHT_ARGS[@]}"
