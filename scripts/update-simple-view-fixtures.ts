#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { isMainModule, runMain } from "./lib/scriptRuntime.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function main(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      PNPM_COMMAND,
      ["exec", "vitest", "run", "apps/noter/src/lib/simpleView.test.ts"],
      {
        env: {
          ...process.env,
          UPDATE_SIMPLE_VIEW_FIXTURES: "1",
        },
        stdio: "inherit",
      },
    );

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Fixture update failed with exit code ${code ?? 1}.`));
    });
  });
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
