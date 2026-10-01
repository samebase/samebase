/**
Batched first-tool selection evaluation (planned calls only; nothing executes).

node first-tool.ts claude --out <dir> --model haiku --design H --schemes A,B,C,D,E --conditions providers,solo --variant base --trials 3
node first-tool.ts codex --out <dir> --model gpt-6-luna --design H --schemes A,D --conditions providers --trials 3 [--parallel 4]
node first-tool.ts score <dir> [--json out.json]

One subject call answers the whole shuffled prompt set for one design, scheme, condition, and
description variant.
*/
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DESIGNS, type DesignId, type Scheme } from "./designs.ts";
import { FIRST_TOOL_PROMPTS, type Expect, type FirstToolPrompt } from "./first-tool-prompts.ts";
import { catalogTextFor } from "./catalog-text.ts";
import { runCodexText } from "./codex-text.ts";
import { serverCatalogs, type RunConfig, type ServerTools } from "./runtime.ts";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const DESIGN_IDS: readonly DesignId[] = ["P", "W", "H", "R"];
const SCHEME_IDS: readonly Scheme[] = ["A", "B", "C", "D", "E"];

/** Deterministic shuffle (mulberry32) so each trial has a different, reproducible order. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

type BatchConfig = {
  design: DesignId;
  scheme: Scheme;
  providers: boolean;
  variant: "base" | "when";
  trial: number;
};

function batchName(config: BatchConfig): string {
  return `${config.design}-${config.scheme}${config.variant === "when" ? "-when" : ""}${config.providers ? "" : "-solo"}-t${config.trial}`;
}

function batchPrompt(config: BatchConfig, answerInstruction: string): string {
  const runConfig: RunConfig = {
    design: config.design,
    scheme: config.scheme,
    variant: config.variant,
    fixture: "A",
    providers: config.providers,
  };
  const order = shuffled(FIRST_TOOL_PROMPTS, config.trial * 7919 + config.scheme.charCodeAt(0));
  const requests = order.map((item) => `${item.id}: ${item.prompt}`).join("\n");
  return `You are the subject in a tool-routing evaluation. Below are the apps connected in a chat and their tools, then a list of independent user requests. Each request is the first message of a separate new conversation with the same connected apps. Nothing will be executed.

For each request, decide the first action you would take as the assistant: call exactly one tool (give its server, its exact tool name, and the key arguments you would pass), or call no tool because you would first answer or ask the user.

${answerInstruction}

Output format: one JSON array with one object per request, in the order given:
{"id": "<request id>", "server": "<server name, or null>", "tool": "<exact tool name, or null>", "args": {<key arguments, or empty>}}

## Host system prompt

You are an assistant in a chat app. The user has connected these apps: ${config.providers ? "Samebase, GitHub, Cloudflare (Workers Bindings and Workers Builds), and Convex" : "Samebase"}. Work only through their tools.

## Connected apps

${catalogTextFor(serverCatalogs(runConfig))}

## Requests

${requests}
`;
}

function configsFromOptions(): BatchConfig[] {
  const design = DESIGN_IDS.find((id) => id === option("design", "H")) ?? "H";
  const schemes = option("schemes", "D")
    .split(",")
    .map((id) => SCHEME_IDS.find((candidate) => candidate === id))
    .filter((id) => id !== undefined);
  const conditions = option("conditions", "providers").split(",");
  const variant = option("variant", "base") === "when" ? "when" : "base";
  const trials = Number(option("trials", "3"));
  const firstTrial = Number(option("first-trial", "1"));
  const configs: BatchConfig[] = [];
  for (let trial = firstTrial; trial < firstTrial + trials; trial += 1) {
    for (const scheme of schemes)
      for (const condition of conditions)
        configs.push({ design, scheme, providers: condition !== "solo", variant, trial });
  }
  return configs;
}

/**
`claude -p` with every tool disabled and a one-line system prompt, so the subject sees only the
text prompt. Untested in this study: the CLI was not signed in on the evaluation machine.
*/
function runClaudeBatch(dir: string, model: string, prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--model",
      model,
      "--tools",
      "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
      "--system-prompt",
      "Answer with JSON only.",
    ];
    const child = spawn("claude", args, { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stdin.end(prompt);
    child.on("close", () => {
      const parsed: unknown = JSON.parse(stdout || "{}");
      const entries =
        typeof parsed === "object" && parsed !== null
          ? Object.fromEntries(Object.entries(parsed))
          : {};
      writeFileSync(
        path.join(dir, "answer.json"),
        typeof entries.result === "string" ? entries.result : "[]",
      );
      writeFileSync(
        path.join(dir, "usage.json"),
        JSON.stringify({
          usage: entries.usage ?? null,
          total_cost_usd: entries.total_cost_usd ?? null,
        }),
      );
      resolve();
    });
  });
}

