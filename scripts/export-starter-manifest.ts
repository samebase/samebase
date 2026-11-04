import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** The starter's source. samebase.com seeds new apps from one pinned commit of it. */
export const starterSourceRepository = "https://github.com/samebase/base.git";

const manifestPath = trackedFilePath("apps/samebase/convex/starterSeedManifest.generated.ts");

// rawContent and mode are the source of truth for hashing; content is only the
// deterministic UTF-8/base64 manifest representation derived from those bytes.
export type CollectedTemplateFile = {
  relativePath: string;
  content: string;
  encoding: "utf-8" | "base64";
  rawContent: Buffer;
  mode: "100644" | "100755";
};

function isExecutableCollectedFile(
  file: CollectedTemplateFile,
  // eslint-disable-next-line samebase/no-hand-written-type-predicate -- property-literal intersection: the check narrows the property, not the object (guard conversion fails TS2322)
): file is CollectedTemplateFile & { mode: "100755" } {
  return file.mode === "100755";
}

async function runPnpm(args: readonly string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const childProcess = spawn(PNPM_COMMAND, args, {
      cwd,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal === null
            ? `pnpm ${args.join(" ")} failed with exit code ${code ?? "unknown"}`
            : `pnpm ${args.join(" ")} exited with signal ${signal}`,
        ),
      );
    });
  });
}

async function formatGeneratedFile(filePath: string, cwd: string): Promise<void> {
  await runPnpm(["exec", "vp", "fmt", filePath], cwd);
}

function containsBinaryControlByte(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }

    const isAllowedTextControlByte = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedTextControlByte) {
      return true;
    }
  }

  return false;
}

function gitOutput(cwd: string, args: readonly string[]): Buffer {
  return execFileSync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseNullSeparatedPaths(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0);
}

