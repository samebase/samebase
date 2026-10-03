/**
Minimal stdio MCP server that serves one catalog from a run directory.

node mcp-server.ts --run <runDir> --server <samebase|github|cloudflare-bindings|cloudflare-builds|convex>

It answers initialize, tools/list, tools/call, and ping. Calls go to the deterministic stub in
runtime.ts and are appended to <runDir>/calls.jsonl.
*/
import { createInterface } from "node:readline";

import { dispatch, readConfig, serverCatalogs } from "./runtime.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const runDir = argument("run");
const serverName = argument("server");
const config = readConfig(runDir);
const catalog = serverCatalogs(config).find((candidate) => candidate.server === serverName);
if (!catalog) throw new Error(`No catalog for server ${serverName}.`);

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
}

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line.trim() === "") return;
  const message: unknown = JSON.parse(line);
  const id = field(message, "id");
  const method = field(message, "method");
  const params = field(message, "params");
  if (id === undefined) return;
  if (method === "initialize") {
    const requested = field(params, "protocolVersion");
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: typeof requested === "string" ? requested : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: serverName === "samebase" ? "Samebase" : serverName,
          version: "0.0.0-eval",
        },
        ...(catalog.instructions ? { instructions: catalog.instructions } : {}),
      },
    });
    return;
  }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: catalog.tools } });
    return;
  }
  if (method === "tools/call") {
    const name = field(params, "name");
    const outcome = dispatch(
      runDir,
      serverName,
      typeof name === "string" ? name : "",
      field(params, "arguments"),
    );
    const structured =
      typeof outcome.structured === "object" &&
      outcome.structured !== null &&
      !Array.isArray(outcome.structured)
        ? { structuredContent: outcome.structured }
        : {};
    send({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: outcome.text }],
        isError: !outcome.ok,
        ...(outcome.ok ? structured : {}),
      },
    });
    return;
  }
  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${String(method)}` },
  });
});
