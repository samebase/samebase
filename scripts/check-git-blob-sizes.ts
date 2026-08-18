import { spawnSync } from "node:child_process";

import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

const maximumGitBlobSizeInBytes = 50 * 1_024 * 1_024;

type IndexedFile = {
  objectId: string;
  path: string;
};

type GitObject = {
  sizeInBytes: number;
  type: string;
};

function runGit(repoRoot: string, arguments_: string[], input?: string): string {
  const result = spawnSync("git", arguments_, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });
  if (result.status !== 0) {
    fail(result.stderr.trim() || `git ${arguments_.join(" ")} failed`);
  }

  return result.stdout;
}

function readIndexedFiles(repoRoot: string): IndexedFile[] {
  const output = runGit(repoRoot, ["ls-files", "--stage", "-z"]);

  return output
    .split("\0")
    .filter((entry) => entry !== "")
    .map((entry) => {
      const pathSeparatorIndex = entry.indexOf("\t");
      if (pathSeparatorIndex === -1) {
        fail(`Git returned an invalid index entry: ${entry}`);
      }

      const metadata = entry.slice(0, pathSeparatorIndex).split(" ");
      const objectId = metadata[1];
      const path = entry.slice(pathSeparatorIndex + 1);
      if (!objectId || !path) {
        fail(`Git returned an incomplete index entry: ${entry}`);
      }

      return { objectId, path };
    });
}

function readGitObjects(repoRoot: string, objectIds: readonly string[]): Map<string, GitObject> {
  const uniqueObjectIds = [...new Set(objectIds)];
  const output = runGit(
    repoRoot,
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    `${uniqueObjectIds.join("\n")}\n`,
  );
  const objects = new Map<string, GitObject>();

  for (const line of output.trim().split("\n")) {
    const [objectId, type, sizeText] = line.split(" ");
    const sizeInBytes = Number(sizeText);
    if (!objectId || !type || !Number.isSafeInteger(sizeInBytes)) {
      fail(`Git returned invalid object metadata: ${line}`);
    }

    objects.set(objectId, { sizeInBytes, type });
  }

  return objects;
}

export function checkGitBlobSizes(repoRoot = resolveRepoRoot()): void {
  const indexedFiles = readIndexedFiles(repoRoot);
  const objects = readGitObjects(
    repoRoot,
    indexedFiles.map((file) => file.objectId),
  );
  const oversizedFiles = indexedFiles.flatMap((file) => {
    const object = objects.get(file.objectId);
    if (!object || object.type !== "blob" || object.sizeInBytes <= maximumGitBlobSizeInBytes) {
      return [];
    }

    return [`${file.path} (${(object.sizeInBytes / 1_024 / 1_024).toFixed(1)} MiB)`];
  });

  if (oversizedFiles.length > 0) {
    fail(
      `Normal Git files must not exceed 50 MiB. Track these files with Git LFS:\n${oversizedFiles.join("\n")}`,
    );
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(() => checkGitBlobSizes());
}
