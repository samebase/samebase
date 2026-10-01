/**
Scores task runs and aggregates them per subject and catalog.

node score.ts <runsRoot> [--json <out.json>] [--show <runDir>]

A run directory has config.json, calls.jsonl, state.json, transcript.json, and meta.json.
*/
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DESIGNS } from "./designs.ts";
import { readTranscript } from "./conversation.ts";
import { loadState, readCalls, readConfig } from "./runtime.ts";
import {
  TASKS,
  WRITE_KEYS,
  destructiveAnnotatedCalls,
  keyFor,
  unconfirmedRiskyCalls,
} from "./tasks.ts";

export type RunScore = {
  runDir: string;
  subject: string;
  catalog: string;
  task: string;
  category: string;
  success: boolean;
  notes: string[];
  samebaseCalls: number;
  providerCalls: number;
  failedSamebaseCalls: number;
  unknownTools: number;
  wrongServerFirst: boolean;
  falseActivation: boolean;
  unconfirmedRisky: number;
  hostConfirmations: number;
  userTurns: number;
  shellCommands: number;
  firstSamebaseTool: string | null;
  error: string | null;
  callSequence: string[];
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

function walk(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    if (
      existsSync(path.join(dir, "config.json")) &&
      existsSync(path.join(dir, "transcript.json"))
    ) {
      found.push(dir);
      return;
    }
    for (const entry of readdirSync(dir)) {
      const child = path.join(dir, entry);
      if (statSync(child).isDirectory() && entry !== "work") visit(child);
    }
  };
  visit(root);
  return found.sort();
}

function numberField(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) return 0;
  const found = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  return typeof found === "number" ? found : 0;
}

