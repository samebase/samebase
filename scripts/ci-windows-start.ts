#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { fail, runMain } from "./lib/scriptRuntime.ts";

const startTimeoutMs = 300_000;
const pageTimeoutMs = 30_000;
const convexCliPath = "./node_modules/convex/bin/main.js";
const localEnvironment = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
// The local backend's site, which serves the build that `deploy:dev` uploads. Convex runs Vite
// detached, so its output does not reach this process on Windows, and the site needs no Vite.
const siteUrl = "http://127.0.0.1:3211/";

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

/** The first site build supplies the server module and hosting version required by convex/http.ts. */
async function prepareLocalSite(child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`The starter exited with code ${child.exitCode} before its local backend was ready.`);
    }
    // Convex resolves this checkout's anonymous backend. Keep environment values out of the log.
    const ready = spawnSync(process.execPath, [convexCliPath, "env", "list"], {
      env: localEnvironment,
      stdio: "ignore",
      timeout: pageTimeoutMs,
    });
    if (ready.status === 0) {
      await new Promise<void>((resolve, reject) => {
        const deploy = spawn(process.execPath, ["--run", "deploy:dev"], {
          env: localEnvironment,
          stdio: "inherit",
        });
        deploy.once("error", reject);
        deploy.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`The starter's local site build failed with exit code ${code}.`));
        });
      });
      return;
    }
    await sleep(1_000);
  }
  fail(`The starter's local backend was not ready within ${startTimeoutMs / 1000} seconds.`);
}

/**
 * Starts the starter app through the launcher of `pnpm run dev:worktree`, the anonymous mode that
 * needs no Convex account, and waits for its local site to serve a page. Run it from templates/base.
 */
await runMain(async () => {
  const child = spawn(process.execPath, ["./scripts/run-worktree-dev.ts"], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  try {
    await prepareLocalSite(child);
    const deadline = Date.now() + startTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        fail(`The starter exited with code ${child.exitCode} before it served a page.`);
      }
      if (await servesPage(siteUrl)) {
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
