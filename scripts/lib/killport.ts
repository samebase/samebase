import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  listListeningPids,
  parsePort,
  readEnvFile,
  sleep,
} from "../../apps/noter/scripts/convex-local-utils.ts";

export type StopListeningPortResult = {
  port: number;
  pids: string[];
  remainingPids: string[];
};

function unique(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function signalPid(pid: string, signal: "TERM" | "KILL"): void {
  if (process.platform === "win32") {
    const args = ["/PID", pid, "/T"];
    if (signal === "KILL") {
      args.push("/F");
    }
    spawnSync("taskkill", args, { stdio: "ignore" });
    return;
  }

  const asNumber = Number(pid);
  if (!Number.isInteger(asNumber) || asNumber <= 0) {
    return;
  }

  try {
    process.kill(asNumber, signal === "TERM" ? "SIGTERM" : "SIGKILL");
  } catch {
    // Another process may already have cleaned up the listener.
  }
}

/**
 * Keep the anonymous bootstrap tied to the currently selected local backend
 * instead of guessing which listener to terminate.
 */
export function resolveStoredLocalBackendPort(repoRoot: string): number | null {
  const appDir = path.join(repoRoot, "apps", "noter");
  const env = readEnvFile(appDir);
  const rawUrl = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  if (typeof rawUrl !== "string") {
    return null;
  }

  return parsePort(rawUrl);
}

export async function stopListeningPort(
  port: number,
): Promise<StopListeningPortResult> {
  const pids = unique(listListeningPids(port));
  if (pids.length === 0) {
    return {
      port,
      pids: [],
      remainingPids: [],
    };
  }

  for (const pid of pids) {
    signalPid(pid, "TERM");
  }

  await sleep(500);

  const afterTermPids = unique(listListeningPids(port));
  if (afterTermPids.length > 0) {
    for (const pid of afterTermPids) {
      signalPid(pid, "KILL");
    }
  }

  await sleep(200);

  return {
    port,
    pids,
    remainingPids: unique(listListeningPids(port)),
  };
}
