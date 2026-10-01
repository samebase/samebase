/**
Asks a Codex subject to list the tool names it can see, without calling any, to confirm that only
the stub servers are attached and to record how Codex presents MCP tool names.

node probe-codex-tools.ts <runDir> <model>
*/
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { HARNESS_DIR, writeConfig } from "./runtime.ts";

const runDir = process.argv[2];
const model = process.argv[3] ?? "gpt-6-luna";
mkdirSync(path.join(runDir, "work"), { recursive: true });
writeConfig(runDir, { design: "P", scheme: "A", variant: "base", fixture: "A", providers: true });
const disabled = [
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
const args = [
  "exec",
  "--ignore-user-config",
  "--skip-git-repo-check",
  "--json",
  "-m",
  model,
  ...disabled.flatMap((feature) => ["--disable", feature]),
  "-c",
  `model_reasoning_effort="low"`,
  "-c",
  `approval_policy="never"`,
  "-c",
  `sandbox_mode="read-only"`,
];
for (const server of ["samebase", "github", "cloudflare-bindings", "cloudflare-builds", "convex"]) {
  args.push(
    "-c",
    `mcp_servers.${server}={command="node", args=${JSON.stringify([path.join(HARNESS_DIR, "mcp-server.ts"), "--run", runDir, "--server", server])}, default_tools_approval_mode="approve"}`,
  );
}
args.push(
  "-C",
  path.join(runDir, "work"),
  "Do not call any tool. List every tool you can call, exactly as its callable name appears to you (including any namespace or prefix), one per line. Then list any namespace descriptions you see, quoted.",
);
const result = spawnSync("codex", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
for (const line of result.stdout.split("\n")) {
  if (line.includes('"agent_message"')) console.log(JSON.parse(line).item.text);
  if (line.includes('"mcp_tool_call"')) console.log("TOOL CALL:", line.slice(0, 300));
  if (line.includes('"turn.completed"')) console.log(line);
}
console.log(result.stderr.slice(-500));
