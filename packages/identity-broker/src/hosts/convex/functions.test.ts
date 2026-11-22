// Generates the component's function modules (one per command group, so the dashboard path
// `authRequests:exchangeCode` is the command name) and the map from each command to its function.
// Convex finds functions only through static named exports. A run fails while a generated file is
// stale; `pnpm run generate:convex` writes them.
import { expect, test } from "vite-plus/test";
import { commandNames, commands, type CommandName } from "../../store/commands.ts";

const header = "// Generated from src/store/commands.ts by src/hosts/convex/functions.test.ts.\n";

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

test.each([...groups])("component/%s.ts is current", async (group, names) => {
  const builders = [...new Set(names.map(builder))].sort();
  const exports = names.map(
    (name) => `export const ${split(name).fn} = ${builder(name)}("${name}");\n`,
  );
  await expect(
    `${header}import { ${builders.join(", ")} } from "../functions.ts";\n\n${exports.join("")}`,
  ).toMatchFileSnapshot(`./component/${group}.ts`);
});

test("references.ts is current", async () => {
  const entries = commandNames.map((name) => {
    const { group, fn } = split(name);
    return `  "${name}": {\n    kind: "${kind(name)}",\n    reference: component.${group}.${fn},\n  },\n`;
  });
  await expect(`${header}import type { api } from "./component/_generated/api.ts";
import type { ComponentApi } from "./component/_generated/component.ts";
import type { CommandFunctions } from "./functions.ts";

/** Each command's function, in an app's \`components.<name>\` or in the component's own \`api\`. */
export const commandFunctions = (component: ComponentApi | typeof api): CommandFunctions => ({
${entries.join("")}});
`).toMatchFileSnapshot("./references.ts");
});
