#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type ParsedPlaywrightArgs = {
  copyUpdatedSnapshots: boolean;
  playwrightArgs: string[];
};

const PLAYWRIGHT_SNAPSHOT_MODES = new Set([
  "all",
  "changed",
  "missing",
  "none",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dockerCommand = process.platform === "win32" ? "docker.exe" : "docker";

const PLAYWRIGHT_IMAGE =
  process.env.PLAYWRIGHT_LINUX_IMAGE ??
  "mcr.microsoft.com/playwright:v1.58.2-noble";
const PLAYWRIGHT_ROOT_DIR_IN_CONTAINER = "/tmp/noter-playwright-linux";
const PLAYWRIGHT_CONFIG_PATH = "playwright.config.ts";
const PNPM_STORE_DIR = "/pnpm/store";
const HOST_PNPM_STORE_DIR =
  process.env.PLAYWRIGHT_LINUX_PNPM_STORE ??
  path.join(
    process.env.HOME || os.homedir() || os.tmpdir(),
    ".cache/noter-playwright-linux-pnpm-store",
  );

const parsedArgs = parsePlaywrightArgs(process.argv.slice(2));
const appPlaywrightConfigPath = path.join(
  repoRoot,
  "apps",
  "noter",
  PLAYWRIGHT_CONFIG_PATH,
);

if (!existsSync(appPlaywrightConfigPath)) {
  exitWithError(`Expected ${appPlaywrightConfigPath}.`);
}

assertDockerWorks();
mkdirSync(HOST_PNPM_STORE_DIR, { recursive: true });

const dockerArgs = buildDockerArgs(parsedArgs);
const result = spawnSync(dockerCommand, dockerArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  exitWithError(result.error.message);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);

function parsePlaywrightArgs(rawArgs: string[]): ParsedPlaywrightArgs {
  const normalizedArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : [...rawArgs];
  const playwrightArgs: string[] = [];
  let copyUpdatedSnapshots = false;

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === "--update-snapshots" || arg === "-u") {
      copyUpdatedSnapshots = true;
      const nextArg = normalizedArgs[index + 1];
      // Only consume the next token when it is one of Playwright's documented
      // snapshot modes; otherwise leave positional filters like spec paths
      // untouched.
      if (nextArg && PLAYWRIGHT_SNAPSHOT_MODES.has(nextArg)) {
        playwrightArgs.push(`--update-snapshots=${nextArg}`);
        index += 1;
      } else {
        playwrightArgs.push("--update-snapshots=changed");
      }
      continue;
    }
    if (arg.startsWith("--update-snapshots=") || arg.startsWith("-u=")) {
      copyUpdatedSnapshots = true;
      playwrightArgs.push(
        arg.startsWith("-u=") ? `--update-snapshots=${arg.slice(3)}` : arg,
      );
      continue;
    }
    playwrightArgs.push(arg);
  }

  return {
    copyUpdatedSnapshots,
    playwrightArgs,
  };
}

function assertDockerWorks(): void {
  const versionResult = spawnSync(dockerCommand, ["info"], {
    stdio: "ignore",
  });
  if (versionResult.error) {
    exitWithError(
      "Docker is required to run Linux Playwright visuals locally.",
    );
  }
  if (versionResult.status !== 0) {
    exitWithError("Docker is installed but the daemon is not running.");
  }
}

function buildDockerArgs(parsed: ParsedPlaywrightArgs): string[] {
  const args = [
    "run",
    "--rm",
    "--env",
    "HOME=/tmp/home",
    "--env",
    "CI=true",
    "--env",
    `COPY_UPDATED_SNAPSHOTS=${parsed.copyUpdatedSnapshots ? "1" : "0"}`,
    "--env",
    "PLAYWRIGHT_SKIP_BUILD=1",
    "--env",
    "PLAYWRIGHT_VITE_PORT=43121",
    "--volume",
    `${repoRoot}:/host`,
    "--volume",
    `${HOST_PNPM_STORE_DIR}:${PNPM_STORE_DIR}`,
  ];

  if (
    typeof process.getuid === "function" &&
    typeof process.getgid === "function"
  ) {
    args.push("--user", `${process.getuid()}:${process.getgid()}`);
  }

  args.push(
    PLAYWRIGHT_IMAGE,
    "bash",
    "-lc",
    buildContainerScript(),
    "bash",
    ...parsed.playwrightArgs,
  );

  return args;
}

function buildContainerScript(): string {
  return `
set -euo pipefail

mkdir -p "$HOME"
rm -rf "${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"
mkdir -p "${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"

# Copy the current worktree into an isolated Linux workspace so the host
# node_modules stay native to Windows or macOS while Linux-only snapshots can
# still be refreshed.
tar \\
  --exclude=.git \\
  --exclude=.turbo \\
  --exclude=.cache \\
  --exclude=node_modules \\
  --exclude=apps/noter/e2e/live-test-results \\
  --exclude=apps/noter/e2e/playwright-report \\
  --exclude=apps/noter/e2e/test-results \\
  -C /host \\
  -cf - . | tar -C "${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}" -xf -

cd "${PLAYWRIGHT_ROOT_DIR_IN_CONTAINER}"

pnpm_cmd() {
  npx --yes pnpm@9.15.0 "$@"
}

pnpm_cmd --store-dir "${PNPM_STORE_DIR}" install --frozen-lockfile
PLAYWRIGHT=1 pnpm_cmd --filter noter build:ci

test_exit=0
pnpm_cmd --filter noter exec playwright test -c "${PLAYWRIGHT_CONFIG_PATH}" "$@" || test_exit=$?

if [ "$COPY_UPDATED_SNAPSHOTS" = "1" ]; then
  find apps/noter/e2e -type d -name "*-snapshots" -print0 | while IFS= read -r -d "" snapshot_dir; do
    mkdir -p "/host/\${snapshot_dir}"
    cp -a "\${snapshot_dir}/." "/host/\${snapshot_dir}/"
  done
fi

exit "$test_exit"
`.trim();
}

function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}
