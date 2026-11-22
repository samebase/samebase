// Writes the Convex component's function modules (one per command group, so the dashboard path
// `authRequests:exchangeCode` is the command name) and the map from each command to its function.
// Convex finds functions only through static named exports. `--check` fails on a stale, missing or
// leftover file and writes nothing.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { commandNames, commands, type CommandName } from "../src/store/commands.ts";

const header = "// Generated from src/store/commands.ts by scripts/generate-convex-functions.ts.\n";
const convexDir = new URL("../src/hosts/convex/", import.meta.url);
const componentDir = new URL("component/", convexDir);

const split = (name: CommandName) => {
  const dot = name.indexOf(".");
  return { group: name.slice(0, dot), fn: name.slice(dot + 1) };
};
const kind = (name: CommandName) => (commands[name].readOnly ? "query" : "mutation");
const builder = (name: CommandName) =>
  kind(name) === "query" ? "commandQuery" : "commandMutation";

const groups = new Map<string, Array<CommandName>>();
for (const name of commandNames) {
  const { group } = split(name);
  groups.set(group, [...(groups.get(group) ?? []), name]);
}

const files = new Map<URL, string>();
for (const [group, names] of groups) {
  const builders = [...new Set(names.map(builder))].sort();
  const exports = names.map(
    (name) => `export const ${split(name).fn} = ${builder(name)}("${name}");\n`,
  );
  files.set(
    new URL(`${group}.ts`, componentDir),
    `${header}import { ${builders.join(", ")} } from "../functions.ts";\n\n${exports.join("")}`,
  );
}
const entries = commandNames.map((name) => {
  const { group, fn } = split(name);
  return `  "${name}": {\n    kind: "${kind(name)}",\n    reference: component.${group}.${fn},\n  },\n`;
});
files.set(
  new URL("references.ts", convexDir),
  `${header}import type { api } from "./component/_generated/api.ts";
import type { ComponentApi } from "./component/_generated/component.ts";
import type { CommandFunctions } from "./functions.ts";

/** Each command's function, in an app's \`components.<name>\` or in the component's own \`api\`. */
export const commandFunctions = (component: ComponentApi | typeof api): CommandFunctions => ({
${entries.join("")}});
`,
);

const read = (file: URL) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};
const wanted = new Set([...files.keys()].map((file) => file.href));
const leftovers = readdirSync(componentDir)
  .map((name) => new URL(name, componentDir))
  .filter((file) => !wanted.has(file.href) && read(file)?.startsWith(header) === true);
const stale = [...files].filter(([file, text]) => read(file) !== text);

if (process.argv.includes("--check")) {
  const wrong = [...stale.map(([file]) => file), ...leftovers];
  if (wrong.length > 0) {
    console.error(
      `Stale Convex function files, run \`pnpm run generate:convex\`:\n${wrong.map((file) => `  ${file.pathname}`).join("\n")}`,
    );
    process.exit(1);
  }
} else {
  for (const [file, text] of stale) writeFileSync(file, text);
  for (const file of leftovers) rmSync(file);
}