async function claude(): Promise<void> {
  const model = option("model", "haiku");
  const outDir = path.resolve(option("out", "first-tool"), `claude-${model}`);
  for (const config of configsFromOptions()) {
    const dir = path.join(outDir, batchName(config));
    if (existsSync(path.join(dir, "answer.json"))) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "batch.json"), JSON.stringify(config, null, 2));
    await runClaudeBatch(dir, model, batchPrompt(config, "Reply with only the JSON array."));
    console.log(`${batchName(config)} done`);
  }
}

async function codex(): Promise<void> {
  const model = option("model", "gpt-6-luna");
  const effort = option("effort", "low");
  const outDir = path.resolve(option("out", "first-tool"), `codex-${model}`);
  const jobs = configsFromOptions().map((config) => async () => {
    const dir = path.join(outDir, batchName(config));
    if (existsSync(path.join(dir, "answer.json"))) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "batch.json"), JSON.stringify(config, null, 2));
    await runCodexText(dir, model, effort, batchPrompt(config, "Reply with only the JSON array."));
    console.log(`${batchName(config)} done`);
  });
  let next = 0;
  const parallel = Number(option("parallel", "4"));
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < jobs.length) {
        const job = jobs[next];
        next += 1;
        await job();
      }
    }),
  );
}

type Outcome =
  | "correct"
  | "lenient"
  | "wrong_samebase_tool"
  | "wrong_server"
  | "false_activation"
  | "missed"
  | "malformed"
  | "unanswered";

function classify(
  item: FirstToolPrompt,
  config: BatchConfig,
  answer: { server: unknown; tool: unknown } | undefined,
): { outcome: Outcome; key: string } {
  if (!answer) return { outcome: "unanswered", key: "" };
  const expect =
    config.design === "P" ? item.P : config.design === "R" ? (item.R ?? item.H) : item.H;
  const runConfig: RunConfig = {
    design: config.design,
    scheme: config.scheme,
    variant: config.variant,
    fixture: "A",
    providers: config.providers,
  };
  const toolName =
    typeof answer.tool === "string" ? answer.tool.replace(/^mcp__[^_]+(?:_[^_]+)*__/, "") : null;
  if (!toolName) return match(expect, "none", "missed");
  const serverName = typeof answer.server === "string" ? answer.server.toLowerCase() : null;
  const owner = ownerOf(serverCatalogs(runConfig), toolName, serverName);
  if (!owner) return { outcome: "malformed", key: `${serverName ?? "?"}.${toolName}` };
  if (owner.server !== "samebase") return match(expect, `provider:${owner.server}`, "wrong_server");
  const key =
    DESIGNS[config.design].tools.find((tool) => tool.names[config.scheme] === toolName)?.key ?? "?";
  const samebaseExpected = expect.strict.some(
    (entry) => !entry.startsWith("provider:") && entry !== "none",
  );
  return match(expect, key, samebaseExpected ? "wrong_samebase_tool" : "false_activation");
}

