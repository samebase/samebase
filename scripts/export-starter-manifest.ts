import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";
import { baseTemplateSourceRoot } from "./publish-repository-exports.ts";

const publishedRepo = "https://github.com/samebase/base.git";
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// rawContent and mode are the source of truth for hashing; content is only the
// deterministic UTF-8/base64 manifest representation derived from those bytes.
export type CollectedTemplateFile = {
  relativePath: string;
  content: string;
  encoding: "utf-8" | "base64";
  rawContent: Buffer;
  mode: "100644" | "100755";
};

type TrackedTemplateFile = {
  objectId: string;
  mode: string;
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

function gitOutput(repoRoot: string, args: readonly string[]): Buffer {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseNullSeparatedPaths(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0);
}

function readTrackedFiles(repoRoot: string): Map<string, TrackedTemplateFile> {
  const entries = parseNullSeparatedPaths(
    gitOutput(repoRoot, ["ls-files", "--stage", "-z", "--", baseTemplateSourceRoot]),
  );
  const trackedFiles = new Map<string, TrackedTemplateFile>();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("\t");
    const metadata = entry.slice(0, separatorIndex);
    const repoPath = entry.slice(separatorIndex + 1);
    const match = /^(\d{6}) ([0-9a-f]+) (\d)$/.exec(metadata);
    if (separatorIndex === -1 || match === null || match[3] !== "0" || repoPath.length === 0) {
      throw new Error(`Unsupported Git index entry for the starter template: ${entry}`);
    }
    if (trackedFiles.has(repoPath)) {
      throw new Error(`Duplicate Git index entry for the starter template: ${repoPath}`);
    }
    trackedFiles.set(repoPath, {
      mode: match[1],
      objectId: match[2],
    });
  }

  return trackedFiles;
}

function assertTemplateIndexIsComplete(repoRoot: string): void {
  const diffResult = spawnSync("git", ["diff", "--quiet", "--", baseTemplateSourceRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (diffResult.error) {
    throw diffResult.error;
  }
  if (diffResult.status === 1) {
    throw new Error(`Stage tracked changes under ${baseTemplateSourceRoot} before export`);
  }
  if (diffResult.status !== 0) {
    const detail = diffResult.stderr.trim() || diffResult.stdout.trim();
    throw new Error(`git diff failed${detail ? `: ${detail}` : "."}`);
  }

  const untrackedPaths = parseNullSeparatedPaths(
    gitOutput(repoRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      baseTemplateSourceRoot,
    ]),
  );
  if (untrackedPaths.length > 0) {
    throw new Error(
      `Stage new files under ${baseTemplateSourceRoot} before export: ${untrackedPaths.join(", ")}`,
    );
  }
}

function templateRelativePath(repoPath: string): string {
  const prefix = `${baseTemplateSourceRoot}/`;
  if (!repoPath.startsWith(prefix) || repoPath.length === prefix.length) {
    throw new Error(`Git returned a path outside the starter template: ${repoPath}`);
  }
  return repoPath.slice(prefix.length);
}

export async function collectTemplateFiles(repoRoot: string): Promise<CollectedTemplateFile[]> {
  assertTemplateIndexIsComplete(repoRoot);
  const trackedFiles = readTrackedFiles(repoRoot);
  const repoPaths = [...trackedFiles.keys()].sort(compareUtf8PathBytes);
  const files: CollectedTemplateFile[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const repoPath of repoPaths) {
    const relativePath = templateRelativePath(repoPath);
    const absolutePath = path.resolve(repoRoot, ...repoPath.split("/"));
    const fileStats = await lstat(absolutePath);

    if (!fileStats.isFile()) {
      throw new Error(`Unsupported starter template entry: ${relativePath}`);
    }

    const trackedFile = trackedFiles.get(repoPath);
    if (trackedFile === undefined) {
      throw new Error(`Missing Git index entry for the starter template: ${relativePath}`);
    }
    let mode: CollectedTemplateFile["mode"];
    if (trackedFile.mode === "100644" || trackedFile.mode === "100755") {
      mode = trackedFile.mode;
    } else {
      throw new Error(`Unsupported starter template mode ${trackedFile.mode}: ${relativePath}`);
    }
    const buffer = gitOutput(repoRoot, ["cat-file", "blob", trackedFile.objectId]);

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

  return files;
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
  console.log(`Usage: pnpm run template:export

Exports templates/base into starterSeedManifest.generated.ts.`);
}

export async function writeStarterSeedManifest(repoRoot: string): Promise<void> {
  const outputPath = path.resolve(
    repoRoot,
    trackedFilePath("apps/samebase/convex/starterSeedManifest.generated.ts"),
  );
  const files = await collectTemplateFiles(repoRoot);
  if (files.length === 0) {
    throw new Error(`${baseTemplateSourceRoot} contained no files`);
  }

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
  const manifest = {
    version: `samebase-base-${contentHash.slice(0, 12)}`,
    sourcePath: baseTemplateSourceRoot,
    publishedRepo,
    contentHash,
    commitMessage: "Initialize app from Samebase starter build v2060",
    files: textFiles,
    binaryFiles,
    fileModes,
  };

  const generated = `// @generated by scripts/export-starter-manifest.ts

export type StarterTemplateManifest = {
  version: string;
  sourcePath: string;
  publishedRepo: string;
  contentHash: string;
  commitMessage: string;
  files: Record<string, string>;
  binaryFiles: Record<string, string>;
  fileModes: Record<string, "100644" | "100755">;
};

export const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(manifest, null, 2)};
`;

  await writeFile(outputPath, generated, "utf8");
  await formatGeneratedFile(outputPath, repoRoot);
  console.log(`wrote ${outputPath} from ${baseTemplateSourceRoot} (${files.length} files)`);
}

if (isMainModule(import.meta.url)) {
  await runMain(async () => {
    const args = process.argv.slice(2);
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      printUsage();
      return;
    }
    if (args.length > 0) {
      throw new Error(`Unknown template export arguments: ${args.join(" ")}`);
    }
    await writeStarterSeedManifest(resolveRepoRoot());
  });
}
