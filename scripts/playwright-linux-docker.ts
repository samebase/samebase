#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  fail,
  isMainModule,
  resolveRepoRoot,
  runMain,
} from "./lib/scriptRuntime.ts";

const DEFAULT_IMAGE = "mcr.microsoft.com/playwright:v1.58.2-noble";
const DEFAULT_OUT_DIR = ".tmp/playwright-linux";
const DEFAULT_PNPM_STORE_VOLUME = "noter-playwright-linux-pnpm-store";
const DEFAULT_VITE_PORT = "43121";

const CONTAINER_SCRIPT = String.raw`set -euo pipefail

corepack enable
corepack prepare pnpm@11.1.1 --activate >/dev/null

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
  --exclude=apps/noter/.convex/local \
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
`;

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function stripPnpmSeparator(args: string[]): string[] {
  if (args[0] === "--") {
    return args.slice(1);
  }

  return args;
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

function ensureDockerIsRunning(): void {
  const result = spawnSync(
    "docker",
    ["info", "--format", "{{.Architecture}}"],
    {
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    fail("Docker is not running. Start OrbStack/Docker and retry.");
  }
}

function hasSnapshotUpdateArg(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--update-snapshots" ||
      arg === "-u" ||
      arg.startsWith("--update-snapshots=") ||
      arg.startsWith("-u="),
  );
}

function printRunHeader(image: string, platform: string, outDir: string): void {
  console.log(`Running Noter Playwright visuals in Linux Docker
  image:    ${image}
  platform: ${platform}
  report:   ${outDir}/playwright-report/index.html
`);
}

function printArtifactPaths(outDir: string): void {
  console.log(`
Linux Playwright artifacts:
  ${outDir}/playwright-report/index.html
  ${outDir}/test-results/
`);
}

function runDocker(
  repoRoot: string,
  runnerPath: string,
  outDirPath: string,
  args: string[],
): number {
  ensureDockerIsRunning();
  const defaultPlatform = "linux/arm64";
  const image = readEnv("PLAYWRIGHT_LINUX_IMAGE", DEFAULT_IMAGE);
  const platform = readEnv("PLAYWRIGHT_LINUX_PLATFORM", defaultPlatform);
  const pnpmStoreVolume = readEnv(
    "PLAYWRIGHT_LINUX_PNPM_STORE_VOLUME",
    DEFAULT_PNPM_STORE_VOLUME,
  );
  const vitePort = readEnv("PLAYWRIGHT_VITE_PORT", DEFAULT_VITE_PORT);
  const updateSnapshots = hasSnapshotUpdateArg(args) ? "1" : "0";
  const outDir = path.relative(repoRoot, outDirPath) || outDirPath;

  printRunHeader(image, platform, outDir);

  const dockerArgs = [
    "run",
    "--rm",
    "--platform",
    platform,
    "-e",
    `PLAYWRIGHT_LINUX_UPDATE_SNAPSHOTS=${updateSnapshots}`,
    "-e",
    `PLAYWRIGHT_VITE_PORT=${vitePort}`,
    "-v",
    `${repoRoot}:/src`,
    "-v",
    `${outDirPath}:/out`,
    "-v",
    `${runnerPath}:/runner.sh:ro`,
    "-v",
    `${pnpmStoreVolume}:/pnpm-store`,
    image,
    "bash",
    "/runner.sh",
    ...args,
  ];
  const result = spawnSync("docker", dockerArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  printArtifactPaths(outDir);

  if (result.error) {
    fail(result.error.message);
  }

  return result.status ?? 1;
}

async function main(): Promise<void> {
  if (!commandExists("docker")) {
    fail("Docker is not installed or is not available on PATH.");
  }

  const repoRoot = resolveRepoRoot();
  const playwrightArgs = stripPnpmSeparator(process.argv.slice(2));
  const outDirRaw = readEnv("PLAYWRIGHT_LINUX_OUT", DEFAULT_OUT_DIR);
  const outDirPath = path.resolve(repoRoot, outDirRaw);
  const tempDir = path.resolve(repoRoot, ".tmp");
  const runnerPath = path.join(
    tempDir,
    `playwright-linux-docker-${process.pid}.sh`,
  );

  rmSync(outDirPath, { recursive: true, force: true });
  mkdirSync(outDirPath, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(runnerPath, CONTAINER_SCRIPT, { mode: 0o600 });

  try {
    const status = runDocker(repoRoot, runnerPath, outDirPath, playwrightArgs);
    process.exitCode = status;
  } finally {
    rmSync(runnerPath, { force: true });
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
