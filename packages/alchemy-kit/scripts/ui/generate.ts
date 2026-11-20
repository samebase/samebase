// Writes src/ui/resourceTypes.generated.ts and src/ui/icons.generated.ts from the entries of
// alchemy-run/alchemy pull request #1441, the entries in resourceTypes.input.ts, and the Lucide
// icons that apps/samebase installs. Run: node scripts/ui/generate.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { formatWithVpFmt } from "../../../../scripts/format-with-vp-fmt.ts";
import { resourceCategories } from "../../src/ui/ResourceTypeEntry.ts";
import { readAlchemySource, SourceFiles } from "./alchemySource.ts";
import {
  defaultResourceTypes,
  type InputEntry,
  resourceTypeEntries,
} from "./resourceTypes.input.ts";

/** The head commit of https://github.com/alchemy-run/alchemy/pull/1441. */
const PR_1441_HEAD = "46f807f01b81da214864f3745f14b479398888b2";
const DEFAULT_ICON = "box";

const srcUi = fileURLToPath(new URL("../../src/ui/", import.meta.url));

const isCategory = (value: string) => resourceCategories.find((category) => category === value);

/** The entries of PR #1441: every `UIProvider.succeed("<tag>", { ... })` in its ui.ts files. */
async function pullRequestEntries() {
  const files = new SourceFiles(
    await readAlchemySource(PR_1441_HEAD, (path) => /^packages\/.+\/(ui|UI)\.ts$/.test(path)),
  );
  const entries = new Map<string, InputEntry>();
  for (const path of [...files.paths()].sort()) {
    const source = files.get(path);
    if (source === undefined) continue;
    const visit = (node: ts.Node) => {
      ts.forEachChild(node, visit);
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        node.expression.expression.getText() !== "UIProvider"
      ) {
        return;
      }
      const where = `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      const [typeArgument, service] = node.arguments;
      if (node.expression.name.text !== "succeed" || typeArgument === undefined) {
        throw new Error(`${where}: read only UIProvider.succeed("<tag>", { ... }) calls`);
      }
      const type = files.stringValue(typeArgument, source);
      if (type === undefined || service === undefined || !ts.isObjectLiteralExpression(service)) {
        throw new Error(`${where}: expected a constant tag and an object literal`);
      }
      const field = (name: string) => {
        const property = service.properties.find(
          (candidate) =>
            ts.isPropertyAssignment(candidate) &&
            ts.isIdentifier(candidate.name) &&
            candidate.name.text === name,
        );
        if (property === undefined) return undefined;
        const value = ts.isPropertyAssignment(property)
          ? files.stringValue(property.initializer, source)
          : undefined;
        if (value === undefined) throw new Error(`${where}: ${name} is not a constant string`);
        return value;
      };
      const name = field("displayName");
      const icon = field("icon");
      const category = isCategory(field("category") ?? "other");
      if (name === undefined || icon === undefined || category === undefined) {
        throw new Error(`${where}: ${type} needs a displayName, an icon and a known category`);
      }
      if (entries.has(type)) throw new Error(`${where}: ${type} has a second entry`);
      entries.set(type, { name, icon, color: field("color"), category });
    };
    visit(source);
  }
  return entries;
}

const appRequire = createRequire(
  new URL("../../../../apps/samebase/package.json", import.meta.url),
);
const lucideRoot = dirname(appRequire.resolve("lucide-react/package.json"));
const lucideVersion: unknown = JSON.parse(
  readFileSync(join(lucideRoot, "package.json"), "utf8"),
).version;
const lucideEsm = join(lucideRoot, "dist/esm");

const parseModule = (path: string) =>
  ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);

/** Every Lucide icon name and alias, with the current name of its icon. */
function lucideNames() {
  const names = new Map<string, string>();
  const source = parseModule(join(lucideEsm, "dynamicIconImports.js"));
  const visit = (node: ts.Node) => {
    ts.forEachChild(node, visit);
    if (!ts.isPropertyAssignment(node) || !ts.isStringLiteral(node.name)) return;
    const target = /import\('\.\/icons\/([a-z0-9-]+)\.js'\)/.exec(node.initializer.getText())?.[1];
    if (target !== undefined) names.set(node.name.text, target);
  };
  visit(source);
  return names;
}

/** The `__iconNode` of a Lucide icon module, without the React `key` attributes. */
function iconNode(name: string) {
  const source = parseModule(join(lucideEsm, "icons", `${name}.js`));
  let node: Array<[string, Record<string, string>]> | undefined;
  const fail = () => new Error(`lucide-react icon ${name}: __iconNode is not [tag, attributes][]`);
  const visit = (candidate: ts.Node) => {
    ts.forEachChild(candidate, visit);
    if (
      !ts.isVariableDeclaration(candidate) ||
      candidate.name.getText() !== "__iconNode" ||
      candidate.initializer === undefined ||
      !ts.isArrayLiteralExpression(candidate.initializer)
    ) {
      return;
    }
    node = candidate.initializer.elements.map((element) => {
      if (!ts.isArrayLiteralExpression(element)) throw fail();
      const [tag, attributes] = element.elements;
      if (
        tag === undefined ||
        !ts.isStringLiteral(tag) ||
        attributes === undefined ||
        !ts.isObjectLiteralExpression(attributes)
      ) {
        throw fail();
      }
      const values: Record<string, string> = {};
      for (const property of attributes.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
          !ts.isStringLiteral(property.initializer)
        ) {
          throw fail();
        }
        if (property.name.text !== "key") values[property.name.text] = property.initializer.text;
      }
      return [tag.text, values];
    });
  };
  visit(source);
  if (node === undefined) throw fail();
  return node;
}

const fromPullRequest = await pullRequestEntries();
const entries = new Map<string, InputEntry | "default">(fromPullRequest);
for (const [type, entry] of Object.entries(resourceTypeEntries)) {
  if (entries.has(type)) throw new Error(`${type} is in PR #1441 and in resourceTypeEntries`);
  entries.set(type, entry);
}
for (const type of defaultResourceTypes) {
  if (entries.has(type)) throw new Error(`${type} has an entry and is in defaultResourceTypes`);
  entries.set(type, "default");
}

const names = lucideNames();
const unknownIcons = new Set<string>();
const resolveIcon = (icon: string) => {
  const current = names.get(icon);
  if (current === undefined) unknownIcons.add(icon);
  return current ?? icon;
};
const resolved = [...entries]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([type, entry]) => {
    if (entry === "default") return [type, entry] as const;
    return [type, { ...entry, icon: resolveIcon(entry.icon) }] as const;
  });