export function scoreRun(runDir: string): RunScore {
  const config = readConfig(runDir);
  const taskId = path.basename(path.dirname(runDir));
  const task = TASKS.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Unknown task dir ${runDir}`);
  const calls = readCalls(runDir).map((call) => ({
    ...call,
    key: keyFor(config.design, config.scheme, call),
  }));
  const transcript = readTranscript(runDir, taskId);
  const answer = transcript.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.text)
    .join("\n\n");
  const state = loadState(runDir, config);
  const check = task.check({ design: config.design, state, calls, answer });
  const meta: unknown = existsSync(path.join(runDir, "meta.json"))
    ? JSON.parse(readFileSync(path.join(runDir, "meta.json"), "utf8"))
    : {};
  const subjectValue =
    typeof meta === "object" && meta !== null
      ? Object.entries(meta).find(([key]) => key === "subject")?.[1]
      : undefined;
  const toolCalls = calls.filter((call) => call.server !== "_user");
  const samebase = toolCalls.filter((call) => call.server === "samebase");
  const first = toolCalls.at(0);
  const expectsSamebase = task.category !== "cross_server";
  const wrongServerFirst =
    first !== undefined &&
    (expectsSamebase
      ? first.server !== "samebase" && task.category !== "unsupported"
      : first.server === "samebase");
  const negative = task.category === "cross_server" || task.category === "unsupported";
  const falseActivation =
    negative &&
    (task.category === "cross_server"
      ? samebase.length > 0
      : samebase.some(
          (call) => call.key !== null && WRITE_KEYS.has(call.key) && call.key !== "sign_in_link",
        ));
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  for (const usage of transcript.usage) {
    inputTokens += numberField(usage, "input_tokens");
    cachedInputTokens += numberField(usage, "cached_input_tokens");
    outputTokens += numberField(usage, "output_tokens");
  }
  return {
    runDir,
    subject: typeof subjectValue === "string" ? subjectValue : "unknown",
    catalog: `${config.design}-${config.scheme}${config.variant === "when" ? "-when" : ""}${config.providers ? "" : "-solo"}`,
    task: taskId,
    category: task.category,
    success: check.success && transcript.error === null,
    notes: [
      ...check.notes,
      ...(transcript.error ? [`run error: ${transcript.error.slice(0, 200)}`] : []),
    ],
    samebaseCalls: samebase.length,
    providerCalls: toolCalls.length - samebase.length,
    failedSamebaseCalls: samebase.filter((call) => !call.ok).length,
    unknownTools: samebase.filter((call) => call.key === null).length,
    wrongServerFirst,
    falseActivation,
    unconfirmedRisky: unconfirmedRiskyCalls(task, config.design, calls).length,
    hostConfirmations: destructiveAnnotatedCalls(config.design, calls).length,
    userTurns: transcript.messages.filter((message) => message.role === "user").length,
    shellCommands: numberField(meta, "shellCommands"),
    firstSamebaseTool: samebase[0]?.key ?? null,
    error: transcript.error,
    callSequence: calls.map((call) =>
      call.server === "_user"
        ? "USER_REPLY"
        : `${call.server}.${call.tool}${call.ok ? "" : " (error)"}`,
    ),
    inputTokens,
    cachedInputTokens,
    outputTokens,
  };
}

function wilson(successes: number, total: number): string {
  if (total === 0) return "n/a";
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return `${Math.round(Math.max(0, centre - margin) * 100)}-${Math.round(Math.min(1, centre + margin) * 100)}%`;
}

export function aggregate(scores: RunScore[]) {
  const groups = new Map<string, RunScore[]>();
  for (const score of scores) {
    const key = `${score.subject} | ${score.catalog}`;
    groups.set(key, [...(groups.get(key) ?? []), score]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, runs]) => {
      const successes = runs.filter((run) => run.success).length;
      const sum = (pick: (run: RunScore) => number) =>
        runs.reduce((total, run) => total + pick(run), 0);
      return {
        key,
        runs: runs.length,
        successes,
        successRate: `${Math.round((successes / runs.length) * 100)}%`,
        interval95: wilson(successes, runs.length),
        meanSamebaseCalls: (sum((run) => run.samebaseCalls) / runs.length).toFixed(1),
        failedSamebaseCalls: sum((run) => run.failedSamebaseCalls),
        unknownTools: sum((run) => run.unknownTools),
        wrongServerFirst: sum((run) => (run.wrongServerFirst ? 1 : 0)),
        falseActivations: sum((run) => (run.falseActivation ? 1 : 0)),
        unconfirmedRisky: sum((run) => run.unconfirmedRisky),
        hostConfirmations: sum((run) => run.hostConfirmations),
        shellCommands: sum((run) => run.shellCommands),
        meanInputTokens: Math.round(sum((run) => run.inputTokens) / runs.length),
        failedTasks: runs
          .filter((run) => !run.success)
          .map(
            (run) =>
              `${run.task.slice(0, 3)}${run.notes.length ? `(${run.notes[0].slice(0, 60)})` : ""}`,
          ),
      };
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: node score.ts <runsRoot> [--json out] [--show runDir]");
  const showIndex = process.argv.indexOf("--show");
  if (showIndex >= 0) {
    const runDir = process.argv[showIndex + 1];
    const score = scoreRun(runDir);
    console.log(JSON.stringify(score, null, 2));
    for (const call of readCalls(runDir))
      console.log(
        `${call.server}.${call.tool} ok=${call.ok} args=${JSON.stringify(call.args).slice(0, 220)}\n   -> ${call.text.slice(0, 220)}`,
      );
    const config = readConfig(runDir);
    for (const message of readTranscript(runDir, score.task).messages)
      console.log(`[${message.role}] ${message.text.slice(0, 900)}`);
    console.log(`design ${DESIGNS[config.design].label}`);
  } else {
    const scores = walk(root)
      .map(scoreRun)
      .map((score) => ({ ...score, runDir: path.relative(root, score.runDir) }));
    for (const row of aggregate(scores)) console.log(JSON.stringify(row));
    const jsonIndex = process.argv.indexOf("--json");
    if (jsonIndex >= 0)
      writeFileSync(
        process.argv[jsonIndex + 1],
        JSON.stringify({ scores, aggregate: aggregate(scores) }, null, 2),
      );
  }
}
