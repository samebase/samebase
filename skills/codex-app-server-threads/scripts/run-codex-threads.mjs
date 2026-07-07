#!/usr/bin/env node
/**
 * Start N parallel Codex threads through `codex app-server` and collect each
 * thread's final agent message.
 *
 * Usage:
 *   node run-codex-threads.mjs --cwd <checkout> [options] <prompt-file...>
 *
 * Options:
 *   --cwd <dir>           Working directory the threads operate in (default: process cwd)
 *   --sandbox <mode>      read-only | workspace-write | danger-full-access (default: read-only)
 *   --approval <policy>   never | on-failure | on-request | untrusted (default: never)
 *   --model <name>        Model override (default: the user's codex config)
 *   --effort <level>      Reasoning effort override passed to turn/start
 *   --timeout-mins <n>    Per-thread turn timeout (default: 20)
 *   --out <dir>           Output directory (default: ./codex-thread-runs/<timestamp>)
 *
 * Each prompt file becomes one thread; its basename becomes the thread label.
 * Outputs <out>/<label>.md per thread plus <out>/summary.json, and prints
 * `codex resume <threadId>` hints so runs stay inspectable from the Codex UI.
 *
 * Protocol note: enum casing and method names match the locally installed CLI
 * (verified against codex-cli 0.133.0 via `codex app-server generate-json-schema`).
 * Regenerate the schema before trusting this script across major CLI upgrades.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const RPC_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  /**
  @type {{
    cwd: string
    sandbox: string
    approval: string
    model: string | undefined
    effort: string | undefined
    timeoutMins: number
    out: string | undefined
    promptFiles: string[]
  }}
  */
  const options = {
    cwd: process.cwd(),
    sandbox: "read-only",
    approval: "never",
    model: undefined,
    effort: undefined,
    timeoutMins: 20,
    out: undefined,
    promptFiles: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      const value = argv[i];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      return value;
    };
    if (arg === "--cwd") {
      options.cwd = path.resolve(next());
    } else if (arg === "--sandbox") {
      options.sandbox = next();
    } else if (arg === "--approval") {
      options.approval = next();
    } else if (arg === "--model") {
      options.model = next();
    } else if (arg === "--effort") {
      options.effort = next();
    } else if (arg === "--timeout-mins") {
      options.timeoutMins = Number(next());
    } else if (arg === "--out") {
      options.out = path.resolve(next());
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.promptFiles.push(path.resolve(arg));
    }
  }
  if (options.promptFiles.length === 0) {
    throw new Error("Provide at least one prompt file");
  }
  if (!Number.isFinite(options.timeoutMins) || options.timeoutMins <= 0) {
    throw new Error("--timeout-mins must be a positive number");
  }
  return options;
}

function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

class AppServerClient {
  constructor() {
    this.nextRequestId = 1;
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.stdoutBuffer = "";
    this.process = null;
    this.exited = false;
  }

  async start() {
    const child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    this.process = child;
    child.stdout.on("data", (chunk) => {
      this.stdoutBuffer += chunk.toString();
      let newlineIndex = this.stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.handleLine(line);
        }
        newlineIndex = this.stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code, signal) => {
      this.exited = true;
      const error = new Error(`codex app-server exited (code=${code}, signal=${signal})`);
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
    });
    await this.request("initialize", {
      clientInfo: {
        name: "samebase_codex_thread_runner",
        title: "Samebase Codex Thread Runner",
        version: "0.1.0",
      },
    });
    this.notify("initialized", {});
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const record = asRecord(message);
    if (!record) {
      return;
    }
    const hasId = record.id !== undefined && record.id !== null;
    if (hasId && typeof record.method === "string") {
      this.handleServerRequest(record);
      return;
    }
    if (hasId) {
      const entry = this.pending.get(record.id);
      if (!entry) {
        return;
      }
      this.pending.delete(record.id);
      if (record.error !== undefined) {
        const errorRecord = asRecord(record.error);
        entry.reject(
          new Error(`${entry.method}: ${errorRecord?.message ?? JSON.stringify(record.error)}`),
        );
      } else {
        entry.resolve(record.result);
      }
      return;
    }
    if (typeof record.method === "string") {
      for (const handler of this.notificationHandlers) {
        handler(record.method, asRecord(record.params) ?? {});
      }
    }
  }

  /**
   * Fail-safe only: with approvalPolicy "never" plus a read-only sandbox no
   * approval should arrive; decline anything that does so a run never hangs.
   */
  handleServerRequest(record) {
    if (/requestApproval/i.test(record.method)) {
      this.send({ id: record.id, result: { decision: "decline" } });
      return;
    }
    this.send({
      id: record.id,
      error: { code: -32601, message: `Unhandled server request: ${record.method}` },
    });
  }

  send(payload) {
    if (!this.process || this.exited) {
      throw new Error("codex app-server is not running");
    }
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  request(method, params, timeoutMs = RPC_TIMEOUT_MS) {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.send({ id, method, params });
    });
  }

  notify(method, params) {
    this.send({ method, params });
  }

  onNotification(handler) {
    this.notificationHandlers.add(handler);
  }

  stop() {
    this.process?.kill();
  }
}

