// Fails when a resource type of Alchemy, or of our own packages, has no entry in
// src/ui/resourceTypes.generated.ts. Prints each such type on stdout.
// Run: node scripts/ui/check.ts [--alchemy <version>]
import { globSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import packageJson from "../../package.json" with { type: "json" };
import { resourceTypes } from "../../src/ui/resourceTypes.generated.ts";
import {
  declaredResourceTypes,
  isPackageSource,
  readAlchemySource,
  SourceFiles,
} from "./alchemySource.ts";

/**
 * Calls that are no declaration. `Renamed` in Command/Providers.ts gives old type names a no-op
 * provider, so state rows of those types can be deleted.
 */
const notDeclarations = new Set(["packages/alchemy/src/Command/Providers.ts: input.from"]);

const { values } = parseArgs({ options: { alchemy: { type: "string" } } });
const version = values.alchemy ?? packageJson.devDependencies.alchemy;

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const ownPaths = globSync(
  [
    "packages/{alchemy-convex,alchemy-kit}/src/**/*.ts",
    "packages/identity-broker/src/client/**/*.ts",
  ],
  // The client's tests declare a sample host resource.
  { cwd: repoRoot, exclude: ["**/*.test.ts"] },
);
const own = declaredResourceTypes(
  new SourceFiles(
    new Map(
      ownPaths.map((path) => [path.split(sep).join("/"), readFileSync(repoRoot + path, "utf8")]),
    ),
  ),
);
const upstream = declaredResourceTypes(
  new SourceFiles(await readAlchemySource(`refs/tags/v${version}`, isPackageSource)),
);

const unresolved = [...upstream.unresolved, ...own.unresolved]
  .map(({ path, text }) => `${path}: ${text}`)
  .filter((place) => !notDeclarations.has(place));
if (unresolved.length > 0) {
  throw new Error(`These resource types are not constant strings:\n${unresolved.join("\n")}`);
}

const declared = new Map([...upstream.tags, ...own.tags]);
const missing = [...declared]
  .filter(([type]) => !resourceTypes.has(type))
  .sort(([a], [b]) => (a < b ? -1 : 1));
for (const [type, path] of missing) console.log(`- ${type} (${path})`);
console.error(
  missing.length === 0
    ? `All ${declared.size} resource types of Alchemy ${version} and our packages have an entry`
    : `${missing.length} of ${declared.size} resource types of Alchemy ${version} and our packages have no entry. Add each to scripts/ui/resourceTypes.input.ts and run scripts/ui/generate.ts`,
);
if (missing.length > 0) process.exitCode = 1;
