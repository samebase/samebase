/**
One text-only `codex exec` call: no MCP servers, no user config, app connectors, plugins, and the
shell off. Writes answer.json (last message), usage.json, and events.jsonl into `dir`, then fails
closed if the event log shows any tool or command activity.
*/
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DISABLED_FEATURES, assertTextOnly } from "./verify-codex-isolation.ts";

export function runCodexText(
  dir: string,
  model: string,
  effort: string,
  prompt: string,
): Promise<void> {
  return new Promise((resolve) => {
    const work = path.join(dir, "work");
    mkdirSync(work, { recursive: true });
    const args = [
      "exec",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--ephemeral",
      "--json",
      "-m",
      model,
      ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
      "-c",
      `model_reasoning_effort="${effort}"`,
      "-c",
      `approval_policy="never"`,
      "-c",
      `sandbox_mode="read-only"`,
      "-C",
      work,
      "-o",
      path.join(dir, "answer.json"),
      "-",
    ];
    const child = spawn("codex", args, { cwd: work, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stdin.end(prompt);
    child.on("close", () => {
      writeFileSync(path.join(dir, "events.jsonl"), stdout);
      const usage =
        stdout
          .split("\n")
          .filter((line) => line.includes('"turn.completed"'))
          .pop() ?? "";
      writeFileSync(path.join(dir, "usage.json"), usage);
      assertTextOnly(path.join(dir, "events.jsonl"));
      resolve();
    });
  });
}
