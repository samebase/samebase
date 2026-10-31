#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { fail, runMain } from "./lib/scriptRuntime.ts";

const startTimeoutMs = 300_000;
const pageTimeoutMs = 30_000;
// The default Vite port. Convex runs the frontend detached, so its output, with the URL, does not
// reach this process on Windows.
const frontendUrl = "http://localhost:5173/";

async function servesPage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(pageTimeoutMs) });
    const body = await response.text();
    console.log(`${url} answered ${response.status} with ${body.length} characters.`);
    return response.ok && body.includes("</html>");
  } catch (error) {
    console.log(`${url} did not answer: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function stopProcessTree(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  process.kill(-pid, "SIGKILL");
}

/**
 * Starts the starter app through the launcher of `pnpm run dev:worktree`, the anonymous mode that
 * needs no Convex account, and waits for its frontend to serve a page. Run it from templates/base.
 */
await runMain(async () => {
  const child = spawn(process.execPath, ["./scripts/run-worktree-dev.ts"], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  try {
    const deadline = Date.now() + startTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        fail(`The starter exited with code ${child.exitCode} before it served a page.`);
      }
      if (await servesPage(frontendUrl)) {
        console.log("The starter serves a page.");
        return;
      }
      await sleep(1_000);
    }
    fail(`The starter served no page within ${startTimeoutMs / 1000} seconds.`);
  } finally {
    if (child.exitCode === null) {
      stopProcessTree(child.pid);
    }
  }
});

// The killed tree can leave a grandchild holding the pipes open.
process.exit(0);