function match(expect: Expect, key: string, otherwise: Outcome): { outcome: Outcome; key: string } {
  if (expect.strict.includes(key)) return { outcome: "correct", key };
  if (expect.lenient?.includes(key)) return { outcome: "lenient", key };
  return { outcome: otherwise, key };
}

/** The server that owns the named tool; a stated server must match it, or the name is malformed. */
function ownerOf(servers: ServerTools[], toolName: string, serverName: string | null) {
  const owners = servers.filter((server) => server.tools.some((tool) => tool.name === toolName));
  if (serverName === null) return owners.at(0);
  return owners.find(
    (server) => serverName === server.server || serverName.includes(server.server),
  );
}

function readAnswers(dir: string): Map<string, { server: unknown; tool: unknown }> {
  const answers = new Map<string, { server: unknown; tool: unknown }>();
  const file = path.join(dir, "answer.json");
  if (!existsSync(file)) return answers;
  const raw = readFileSync(file, "utf8");
  const start = raw.indexOf("[");
  const parsed: unknown = JSON.parse(raw.slice(start, raw.lastIndexOf("]") + 1));
  if (!Array.isArray(parsed)) return answers;
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = Object.fromEntries(Object.entries(entry));
    if (typeof record.id === "string")
      answers.set(record.id, { server: record.server, tool: record.tool });
  }
  return answers;
}

function score(): void {
  const root = process.argv[3];
  const rows: {
    subject: string;
    batch: string;
    config: BatchConfig;
    counts: Record<Outcome, number>;
    details: { id: string; outcome: Outcome; key: string }[];
  }[] = [];
  for (const subject of readdirSync(root)) {
    const subjectDir = path.join(root, subject);
    if (!statSync(subjectDir).isDirectory()) continue;
    for (const batch of readdirSync(subjectDir)) {
      const dir = path.join(subjectDir, batch);
      if (!existsSync(path.join(dir, "batch.json")) || !existsSync(path.join(dir, "answer.json")))
        continue;
      const config: BatchConfig = JSON.parse(readFileSync(path.join(dir, "batch.json"), "utf8"));
      const answers = readAnswers(dir);
      const counts: Record<Outcome, number> = {
        correct: 0,
        lenient: 0,
        wrong_samebase_tool: 0,
        wrong_server: 0,
        false_activation: 0,
        missed: 0,
        malformed: 0,
        unanswered: 0,
      };
      const details = FIRST_TOOL_PROMPTS.filter(
        (item) =>
          config.providers ||
          !["cross_server", "review_negative"].includes(item.kind) ||
          item.id === "R7",
      ).map((item) => {
        const result = classify(item, config, answers.get(item.id));
        counts[result.outcome] += 1;
        return { id: item.id, ...result };
      });
      rows.push({ subject, batch, config, counts, details });
    }
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.subject} | ${row.config.design}-${row.config.scheme}${row.config.variant === "when" ? "-when" : ""}${row.config.providers ? "" : "-solo"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, group] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const perTrial = group.map((row) => `${row.counts.correct}/${row.details.length}`).join(" ");
    const total = (outcome: Outcome) => group.reduce((sum, row) => sum + row.counts[outcome], 0);
    const n = group.reduce((sum, row) => sum + row.details.length, 0);
    console.log(
      `${key.padEnd(40)} strict ${((total("correct") / n) * 100).toFixed(1)}% [${perTrial}] lenient+${total("lenient")} wrongTool ${total("wrong_samebase_tool")} wrongServer ${total("wrong_server")} falseAct ${total("false_activation")} missed ${total("missed")} malformed ${total("malformed")} unanswered ${total("unanswered")}`,
    );
  }
  const jsonIndex = process.argv.indexOf("--json");
  if (jsonIndex >= 0) writeFileSync(process.argv[jsonIndex + 1], JSON.stringify(rows, null, 2));
}

const command = process.argv[2];
if (command === "claude") await claude();
else if (command === "codex") await codex();
else if (command === "score") score();
else console.log("Usage: node first-tool.ts claude|codex|score ...");
