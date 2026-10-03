/**
Drives GPT subjects through `codex exec` with the stub MCP servers attached.

node run-codex.ts --out <dir> --designs P,W,H --scheme D --trials 1 --model gpt-6-luna --effort low [--tasks T01_create_app,...] [--parallel 4] [--providers true]

Each task run is one `codex exec` call plus at most two `codex exec resume` calls for scripted
user replies. Run directories land under <dir>/<model>/<design>-<scheme>/<task>/trial<n>.
*/
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { DesignId, Scheme } from "./designs.ts";
import {
  SUBJECT_FRAME,
  nextUserReply,
  readTranscript,
  taskById,
  writeTranscript,
} from "./conversation.ts";
import { HARNESS_DIR, writeConfig, type RunConfig } from "./runtime.ts";
import { TASKS } from "./tasks.ts";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const outDir = option("out", "runs");
const DESIGN_IDS: readonly DesignId[] = ["P", "W", "H"];
const designs = option("designs", "P,W,H")
  .split(",")
  .map((id) => DESIGN_IDS.find((candidate) => candidate === id))
  .filter((id) => id !== undefined);
const scheme = option("scheme", "D");
const schemeId: Scheme =
  scheme === "A" || scheme === "B" || scheme === "C" || scheme === "E" ? scheme : "D";
const trials = Number(option("trials", "1"));
const firstTrial = Number(option("first-trial", "1"));
const model = option("model", "gpt-6-luna");
const effort = option("effort", "low");
const parallel = Number(option("parallel", "4"));
const providers = option("providers", "true") !== "false";
const taskIds = option("tasks", TASKS.map((task) => task.id).join(",")).split(",");
const variant = option("variant", "base") === "when" ? "when" : "base";

const DISABLED_FEATURES = [
  "apps",
  "plugins",
  "remote_plugin",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "in_app_browser",
  "multi_agent",
  "image_generation",
  "shell_tool",
  "unified_exec",
  "tool_suggest",
  "skill_search",
  "skill_mcp_dependency_install",
  "goals",
  "sleep_tool",
];

const SERVERS = ["samebase", "github", "cloudflare-bindings", "cloudflare-builds", "convex"];

function codexConfigArgs(runDir: string): string[] {
  const servers = providers ? SERVERS : ["samebase"];
  // Only the stub servers may be reachable: ChatGPT-hosted app connectors (feature "apps") would
  // otherwise expose the user's real Samebase, GitHub, and other connectors to the subject.
  const args = DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]);
  args.push(
    "-c",
    `model_reasoning_effort="${effort}"`,
    "-c",
    `approval_policy="never"`,
    "-c",
    `sandbox_mode="read-only"`,
  );
  for (const server of servers) {
    const serverArgs = JSON.stringify([
      path.join(HARNESS_DIR, "mcp-server.ts"),
      "--run",
      runDir,
      "--server",
      server,
    ]);
    args.push(
      "-c",
      `mcp_servers.${server}={command="node", args=${serverArgs}, startup_timeout_sec=30, tool_timeout_sec=60, default_tools_approval_mode="approve"}`,
    );
  }
  return args;
}

type CodexTurn = {
  threadId: string | null;
  answer: string;
  usage: unknown;
  shellCommands: number;
  error: string | null;
  raw: string;
};

function runCodex(args: string[], cwd: string): Promise<CodexTurn> {
  return new Promise((resolve) => {
    const child = spawn("codex", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), 8 * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let threadId: string | null = null;
      let answer = "";
      let usage: unknown = null;
      let shellCommands = 0;
      for (const line of stdout.split("\n")) {
        if (!line.startsWith("{")) continue;
        const event: unknown = JSON.parse(line);
        if (typeof event !== "object" || event === null) continue;
        const entries = Object.fromEntries(Object.entries(event));
        if (entries.type === "thread.started" && typeof entries.thread_id === "string")
          threadId = entries.thread_id;
        if (entries.type === "turn.completed") usage = entries.usage;
        const item = entries.item;
        if (entries.type === "item.completed" && typeof item === "object" && item !== null) {
          const itemEntries = Object.fromEntries(Object.entries(item));
          if (itemEntries.type === "agent_message" && typeof itemEntries.text === "string")
            answer = itemEntries.text;
          if (itemEntries.type === "command_execution") shellCommands += 1;
          const server = typeof itemEntries.server === "string" ? itemEntries.server : "";
          if (
            itemEntries.type === "mcp_tool_call" &&
            !SERVERS.includes(server) &&
            !SERVERS.includes(server.replaceAll("_", "-"))
          ) {
            // Fail closed: a call reached a server other than the stubs.
            console.error(`FOREIGN MCP CALL to ${server}: ${String(itemEntries.tool)}. Aborting.`);
            process.exit(3);
          }
        }
      }
      resolve({
        threadId,
        answer,
        usage,
        shellCommands,
        error: code === 0 ? null : `exit ${String(code)}: ${stderr.slice(-800)}`,
        raw: stdout,
      });
    });
  });
}

async function runTask(design: DesignId, taskId: string, trial: number): Promise<void> {
  const task = taskById(taskId);
  const runDir = path.resolve(
    outDir,
    model,
    `${design}-${schemeId}${variant === "when" ? "-when" : ""}${providers ? "" : "-solo"}`,
    taskId,
    `trial${trial}`,
  );
  if (existsSync(path.join(runDir, "transcript.json"))) return;
  const workDir = path.join(runDir, "work");
  mkdirSync(workDir, { recursive: true });
  const config: RunConfig = { design, scheme: schemeId, variant, fixture: task.fixture, providers };
  writeConfig(runDir, config);
  const base = [
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--json",
    "-m",
    model,
    ...codexConfigArgs(runDir),
  ];
  let turn = await runCodex(
    ["exec", ...base, "-C", workDir, `${SUBJECT_FRAME}\n\nUser: ${task.prompt}`],
    workDir,
  );
  let shellCommands = turn.shellCommands;
  const raws = [turn.raw];
  let reply = turn.error ? null : nextUserReply(runDir, taskId, turn.answer, turn.usage);
  while (reply !== null && turn.threadId) {
    turn = await runCodex(["exec", "resume", ...base, turn.threadId, reply], workDir);
    shellCommands += turn.shellCommands;
    raws.push(turn.raw);
    reply = turn.error ? null : nextUserReply(runDir, taskId, turn.answer, turn.usage);
  }
  const transcript = readTranscript(runDir, taskId);
  transcript.error = turn.error;
  writeTranscript(runDir, transcript);
  writeFileSync(path.join(runDir, "codex-events.jsonl"), raws.join("\n"));
  writeFileSync(
    path.join(runDir, "meta.json"),
    JSON.stringify({ subject: `codex:${model}:${effort}`, shellCommands }, null, 2),
  );
  console.log(
    `${design}-${schemeId} ${taskId} trial${trial} done${turn.error ? ` (error ${turn.error.slice(0, 120)})` : ""}`,
  );
}

const jobs: (() => Promise<void>)[] = [];
for (let trial = firstTrial; trial < firstTrial + trials; trial += 1) {
  for (const design of designs)
    for (const taskId of taskIds) jobs.push(() => runTask(design, taskId, trial));
}
let next = 0;
async function worker(): Promise<void> {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    await job();
  }
}
await Promise.all(Array.from({ length: parallel }, () => worker()));
console.log(`finished ${jobs.length} task runs`);