if (unknownIcons.size > 0) {
  throw new Error(
    `lucide-react ${String(lucideVersion)} has no icon ${[...unknownIcons].join(", ")}`,
  );
}

const iconNames = new Set([resolveIcon(DEFAULT_ICON)]);
for (const [, entry] of resolved) if (entry !== "default") iconNames.add(entry.icon);
const icons = Object.fromEntries([...iconNames].sort().map((name) => [name, iconNode(name)]));

const header = (sources: string) =>
  `// Generated by scripts/ui/generate.ts from ${sources}. Do not edit.\n`;

const iconsPath = join(srcUi, "icons.generated.ts");
writeFileSync(
  iconsPath,
  await formatWithVpFmt(
    iconsPath,
    `${header(`lucide-react ${String(lucideVersion)}`)}
export const icons = ${JSON.stringify(icons)} as const;

export type IconName = keyof typeof icons;
`,
  ),
);

const typesPath = join(srcUi, "resourceTypes.generated.ts");
writeFileSync(
  typesPath,
  await formatWithVpFmt(
    typesPath,
    `${header(`https://github.com/alchemy-run/alchemy/pull/1441 at ${PR_1441_HEAD.slice(0, 9)} and scripts/ui/resourceTypes.input.ts`)}
import type { ResourceTypeEntry } from "./ResourceTypeEntry.ts";

export const resourceTypes = new Map<string, ResourceTypeEntry | "default">([
${resolved
  .map(([type, entry]) => {
    if (entry === "default") return `[${JSON.stringify(type)}, "default"],`;
    const color = entry.color === undefined ? "undefined" : JSON.stringify(entry.color);
    return `[${JSON.stringify(type)}, { name: ${JSON.stringify(entry.name)}, icon: ${JSON.stringify(entry.icon)}, color: ${color}, category: ${JSON.stringify(entry.category)} }],`;
  })
  .join("\n")}
]);
`,
  ),
);

const renamed = [...fromPullRequest.values()].filter(
  (entry) => names.get(entry.icon) !== entry.icon,
);
console.log(
  `${fromPullRequest.size} entries from PR #1441 (${renamed.length} with a renamed icon), ` +
    `${Object.keys(resourceTypeEntries).length} from the input, ${defaultResourceTypes.length} default, ` +
    `${iconNames.size} icons from lucide-react ${String(lucideVersion)}`,
);
