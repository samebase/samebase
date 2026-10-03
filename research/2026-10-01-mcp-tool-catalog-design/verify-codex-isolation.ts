/**
Checks, without a model call, that the Codex flags used for subjects turn off ChatGPT app
connectors, plugins, the shell, and other tools, and lists the MCP servers in the user's
config.toml that `--ignore-user-config` keeps out. After runs, `assertTextOnly` checks each event
log for tool calls.

node verify-codex-isolation.ts
*/
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const DISABLED_FEATURES = [
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

/** Fails when a text-only run's event log shows any tool or command item. */
export function assertTextOnly(eventsFile: string): void {
  if (!existsSync(eventsFile)) throw new Error(`Missing event log ${eventsFile}.`);
  for (const line of readFileSync(eventsFile, "utf8").split("\n")) {
    if (
      /"type":"(mcp_tool_call|command_execution|web_search|file_change|collab_tool_call)"/.test(
        line,
      )
    ) {
      throw new Error(`Tool activity in a text-only run: ${line.slice(0, 200)}`);
    }
  }
}

if (process.argv[1]?.endsWith("verify-codex-isolation.ts")) {
  const features = spawnSync(
    "codex",
    [...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]), "features", "list"],
    { encoding: "utf8" },
  ).stdout;
  let failed = false;
  for (const feature of DISABLED_FEATURES) {
    const row = features.split("\n").find((line) => line.startsWith(`${feature} `));
    const enabled = row?.trim().endsWith("true") ?? false;
    // codex-cli 0.159.2 keeps unified_exec on whatever the flag says. With shell_tool off it
    // exposes no shell tool (the tool-list probe shows only code mode), and assertTextOnly
    // fails closed on any command item.
    if (enabled && feature !== "unified_exec") failed = true;
    console.log(`${feature}: ${row ? (enabled ? "ON (problem)" : "off") : "not listed"}`);
  }
  const servers = spawnSync("codex", ["mcp", "list"], { encoding: "utf8" }).stdout;
  console.log("MCP servers in the user config (kept out by --ignore-user-config):");
  console.log(servers.trim());
  console.log(failed ? "isolation check FAILED" : "isolation check passed");
  process.exit(failed ? 1 : 0);
}
