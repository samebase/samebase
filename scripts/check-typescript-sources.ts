import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fail, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

const generatedJavaScriptPaths = new Set([
  "apps/samebase/convex/_generated/api.js",
  "apps/samebase/convex/_generated/server.js",
  "apps/samebase/convex/cloudflareApi/validators.generated.js",
  "apps/samebase/convex/convexManagementApi/validators.generated.js",
]);

const handwrittenSourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts"]);

export function readTrackedFilePaths(repoRoot: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--cached"], {
    cwd: repoRoot,
  })
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0);
}

export function findHandwrittenJavaScript(filePaths: readonly string[]): string[] {
  return filePaths
    .filter(
      (filePath) =>
        handwrittenSourceExtensions.has(path.posix.extname(filePath)) &&
        !generatedJavaScriptPaths.has(filePath),
    )
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

export function checkTypeScriptSources(repoRoot: string): void {
  const handwrittenJavaScript = findHandwrittenJavaScript(readTrackedFilePaths(repoRoot));
  if (handwrittenJavaScript.length === 0) {
    console.log("All tracked handwritten source files use TypeScript.");
    return;
  }

  fail(
    `Tracked handwritten source files must use normal .ts or .tsx extensions:\n${handwrittenJavaScript
      .map((filePath) => `- ${filePath}`)
      .join("\n")}`,
  );
}

function isDirectEntry(moduleUrl: string, entryPath = process.argv[1]): boolean {
  if (!entryPath) {
    return false;
  }

  return realpathSync(path.resolve(entryPath)) === realpathSync(fileURLToPath(moduleUrl));
}

if (isDirectEntry(import.meta.url)) {
  await runMain(() => checkTypeScriptSources(resolveRepoRoot()));
}
