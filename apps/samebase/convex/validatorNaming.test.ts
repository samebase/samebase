import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const convexDir = fileURLToPath(new URL("./", import.meta.url));
const ignoredDirectoryNames = new Set(["_generated", "node_modules"]);
const ignoredFileNames = new Set(["starterSeedManifest.generated.ts"]);
const validatorFactoryNames =
  "array|boolean|bytes|id|int64|literal|null|number|object|optional|record|string|union";
const exportedValidatorPattern = new RegExp(
  `export\\s+const\\s+([A-Za-z]\\w*)\\s*=\\s*(?:v\\.)?(?:${validatorFactoryNames})\\s*\\(`,
  "g",
);

function listConvexSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listConvexSourceFiles(fullPath));
      continue;
    }

    if (
      !entry.name.endsWith(".ts") ||
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".convex.test.ts") ||
      ignoredFileNames.has(entry.name)
    ) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function lineNumberForIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

describe("Convex validator names", () => {
  it("prefixes exported reusable validators with v", () => {
    const violations: string[] = [];

    for (const filePath of listConvexSourceFiles(convexDir)) {
      const source = fs.readFileSync(filePath, "utf8");
      for (const match of source.matchAll(exportedValidatorPattern)) {
        const name = match[1];
        if (!name || name.startsWith("v")) {
          continue;
        }

        const relativePath = path.relative(convexDir, filePath);
        violations.push(`${relativePath}:${lineNumberForIndex(source, match.index)} ${name}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