function assertCommitSha(value: string, source: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${source} is not a full commit sha: ${value}`);
  }
  return value;
}

/** Reads every file of a commit as Git stores it, so the seed holds the exact committed bytes. */
export function collectTemplateFiles(
  gitDirectory: string,
  commit: string,
): CollectedTemplateFile[] {
  const entries = parseNullSeparatedPaths(gitOutput(gitDirectory, ["ls-tree", "-r", "-z", commit]));
  const files: CollectedTemplateFile[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("\t");
    const metadata = entry.slice(0, separatorIndex);
    const relativePath = entry.slice(separatorIndex + 1);
    const match = /^(\d{6}) (\w+) ([0-9a-f]+)$/.exec(metadata);
    if (separatorIndex === -1 || match === null || relativePath.length === 0) {
      throw new Error(`Unsupported Git tree entry in the starter: ${entry}`);
    }
    const [, treeMode, type, objectId] = match;
    if (type !== "blob") {
      throw new Error(`Unsupported starter ${type} entry: ${relativePath}`);
    }
    let mode: CollectedTemplateFile["mode"];
    if (treeMode === "100644" || treeMode === "100755") {
      mode = treeMode;
    } else {
      throw new Error(`Unsupported starter mode ${treeMode}: ${relativePath}`);
    }
    const buffer = gitOutput(gitDirectory, ["cat-file", "blob", objectId]);

    if (containsBinaryControlByte(buffer)) {
      files.push({
        relativePath,
        content: buffer.toString("base64"),
        encoding: "base64",
        rawContent: buffer,
        mode,
      });
      continue;
    }

    try {
      const content = decoder.decode(buffer);
      files.push({
        relativePath,
        content,
        encoding: "utf-8",
        rawContent: buffer,
        mode,
      });
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
      files.push({
        relativePath,
        content: buffer.toString("base64"),
        encoding: "base64",
        rawContent: buffer,
        mode,
      });
    }
  }

  if (files.length === 0) {
    throw new Error(`Starter commit ${commit} contained no files`);
  }
  return files.sort((left, right) => compareUtf8PathBytes(left.relativePath, right.relativePath));
}

function computeContentHash(files: readonly CollectedTemplateFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.encoding);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(String(file.rawContent.length));
    hash.update("\0");
    hash.update(file.rawContent);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function compareUtf8PathBytes(left: string, right: string): number {
  // Compare bytes, not locale collation, so manifest ordering is identical
  // across Node runtimes and ICU builds.
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function printUsage(): void {
  console.log(`Usage: pnpm run template:export [-- --update]

Regenerates starterSeedManifest.generated.ts from the samebase/base commit that it pins.
--update pins the current main of samebase/base first.`);
}

/** The commit that a generated manifest pins. */
export function readPinnedCommit(manifestSource: string): string {
  const matches = [...manifestSource.matchAll(/^\s*"?sourceCommit"?: "([^"]*)",?$/gm)];
  if (matches.length !== 1) {
    throw new Error(`${manifestPath} must name exactly one sourceCommit`);
  }
  return assertCommitSha(matches[0][1], "sourceCommit");
}

function readSourceMainCommit(): string {
  const output = execFileSync(
    "git",
    ["ls-remote", "--exit-code", starterSourceRepository, "refs/heads/main"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return assertCommitSha(output.split("\t")[0] ?? "", "main of samebase/base");
}

/** Fetches only the pinned commit. GitHub serves a full sha of a public repository directly. */
function fetchSourceCommit(gitDirectory: string, commit: string): void {
  gitOutput(gitDirectory, ["init", "--quiet"]);
  try {
    gitOutput(gitDirectory, [
      "fetch",
      "--quiet",
      "--depth=1",
      "--no-tags",
      starterSourceRepository,
      commit,
    ]);
  } catch (error) {
    throw new Error(
      `Could not fetch samebase/base@${commit}. If that commit is gone, pin a new one with pnpm run template:export -- --update.`,
      { cause: error },
    );
  }
}

function buildManifest(files: readonly CollectedTemplateFile[], commit: string) {
  const contentHash = computeContentHash(files);
  const textFiles = Object.fromEntries(
    files
      .filter((file) => file.encoding === "utf-8")
      .map((file): [string, string] => [file.relativePath, file.content]),
  );
  const binaryFiles = Object.fromEntries(
    files
      .filter((file) => file.encoding === "base64")
      .map((file): [string, string] => [file.relativePath, file.content]),
  );
  const fileModes = Object.fromEntries(
    files
      .filter(isExecutableCollectedFile)
      .map((file): [string, "100755"] => [file.relativePath, file.mode]),
  );
  return {
    version: `samebase-base-${contentHash.slice(0, 12)}`,
    sourceRepository: starterSourceRepository,
    sourceCommit: commit,
    contentHash,
    commitMessage: "Initialize app from Samebase starter build v2210",
    files: textFiles,
    binaryFiles,
    fileModes,
  };
}

export function renderStarterSeedManifest(gitDirectory: string, commit: string) {
  const manifest = buildManifest(collectTemplateFiles(gitDirectory, commit), commit);

  return {
    outputPath: manifestPath,
    manifest,
    source: `// @generated by scripts/export-starter-manifest.ts from ${starterSourceRepository}

import type { StarterTemplateManifest } from "./starterSeed";

export const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(manifest, null, 2)};
`,
  };
}

export async function writeStarterSeedManifest(
  repoRoot: string,
  options: { update: boolean },
): Promise<void> {
  const absolutePath = path.resolve(repoRoot, manifestPath);
  const commit = options.update
    ? readSourceMainCommit()
    : readPinnedCommit(await readFile(absolutePath, "utf8"));
  const gitDirectory = await mkdtemp(path.join(tmpdir(), "samebase-base-"));

  try {
    fetchSourceCommit(gitDirectory, commit);
    const { manifest, source } = renderStarterSeedManifest(gitDirectory, commit);
    await writeFile(absolutePath, source, "utf8");
    await formatGeneratedFile(absolutePath, repoRoot);
    const fileCount = Object.keys(manifest.files).length + Object.keys(manifest.binaryFiles).length;
    console.log(`wrote ${absolutePath} from samebase/base@${commit} (${fileCount} files)`);
  } finally {
    await rm(gitDirectory, { force: true, recursive: true });
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(async () => {
    const args = process.argv.slice(2).filter((arg) => arg !== "--");
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      printUsage();
      return;
    }
    if (args.length > 1 || (args.length === 1 && args[0] !== "--update")) {
      throw new Error(`Unknown template export arguments: ${args.join(" ")}`);
    }
    await writeStarterSeedManifest(resolveRepoRoot(), { update: args[0] === "--update" });
  });
}