async function runThread(client, options, promptFile) {
  const label = path.basename(promptFile).replace(/\.[^.]+$/, "");
  const prompt = await readFile(promptFile, "utf8");

  const threadStartParams = {
    cwd: options.cwd,
    approvalPolicy: options.approval,
    sandbox: options.sandbox,
  };
  if (options.model !== undefined) {
    threadStartParams.model = options.model;
  }
  const startResult = await client.request("thread/start", threadStartParams);
  const threadId = asRecord(asRecord(startResult)?.thread)?.id;
  if (typeof threadId !== "string") {
    throw new Error(`thread/start returned no thread id for ${label}`);
  }
  console.log(`[${label}] thread ${threadId} started`);

  const outcome = new Promise((resolve) => {
    let lastAgentMessage = "";
    const handler = (method, params) => {
      if (params.threadId !== threadId) {
        return;
      }
      if (method === "item/completed") {
        const item = asRecord(params.item);
        if (item?.type === "agentMessage" && typeof item.text === "string") {
          lastAgentMessage = item.text;
        }
        return;
      }
      if (method === "error") {
        const errorRecord = asRecord(params.error);
        console.error(
          `[${label}] error: ${errorRecord?.message ?? "unknown"} (willRetry=${String(params.willRetry)})`,
        );
        return;
      }
      if (method === "turn/completed") {
        client.notificationHandlers.delete(handler);
        const turn = asRecord(params.turn);
        const turnError = asRecord(turn?.error);
        resolve({
          status: typeof turn?.status === "string" ? turn.status : "unknown",
          error: typeof turnError?.message === "string" ? turnError.message : null,
          finalMessage: lastAgentMessage,
        });
      }
    };
    client.onNotification(handler);
  });

  const turnStartParams = {
    threadId,
    input: [{ type: "text", text: prompt }],
  };
  if (options.effort !== undefined) {
    turnStartParams.effort = options.effort;
  }
  const turnResult = await client.request("turn/start", turnStartParams);
  const turnId = asRecord(asRecord(turnResult)?.turn)?.id;

  const timeoutMs = options.timeoutMins * 60_000;
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      if (typeof turnId === "string") {
        client.request("turn/interrupt", { threadId, turnId }).catch(() => {});
      }
      resolve({
        status: "timed_out",
        error: `no turn/completed within ${options.timeoutMins}m`,
        finalMessage: "",
      });
    }, timeoutMs).unref?.();
  });

  const result = await Promise.race([outcome, timeout]);
  console.log(`[${label}] finished: ${result.status}`);
  return { label, threadId, promptFile, ...result };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir =
    options.out ??
    path.resolve("codex-thread-runs", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(outDir, { recursive: true });

  const client = new AppServerClient();
  await client.start();
  console.log(
    `app-server ready; cwd=${options.cwd} sandbox=${options.sandbox} approval=${options.approval}`,
  );

  try {
    const results = await Promise.all(
      options.promptFiles.map((promptFile) => runThread(client, options, promptFile)),
    );

    for (const result of results) {
      const body = `# ${result.label}

- thread: ${result.threadId} (resume: \`codex resume ${result.threadId}\`)
- status: ${result.status}${result.error ? `\n- error: ${result.error}` : ""}

---

${result.finalMessage || "(no agent message)"}
`;
      await writeFile(path.join(outDir, `${result.label}.md`), body, "utf8");
    }
    await writeFile(
      path.join(outDir, "summary.json"),
      `${JSON.stringify(
        results.map(({ finalMessage, ...rest }) => ({
          ...rest,
          finalMessageChars: finalMessage.length,
        })),
        null,
        2,
      )}\n`,
      "utf8",
    );

    console.log(`\nResults written to ${outDir}`);
    for (const result of results) {
      console.log(`- ${result.label}: ${result.status} (codex resume ${result.threadId})`);
    }
    const allCompleted = results.every((result) => result.status === "completed");
    process.exitCode = allCompleted ? 0 : 1;
  } finally {
    client.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
