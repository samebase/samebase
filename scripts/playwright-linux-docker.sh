#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start OrbStack/Docker and retry." >&2
  exit 1
fi

docker_arch="$(docker info --format "{{.Architecture}}")"
case "$docker_arch" in
  aarch64 | arm64)
    default_platform="linux/arm64"
    ;;
  amd64 | x86_64)
    default_platform="linux/amd64"
    ;;
  *)
    default_platform="linux/arm64"
    ;;
esac

image="${PLAYWRIGHT_LINUX_IMAGE:-mcr.microsoft.com/playwright:v1.58.2-noble}"
platform="${PLAYWRIGHT_LINUX_PLATFORM:-$default_platform}"
out_dir="${PLAYWRIGHT_LINUX_OUT:-.tmp/playwright-linux}"
pnpm_store_volume="${PLAYWRIGHT_LINUX_PNPM_STORE_VOLUME:-noter-playwright-linux-pnpm-store}"
vite_port="${PLAYWRIGHT_VITE_PORT:-43121}"

playwright_args=("$@")
if [ "${#playwright_args[@]}" -gt 0 ] && [ "${playwright_args[0]}" = "--" ]; then
  playwright_args=("${playwright_args[@]:1}")
fi

update_snapshots=0
for arg in "${playwright_args[@]}"; do
  case "$arg" in
    --update-snapshots | -u)
      update_snapshots=1
      ;;
  esac
done

rm -rf "$out_dir"
mkdir -p "$out_dir"

cat <<EOF
Running Noter Playwright visuals in Linux Docker
  image:    $image
  platform: $platform
  report:   $out_dir/playwright-report/index.html

EOF

set +e
docker run --rm \
  --platform "$platform" \
  -e PLAYWRIGHT_LINUX_UPDATE_SNAPSHOTS="$update_snapshots" \
  -e PLAYWRIGHT_VITE_PORT="$vite_port" \
  -v "$repo_root":/src \
  -v "$repo_root/$out_dir":/out \
  -v "$pnpm_store_volume":/pnpm-store \
  "$image" \
  bash -lc '
set -euo pipefail

corepack enable
corepack prepare pnpm@9.15.0 --activate >/dev/null

rm -rf /work
mkdir -p /work
cd /src
tar \
  --exclude=.git \
  --exclude=.tmp \
  --exclude=.turbo \
  --exclude=.vite \
  --exclude=.env \
  --exclude=.env.* \
  --exclude=apps/noter/.env \
  --exclude=apps/noter/.env.* \
  --exclude=node_modules \
  --exclude=apps/noter/node_modules \
  --exclude=apps/noter/dist \
  --exclude=apps/noter/dev-dist \
  --exclude=apps/noter/e2e/playwright-report \
  --exclude=apps/noter/e2e/test-results \
  -cf - . | tar -xf - -C /work

cd /work
pnpm config set store-dir /pnpm-store >/dev/null
pnpm install --frozen-lockfile
node ./scripts/ci-bootstrap-convex.ts
PLAYWRIGHT=1 pnpm --filter noter build:ci

set +e
PLAYWRIGHT_SKIP_BUILD=1 \
  PLAYWRIGHT_VITE_PORT="$PLAYWRIGHT_VITE_PORT" \
  pnpm --filter noter exec playwright test -c playwright.config.ts "$@"
status=$?
set -e

rm -rf /out/playwright-report /out/test-results
if [ -d apps/noter/e2e/playwright-report ]; then
  cp -a apps/noter/e2e/playwright-report /out/playwright-report
fi
if [ -d apps/noter/e2e/test-results ]; then
  cp -a apps/noter/e2e/test-results /out/test-results
fi

if [ "$PLAYWRIGHT_LINUX_UPDATE_SNAPSHOTS" = "1" ]; then
  find apps/noter/e2e -type d -name "*-snapshots" -print0 |
    while IFS= read -r -d "" snapshot_dir; do
      target="/src/$snapshot_dir"
      mkdir -p "$target"
      find "$target" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      cp -a "$snapshot_dir/." "$target/"
    done

  if [ -d apps/noter/public/visual-fixtures ]; then
    mkdir -p /src/apps/noter/public/visual-fixtures
    cp -a apps/noter/public/visual-fixtures/. /src/apps/noter/public/visual-fixtures/
  fi
fi

exit "$status"
' bash "${playwright_args[@]}"
docker_status=$?
set -e

cat <<EOF

Linux Playwright artifacts:
  $out_dir/playwright-report/index.html
  $out_dir/test-results/
EOF

exit "$docker_status"
