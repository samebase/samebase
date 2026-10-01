/**
Zero-cost measurements of each design and naming scheme: catalog size, host name limits, and
exact name collisions with the surveyed provider servers.

node static-analysis.ts
*/
import { DESIGNS, SCHEMES, renderCatalog, type DesignId } from "./designs.ts";
import { loadProviders } from "./runtime.ts";

const designs: DesignId[] = ["P", "W", "H"];

console.log("## Catalog size (scheme D, base descriptions)");
console.log("design | tools | tool JSON chars | instruction chars | approx tokens (chars/4)");
for (const design of designs) {
  const catalog = renderCatalog(design, "D");
  const toolChars = JSON.stringify(
    catalog.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  ).length;
  console.log(
    `${design} | ${catalog.tools.length} | ${toolChars} | ${catalog.instructions.length} | ${Math.round((toolChars + catalog.instructions.length) / 4)}`,
  );
}

/** Qualified-name budgets from the hosts' sources (see the research note for links). */
const hosts = [
  {
    host: "Codex (namespace mcp__samebase + __, 128)",
    length: (name: string) => `mcp__samebase__${name}`.length,
    limit: 128,
  },
  {
    host: "Claude Code plugin (mcp__plugin_samebase_samebase__, 128)",
    length: (name: string) => `mcp__plugin_samebase_samebase__${name}`.length,
    limit: 128,
  },
  { host: "Anthropic directory (tool name, 64)", length: (name: string) => name.length, limit: 64 },
  { host: "OpenAI function name (64)", length: (name: string) => name.length, limit: 64 },
  {
    host: "Cursor (server key + tool, 60)",
    length: (name: string) => `samebase${name}`.length,
    limit: 60,
  },
  {
    host: "VS Code (mcp_samebase_ + tool, cut at 64)",
    length: (name: string) => `mcp_samebase_${name}`.length,
    limit: 64,
  },
  {
    host: "Gemini CLI (mcp_samebase_ + tool, 63)",
    length: (name: string) => `mcp_samebase_${name}`.length,
    limit: 63,
  },
];

const providerNames = new Map<string, string>();
for (const provider of loadProviders())
  for (const tool of provider.tools) providerNames.set(tool.name, provider.server);

console.log("\n## Names per scheme");
for (const design of designs) {
  for (const scheme of SCHEMES) {
    const names = DESIGNS[design].tools.map((tool) => tool.names[scheme]);
    if (scheme === "E" && names.join() === DESIGNS[design].tools.map((tool) => tool.names.D).join())
      continue;
    const lengths = names.map((name) => name.length);
    const over = hosts
      .map((host) => `${names.filter((name) => host.length(name) > host.limit).length}`)
      .join("/");
    const collisions = names
      .filter((name) => providerNames.has(name))
      .map((name) => `${name}=${providerNames.get(name)}`);
    const mixedCase = names.filter((name) => /[A-Z]/.test(name)).length;
    console.log(
      `${design}-${scheme} | max ${Math.max(...lengths)} | mean ${(lengths.reduce((sum, value) => sum + value, 0) / lengths.length).toFixed(1)} | over limit (${hosts.map((host) => host.host.split(" ")[0]).join("/")}) ${over} | camelCase ${mixedCase} | exact collisions ${collisions.join(", ") || "none"}`,
    );
  }
}
console.log(`\nHost order: ${hosts.map((host) => host.host).join("; ")}`);
