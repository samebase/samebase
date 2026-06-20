#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { resolveLocalDevPort } from "../apps/samebase/scripts/convex-local-utils.ts";
import { normalizeEnvValue } from "../apps/samebase/scripts/normalizeEnvValue.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function parseLoopbackOriginPort(origin: string): string | null {
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:") {
      return null;
    }
    if (!LOOPBACK_HOSTNAMES.has(parsedOrigin.hostname)) {
      return null;
    }
    return parsedOrigin.port.length > 0 ? parsedOrigin.port : null;
  } catch {
    return null;
  }
}

/**
 * Pin the chosen local frontend port into both env vars so the predev
 * `SITE_URL` sync and the later Vite wrapper cannot drift onto different
 * localhost ports.
 */
export function buildPrimaryDevEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  const explicitOrigin = normalizeEnvValue(env.DEV_ENV_ORIGIN);
  if (explicitOrigin !== undefined) {
    const explicitLoopbackPort = parseLoopbackOriginPort(explicitOrigin);
    if (explicitLoopbackPort !== null && normalizeEnvValue(env.VITE_PORT) === undefined) {
      nextEnv.VITE_PORT = explicitLoopbackPort;
    }
    return nextEnv;
  }

  const vitePort = resolveLocalDevPort(env);
  nextEnv.VITE_PORT = vitePort;
  nextEnv.DEV_ENV_ORIGIN = `http://localhost:${vitePort}`;
  return nextEnv;
}

export function buildPrimaryDevArgs(args: string[], script: "dev" | "dev:raw" = "dev"): string[] {
  return ["exec", "vp", "run", "--filter=samebase", script, ...args];
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const child = spawn(PNPM_COMMAND, buildPrimaryDevArgs(process.argv.slice(2)), {
    env: buildPrimaryDevEnvironment(process.env),
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
