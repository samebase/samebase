#!/usr/bin/env node
// source-url: https://noter.md/noter.js
// The file you run is the installer source. Preview or local deploys can ship
// their own hosted copy without teaching users a separate targeting flag.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const NOTER_SYNC_SCRIPT_PATHNAME = "/noter.js";
export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const NOTER_SYNC_STATE_DIRECTORY_NAME = ".noter/sync/installations";
export const NOTER_SYNC_SOURCE_URL = "https://noter.md/noter.js";

/**
 * Parse the tiny public CLI surface without pulling in a dependency. The first
 * shipped command intentionally stays narrow so the install surface remains easy
 * to audit and mirrors the single command shown by the web app.
 */
export function parseCliArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help" };
  }

  if (argv[0] !== "connect") {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    throw new Error(`Unknown option: ${arg}`);
  }

  return { command: "connect" };
}

export function validateSourceUrl(value) {
  const sourceUrl = new URL(value);
  const isLoopbackHttp =
    sourceUrl.protocol === "http:" &&
    (sourceUrl.hostname === "localhost" ||
      sourceUrl.hostname === "127.0.0.1" ||
      sourceUrl.hostname === "::1" ||
      sourceUrl.hostname === "[::1]");
  if (sourceUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error(
      "The installer source URL must use https, except for explicit localhost testing.",
    );
  }
  if (sourceUrl.pathname !== NOTER_SYNC_SCRIPT_PATHNAME) {
    throw new Error(
      `The installer source URL must point to ${NOTER_SYNC_SCRIPT_PATHNAME}.`,
    );
  }
  return sourceUrl;
}

export function detectCodexVersion() {
  const result = spawnSync("codex", ["--version"], {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      "The `codex` command was not found. Install Codex before running noter sync.",
    );
  }

  return (result.stdout || result.stderr).trim();
}

export function buildInstallationId(sourceUrl) {
  const source = new URL(sourceUrl);
  const hostFragment = source.host.replace(/[^a-z0-9.-]+/gi, "-");
  const sourceDigest = createHash("sha256")
    .update(source.toString())
    .digest("hex")
    .slice(0, 12);
  return `${hostFragment}-${sourceDigest}`;
}

export function getInstallationStatePath(args = {}) {
  const homeDirectory = args.homeDirectory ?? homedir();
  const installationId =
    args.installationId ?? buildInstallationId(args.sourceUrl);
  return path.join(
    homeDirectory,
    NOTER_SYNC_STATE_DIRECTORY_NAME,
    `${installationId}.json`,
  );
}

export function buildMachineConnectUrl(args) {
  const machineConnectUrl = new URL(MACHINE_CONNECT_ROUTE, args.sourceUrl);
  machineConnectUrl.searchParams.set("source", args.sourceUrl);
  machineConnectUrl.searchParams.set("installation", args.installationId);
  machineConnectUrl.searchParams.set("openedByCli", "1");
  return machineConnectUrl.toString();
}

export function writeInstallationState(args) {
  const installationPath = getInstallationStatePath({
    homeDirectory: args.homeDirectory,
    installationId: args.installationId,
    sourceUrl: args.sourceUrl,
  });
  const existingRecord = (() => {
    if (!existsSync(installationPath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(installationPath, "utf8"));
    } catch {
      return null;
    }
  })();
  const nowIso = new Date().toISOString();
  const nextRecord = {
    codexVersion: args.codexVersion,
    installedAt:
      typeof existingRecord?.installedAt === "string"
        ? existingRecord.installedAt
        : nowIso,
    installationId: args.installationId,
    machineConnectUrl: args.machineConnectUrl,
    sourceOrigin: new URL(args.sourceUrl).origin,
    sourceUrl: args.sourceUrl,
    updatedAt: nowIso,
  };

  mkdirSync(path.dirname(installationPath), { recursive: true });
  writeFileSync(
    installationPath,
    `${JSON.stringify(nextRecord, null, 2)}\n`,
    "utf8",
  );

  return installationPath;
}

export function openBrowser(url) {
  const openerCommand =
    platform() === "darwin"
      ? { command: "open", args: [url] }
      : platform() === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };

  const child = spawn(openerCommand.command, openerCommand.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export function formatHelpText() {
  return [
    "Usage:",
    "  noter-sync connect",
    "",
    "Examples:",
    "  npx @noter-md/sync connect",
    "  node ./noter.js connect",
    "  curl -fsSL https://noter.md/noter.js | node --input-type=module - connect",
  ].join("\n");
}

/**
 * Emit machine-readable markdown so terminal transcripts stay easy to parse for
 * both humans and LLMs while the browser handles the actual registration UI.
 */
export function formatBootstrapReadyMarkdown(args) {
  return `# noter sync bootstrap ready

- source: ${args.sourceUrl}
- codex: ${args.codexVersion}
- state: ${args.installationPath}
- next: ${args.machineConnectUrl}`;
}

export async function main(argv) {
  const parsedArgs = parseCliArgs(argv);
  if (parsedArgs.command === "help") {
    console.log(formatHelpText());
    return;
  }

  const sourceUrl = validateSourceUrl(NOTER_SYNC_SOURCE_URL).toString();
  const codexVersion = detectCodexVersion();
  const installationId = buildInstallationId(sourceUrl);
  const machineConnectUrl = buildMachineConnectUrl({
    installationId,
    sourceUrl,
  });
  const installationPath = writeInstallationState({
    codexVersion,
    installationId,
    machineConnectUrl,
    sourceUrl,
  });

  console.log(
    formatBootstrapReadyMarkdown({
      codexVersion,
      installationPath,
      machineConnectUrl,
      sourceUrl,
    }),
  );

  try {
    openBrowser(machineConnectUrl);
    console.log("opened machine connect page in your browser");
  } catch (error) {
    console.warn(
      error instanceof Error
        ? error.message
        : "Could not open a browser automatically.",
    );
  }
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  if (entrypoint === "-") {
    return true;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isDirectExecution()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
