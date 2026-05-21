#!/usr/bin/env node
import { parsePositiveIntegerOption } from "./lib/cliArgs.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { resolveStoredLocalBackendPort, stopListeningPort } from "./lib/killport.ts";

const HELP_TEXT = `Usage: scripts/killport.ts [options] [port]

Send SIGTERM to a listening local backend port. If no explicit port is passed,
the script reads apps/noter/.env.local and reuses the stored CONVEX_URL or
VITE_CONVEX_URL port.

Options:
  --port <port>  Explicit port to stop.
  -h, --help     Show this help message.
`;

type KillPortOptions = {
  port: number | null;
  showHelp: boolean;
};

export function parseKillPortArgs(args: string[]): KillPortOptions {
  let port: number | null = null;
  let showHelp = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--port") {
      const rawPort = args[index + 1];
      if (!rawPort || rawPort.startsWith("-")) {
        fail(`Missing value for --port\n\n${HELP_TEXT}`);
      }
      port = parsePositiveIntegerOption(rawPort, "--port", HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      port = parsePositiveIntegerOption(arg.slice("--port=".length), "--port", HELP_TEXT);
      continue;
    }
    if (arg.startsWith("-")) {
      fail(`Unknown argument: ${arg}\n\n${HELP_TEXT}`);
    }
    if (port !== null) {
      fail(`Unexpected argument: ${arg}\n\n${HELP_TEXT}`);
    }
    port = parsePositiveIntegerOption(arg, "port", HELP_TEXT);
  }

  return { port, showHelp };
}

async function main(): Promise<void> {
  const options = parseKillPortArgs(process.argv.slice(2));
  if (options.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  const port = options.port ?? resolveStoredLocalBackendPort(repoRoot);
  if (port === null) {
    return;
  }

  const result = await stopListeningPort(port);
  if (result.pids.length === 0) {
    return;
  }
  if (result.remainingPids.length > 0) {
    fail(
      `Port ${port} is still in use after attempting shutdown: ${result.remainingPids.join(", ")}`,
    );
  }

  console.log(`Stopped ${result.pids.join(" ")} on port ${port}.`);
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
