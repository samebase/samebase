/**
Run directory state shared by the stdio MCP stub (mcp-server.ts) and the command-line stub
(call.ts). A run directory holds config.json, state.json, and calls.jsonl.
*/
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  callTool,
  renderCatalog,
  type DescriptionVariant,
  type DesignId,
  type JsonSchema,
  type Scheme,
} from "./designs.ts";
import { buildFixture, type FixtureId, type State } from "./fixtures.ts";

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));

export type RunConfig = {
  design: DesignId;
  scheme: Scheme;
  variant: DescriptionVariant;
  fixture: FixtureId;
  providers: boolean;
};

export type ProviderTool = { name: string; description: string };
export type ProviderServer = { server: string; source: string; tools: ProviderTool[] };

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

export function loadProviders(): ProviderServer[] {
  const servers = field(readJson(path.join(HARNESS_DIR, "providers.json")), "servers");
  if (!Array.isArray(servers)) throw new Error("providers.json has no servers.");
  return servers.map((server) => {
    const tools = field(server, "tools");
    if (!Array.isArray(tools)) throw new Error("provider server has no tools.");
    return {
      server: text(field(server, "server"), "server"),
      source: text(field(server, "source"), "source"),
      tools: tools.map((tool) => ({
        name: text(field(tool, "name"), "name"),
        description: text(field(tool, "description"), "description"),
      })),
    };
  });
}

const DESIGN_IDS: readonly DesignId[] = ["P", "W", "H"];
const SCHEME_IDS: readonly Scheme[] = ["A", "B", "C", "D", "E"];
const FIXTURE_IDS: readonly FixtureId[] = ["A", "A_rotated", "B", "C"];

export function readConfig(runDir: string): RunConfig {
  const raw = readJson(path.join(runDir, "config.json"));
  const design = DESIGN_IDS.find((id) => id === field(raw, "design"));
  const scheme = SCHEME_IDS.find((id) => id === field(raw, "scheme"));
  const fixture = FIXTURE_IDS.find((id) => id === field(raw, "fixture"));
  const variant = field(raw, "variant") === "when" ? "when" : "base";
  if (!design || !scheme || !fixture) throw new Error(`Bad config in ${runDir}.`);
  return { design, scheme, variant, fixture, providers: field(raw, "providers") !== false };
}

export function writeConfig(runDir: string, config: RunConfig): void {
  writeFileSync(path.join(runDir, "config.json"), JSON.stringify(config, null, 2));
}

export function loadState(runDir: string, config: RunConfig): State {
  const file = path.join(runDir, "state.json");
  if (!existsSync(file)) return buildFixture(config.fixture);
  // The file was written by saveState from a State value in this same harness.
  const parsed: State = JSON.parse(readFileSync(file, "utf8"));
  return parsed;
}

export function saveState(runDir: string, state: State): void {
  writeFileSync(path.join(runDir, "state.json"), JSON.stringify(state, null, 2));
}

export type CallRecord = {
  at: string;
  server: string;
  tool: string;
  args: unknown;
  ok: boolean;
  text: string;
};

export function logCall(runDir: string, record: CallRecord): void {
  appendFileSync(path.join(runDir, "calls.jsonl"), `${JSON.stringify(record)}\n`);
}

export function readCalls(runDir: string): CallRecord[] {
  const file = path.join(runDir, "calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const parsed: CallRecord = JSON.parse(line);
      return parsed;
    });
}

const PERMISSIVE: JsonSchema = { type: "object", additionalProperties: true };

export type ServerTools = {
  server: string;
  instructions: string | null;
  tools: { name: string; description: string; inputSchema: JsonSchema; annotations?: unknown }[];
};

export function serverCatalogs(config: RunConfig): ServerTools[] {
  const rendered = renderCatalog(config.design, config.scheme, config.variant);
  const samebase: ServerTools = {
    server: "samebase",
    instructions: rendered.instructions,
    tools: rendered.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  };
  if (!config.providers) return [samebase];
  return [
    samebase,
    ...loadProviders().map((provider) => ({
      server: provider.server,
      instructions: null,
      tools: provider.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: PERMISSIVE,
      })),
    })),
  ];
}

/** Plausible, uninformative provider results. Samebase tasks never depend on them. */
function providerResult(tool: string): unknown {
  if (tool === "get_me") return { login: "octo-user", name: "Octo User" };
  if (tool === "get_file_contents")
    return {
      path: "README.md",
      content: "# Hello World\n\nMy first repository on GitHub.\n",
      sha: "980a0d5f19a64b4b30a87d4206aade58726b60e3",
    };
  if (tool.startsWith("create_pull_request"))
    return { number: 7, url: "https://github.com/octocat/Hello-World/pull/7" };
  if (tool.startsWith("list_") || tool.endsWith("_list") || tool.startsWith("search_"))
    return { items: [] };
  if (tool === "status") return { deployments: [] };
  return { ok: true };
}

export function dispatch(
  runDir: string,
  server: string,
  tool: string,
  args: unknown,
): { ok: boolean; text: string; structured: unknown } {
  const config = readConfig(runDir);
  const at = new Date().toISOString();
  if (server === "samebase") {
    const state = loadState(runDir, config);
    const outcome = callTool(state, config.design, config.scheme, tool, args);
    saveState(runDir, state);
    logCall(runDir, { at, server, tool, args, ok: outcome.ok, text: outcome.text });
    return { ok: outcome.ok, text: outcome.text, structured: outcome.result };
  }
  const known = loadProviders()
    .find((candidate) => candidate.server === server)
    ?.tools.some((candidate) => candidate.name === tool);
  const result = known ? providerResult(tool) : null;
  const message = known ? JSON.stringify(result) : `Unknown tool: ${tool}`;
  logCall(runDir, { at, server, tool, args, ok: Boolean(known), text: message });
  return { ok: Boolean(known), text: message, structured: result };
}
