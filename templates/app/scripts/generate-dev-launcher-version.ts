// Samebase source build: v1977
/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const headerPrefix = "// Samebase starter dev launcher sha256:";
const sourceBuildHeaderPattern = /^\/\/ Samebase source build: v[1-9]\d*$/;
const launcherFiles = [
  {
    name: "run-context-dev.ts",
    path: fileURLToPath(new URL("./run-context-dev.ts", import.meta.url)),
  },
  {
    name: "run-primary-dev.ts",
    path: fileURLToPath(new URL("./run-primary-dev.ts", import.meta.url)),
  },
  {
    name: "run-worktree-dev.ts",
    path: fileURLToPath(new URL("./run-worktree-dev.ts", import.meta.url)),
  },
];

function readLauncher(filePath: string) {
  const source = readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
  const firstNewline = source.indexOf("\n");
  if (firstNewline < 0) {
    throw new Error(`${filePath} must start with a Samebase source build header.`);
  }
  const sourceBuildHeader = source.slice(0, firstNewline);
  if (!sourceBuildHeaderPattern.test(sourceBuildHeader)) {
    throw new Error(`${filePath} must start with // Samebase source build: v<N>.`);
  }

  const secondNewline = source.indexOf("\n", firstNewline + 1);
  const launcherHeader = source.slice(firstNewline + 1, secondNewline);
  if (secondNewline < 0 || !launcherHeader.startsWith(headerPrefix)) {
    throw new Error(`${filePath} line 2 must start with ${headerPrefix}<hash>.`);
  }

  return {
    sourceBuildHeader,
    launcherHeader,
    body: source.slice(secondNewline + 1),
  };
}

const launcherBodies = launcherFiles.map((file) => ({
  ...file,
  ...readLauncher(file.path),
}));
const hash = createHash("sha256");
for (const file of launcherBodies) {
  hash.update(file.name);
  hash.update("\0");
  hash.update(file.body);
  hash.update("\0");
}
const expectedHeader = `${headerPrefix}${hash.digest("hex")}`;
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--write")) {
  throw new Error("Usage: generate-dev-launcher-version.ts [--write]");
}
const shouldWrite = args[0] === "--write";

const staleFiles = launcherBodies.filter((file) => file.launcherHeader !== expectedHeader);
if (shouldWrite) {
  for (const file of staleFiles) {
    writeFileSync(file.path, `${file.sourceBuildHeader}\n${expectedHeader}\n${file.body}`, "utf8");
  }
} else if (staleFiles.length > 0) {
  throw new Error(
    `Starter dev launcher version is stale. Run \`vp run generate:dev-launcher-version\`.`,
  );
}
