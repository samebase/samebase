import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import codexMarketplace from "../packages/plugin/.agents/plugins/marketplace.json" with { type: "json" };
import claudeMarketplace from "../packages/plugin/.claude-plugin/marketplace.json" with { type: "json" };
import claudeManifest from "../packages/plugin/plugins/samebase/.claude-plugin/plugin.json" with { type: "json" };
import codexManifest from "../packages/plugin/plugins/samebase/.codex-plugin/plugin.json" with { type: "json" };
import mcp from "../packages/plugin/plugins/samebase/.mcp.json" with { type: "json" };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(repoRoot, "packages/plugin");
const pluginRoot = resolve(packageRoot, "plugins/samebase");
const repositoryUrl = "https://github.com/samebase/plugin";

function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function resolvePluginPath(baseRoot: string, relativePath: string, label: string): string {
  check(!isAbsolute(relativePath), `${label} must be relative: ${relativePath}`);
  const resolvedPath = resolve(baseRoot, relativePath);
  const pathFromRoot = relative(baseRoot, resolvedPath);
  check(
    pathFromRoot !== "" &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot),
    `${label} must stay inside its declared root: ${relativePath}`,
  );
  check(existsSync(resolvedPath), `${label} does not resolve: ${relativePath}`);
  return resolvedPath;
}

const [codexMarketplacePlugin] = codexMarketplace.plugins;
const [claudeMarketplacePlugin] = claudeMarketplace.plugins;

check(codexMarketplacePlugin.name === "samebase", "Unexpected Codex marketplace plugin name.");
check(claudeMarketplacePlugin.name === "samebase", "Unexpected Claude marketplace plugin name.");
check(codexManifest.name === "samebase", "Unexpected Codex manifest name.");
check(claudeManifest.name === "samebase", "Unexpected Claude manifest name.");
check(codexManifest.version === claudeManifest.version, "Plugin manifest versions must match.");
check(codexManifest.license === "Apache-2.0", "The plugin must use the Apache-2.0 license.");
check(codexManifest.repository === repositoryUrl, "Unexpected Codex repository URL.");
check(claudeManifest.repository === repositoryUrl, "Unexpected Claude repository URL.");
check(
  claudeMarketplacePlugin.repository === repositoryUrl,
  "Unexpected Claude marketplace repository URL.",
);
check(
  codexManifest.description === claudeManifest.description &&
    codexManifest.description === claudeMarketplacePlugin.description,
  "Shared plugin descriptions must match.",
);
check(mcp.mcpServers.samebase.url === "https://api.samebase.com/mcp", "Unexpected MCP endpoint.");

for (const relativePath of ["LICENSE", "NOTICE", "SECURITY.md"]) {
  resolvePluginPath(packageRoot, relativePath, relativePath);
}

check(codexMarketplacePlugin.source.source === "local", "Codex must use a local plugin source.");
check(
  resolvePluginPath(packageRoot, codexMarketplacePlugin.source.path, "Codex marketplace source") ===
    pluginRoot,
  "The Codex marketplace must install the shared plugin directory.",
);
check(
  resolvePluginPath(packageRoot, claudeMarketplacePlugin.source, "Claude marketplace source") ===
    pluginRoot,
  "The Claude marketplace must install the shared plugin directory.",
);
check(
  resolvePluginPath(pluginRoot, codexManifest.skills, "Codex skills path") ===
    resolve(pluginRoot, "skills"),
  "Unexpected Codex skills path.",
);
check(
  resolvePluginPath(pluginRoot, claudeManifest.skills, "Claude skills path") ===
    resolve(pluginRoot, "skills"),
  "Unexpected Claude skills path.",
);
check(
  resolvePluginPath(pluginRoot, codexManifest.mcpServers, "Codex MCP path") ===
    resolve(pluginRoot, ".mcp.json"),
  "Unexpected Codex MCP path.",
);
check(
  resolvePluginPath(pluginRoot, claudeManifest.mcpServers, "Claude MCP path") ===
    resolve(pluginRoot, ".mcp.json"),
  "Unexpected Claude MCP path.",
);

const iconPath = resolve(pluginRoot, "assets/icon.png");
check(
  resolvePluginPath(pluginRoot, codexManifest.interface.composerIcon, "Codex composer icon") ===
    iconPath,
  "Unexpected Codex composer icon.",
);
check(
  resolvePluginPath(pluginRoot, codexManifest.interface.logo, "Codex logo") === iconPath,
  "Unexpected Codex logo.",
);

const skillsRoot = resolve(pluginRoot, "skills");
const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
check(
  skillDirectories.length === 1 && skillDirectories[0] === "samebase",
  "The public plugin must contain only the Samebase skill.",
);
resolvePluginPath(skillsRoot, "samebase/SKILL.md", "Samebase skill");

// The skill ships in the reviewed app bundle, so it names no marketplace.
for (const entry of readdirSync(resolve(skillsRoot, "samebase"), {
  recursive: true,
  withFileTypes: true,
})) {
  if (entry.isFile()) {
    const filePath = resolve(entry.parentPath, entry.name);
    check(
      !/marketplace/i.test(readFileSync(filePath, "utf8")),
      `The Samebase skill must not name a marketplace: ${relative(repoRoot, filePath)}`,
    );
  }
}

console.log("Samebase agent plugin checks passed.");
