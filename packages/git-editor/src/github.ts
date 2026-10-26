import { createHash } from "node:crypto";
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { diffLines } from "diff";
import type { StagedFile } from "./model";
import {
  hasStagedFileChanges,
  hasStagedFileContentChange,
  readStagedFileKind,
} from "./stagingChanges";
import { rebaseStagedContent } from "./stagingRebase";

type CreateTreeEntry = NonNullable<
  RestEndpointMethodTypes["git"]["createTree"]["parameters"]["tree"]
>[number];
export type StagedFileForCommit = Pick<
  StagedFile,
  | "kind"
  | "filePath"
  | "initialFilePath"
  | "content"
  | "initialContent"
  | "fileDeleted"
  | "storageId"
  | "mime"
  | "size"
  | "stagedBlobSha"
  | "parentCommitSha"
> &
  Partial<Pick<StagedFile, "branch">>;

export type StagedFileRebaseConflict = StagedFileForCommit & {
  upstreamContent?: string;
  upstreamSha: string;
  upstreamPath?: string;
};

export function getGitHubErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }
  return typeof error.status === "number" ? error.status : null;
}

export function toGitTreeRef(branch: string): string {
  if (/^[0-9a-f]{40}$/i.test(branch)) {
    return branch;
  }

  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }

  if (branch.startsWith("heads/")) {
    return branch;
  }

  return `heads/${branch}`;
}

export async function getTreeMapForRef(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
}): Promise<Map<string, string>> {
  const treeResponse = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
    tree_sha: args.ref,
    recursive: "1",
  });

  if (treeResponse.data.truncated) {
    throw new Error("Upstream tree is too large to validate staged changes safely.");
  }

  const shaByPath = new Map<string, string>();
  for (const item of treeResponse.data.tree) {
    if (item.type === "blob" && typeof item.path === "string" && typeof item.sha === "string") {
      shaByPath.set(item.path, item.sha);
    }
  }

  return shaByPath;
}

export async function getBranchTreeMap(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<Map<string, string>> {
  return getTreeMapForRef({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    ref: toGitTreeRef(args.branch),
  });
}

export function isBinaryStagedFile(file: Pick<StagedFileForCommit, "kind">): boolean {
  return readStagedFileKind(file.kind) === "binary";
}

export function computeGitBlobShaFromBuffer(buffer: Uint8Array): string {
  const headerBuffer = Buffer.from(`blob ${buffer.byteLength}\0`, "utf-8");
  return createHash("sha1").update(headerBuffer).update(buffer).digest("hex");
}

export function computeGitBlobShaFromText(content: string): string {
  return computeGitBlobShaFromBuffer(Buffer.from(content, "utf-8"));
}
function formatUpstreamConflictError(paths: string[]): string {
  const uniquePaths = Array.from(new Set(paths)).sort();
  return `Commit conflicts with upstream changes. Resolve and retry: ${uniquePaths.join(", ")}`;
}

export async function inspectStagedFilesAgainstLatestHead<File extends StagedFileForCommit>(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  stagedFiles: File[];
}): Promise<{
  rebasedFiles: File[];
  conflicts: StagedFileRebaseConflict[];
}> {
  if (args.stagedFiles.length === 0) {
    return { rebasedFiles: [], conflicts: [] };
  }

  const shaByPath = await getBranchTreeMap({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    branch: args.branch,
  });
  return inspectStagedFilesAgainstTree({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    stagedFiles: args.stagedFiles,
    shaByPath,
  });
}

async function inspectStagedFilesAgainstTree<File extends StagedFileForCommit>(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: File[];
  shaByPath: Map<string, string>;
}): Promise<{
  rebasedFiles: File[];
  conflicts: StagedFileRebaseConflict[];
}> {
  const { shaByPath } = args;
  const initialContentMatchesUpstreamCache = new Map<
    StagedFileForCommit,
    { upstreamSha: string; matches: boolean }
  >();
  const initialContentMatchesUpstream = (
    file: StagedFileForCommit,
    upstreamSha: string,
  ): boolean => {
    if (isBinaryStagedFile(file)) {
      return upstreamSha === file.parentCommitSha;
    }
    const cached = initialContentMatchesUpstreamCache.get(file);
    if (cached && cached.upstreamSha === upstreamSha) {
      return cached.matches;
    }
    const matches = computeGitBlobShaFromText(file.initialContent) === upstreamSha;
    initialContentMatchesUpstreamCache.set(file, {
      upstreamSha,
      matches,
    });
    return matches;
  };
  const shouldSkipFastPathRebase = (file: StagedFileForCommit, upstreamSha: string): boolean =>
    upstreamSha === file.parentCommitSha && initialContentMatchesUpstream(file, upstreamSha);

  const blobTextBySha = new Map<string, Promise<string>>();
  const getBlobText = (sha: string): Promise<string> => {
    const existing = blobTextBySha.get(sha);
    if (existing) {
      return existing;
    }

    const loaded = args.octokit.rest.git
      .getBlob({
        owner: args.owner,
        repo: args.repo,
        file_sha: sha,
      })
      .then((response) => {
        const base64 = response.data.content.replace(/\n/g, "");
        return Buffer.from(base64, "base64").toString("utf-8");
      })
      .catch((error) => {
        blobTextBySha.delete(sha);
        throw error;
      });

    blobTextBySha.set(sha, loaded);
    return loaded;
  };

  const resolveUpstreamLocationForFile = (
    file: StagedFileForCommit,
  ): { path: string; sha: string } | null => {
    const preferredUpstreamPath =
      file.filePath === file.initialFilePath ? file.filePath : file.initialFilePath;
    const fallbackUpstreamPath = file.filePath;
    const upstreamPath = shaByPath.has(preferredUpstreamPath)
      ? preferredUpstreamPath
      : shaByPath.has(fallbackUpstreamPath)
        ? fallbackUpstreamPath
        : null;
    if (!upstreamPath) {
      return null;
    }
    const upstreamSha = shaByPath.get(upstreamPath);
    if (!upstreamSha) {
      return null;
    }
    return {
      path: upstreamPath,
      sha: upstreamSha,
    };
  };

  const upstreamShasToPrefetch = new Set<string>();
  for (const file of args.stagedFiles) {
    const upstreamLocation = resolveUpstreamLocationForFile(file);
    if (!upstreamLocation) {
      continue;
    }
    const upstreamSha = upstreamLocation.sha;
    if (isBinaryStagedFile(file)) {
      continue;
    }
    if (file.fileDeleted) {
      if (file.parentCommitSha !== null && !shouldSkipFastPathRebase(file, upstreamSha)) {
        upstreamShasToPrefetch.add(upstreamSha);
      }
      continue;
    }
    if (file.parentCommitSha === null) {
      upstreamShasToPrefetch.add(upstreamSha);
      continue;
    }
    if (shouldSkipFastPathRebase(file, upstreamSha)) {
      continue;
    }
    upstreamShasToPrefetch.add(upstreamSha);
  }

  await Promise.all(Array.from(upstreamShasToPrefetch).map((sha) => getBlobText(sha)));

  const conflicts: StagedFileRebaseConflict[] = [];
  const rebasedFiles: File[] = [];

  for (const file of args.stagedFiles) {
    const upstreamLocation = resolveUpstreamLocationForFile(file);
    const upstreamSha = upstreamLocation?.sha ?? null;
    if (isBinaryStagedFile(file)) {
      if (file.fileDeleted) {
        if (file.parentCommitSha === null || !upstreamSha || upstreamSha === file.parentCommitSha) {
          rebasedFiles.push(file);
          continue;
        }

        conflicts.push({
          ...file,
          upstreamPath: upstreamLocation?.path,
          upstreamSha,
        });
        rebasedFiles.push(file);
        continue;
      }

      if (file.parentCommitSha === null) {
        if (!upstreamSha) {
          rebasedFiles.push(file);
          continue;
        }

        if (file.stagedBlobSha === upstreamSha) {
          rebasedFiles.push({
            ...file,
            parentCommitSha: upstreamSha,
          });
          continue;
        }

        conflicts.push({
          ...file,
          upstreamPath: upstreamLocation?.path,
          upstreamSha,
        });
        rebasedFiles.push(file);
        continue;
      }

      if (!upstreamSha || upstreamSha === file.parentCommitSha) {
        rebasedFiles.push(file);
        continue;
      }

      if (file.stagedBlobSha === upstreamSha) {
        rebasedFiles.push({
          ...file,
          parentCommitSha: upstreamSha,
        });
        continue;
      }

      conflicts.push({
        ...file,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (file.fileDeleted) {
      if (
        file.parentCommitSha === null ||
        !upstreamSha ||
        shouldSkipFastPathRebase(file, upstreamSha)
      ) {
        rebasedFiles.push(file);
        continue;
      }

      const upstreamContent = await getBlobText(upstreamSha);
      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (file.parentCommitSha === null) {
      if (!upstreamSha) {
        rebasedFiles.push(file);
        continue;
      }

      const upstreamContent = await getBlobText(upstreamSha);
      if (upstreamContent === file.content) {
        rebasedFiles.push({
          ...file,
          initialFilePath: file.filePath,
          initialContent: upstreamContent,
          parentCommitSha: upstreamSha,
        });
        continue;
      }

      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (!upstreamSha || shouldSkipFastPathRebase(file, upstreamSha)) {
      rebasedFiles.push(file);
      continue;
    }

    const upstreamContent = await getBlobText(upstreamSha);
    const rebased = rebaseStagedContent({
      baseContent: file.initialContent,
      stagedContent: file.content,
      upstreamContent,
    });
    if (rebased.hasConflict) {
      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    rebasedFiles.push({
      ...file,
      content: rebased.content,
      initialContent: upstreamContent,
      parentCommitSha: upstreamSha,
    });
  }

  return {
    rebasedFiles,
    conflicts,
  };
}

export async function rebaseStagedFilesOnLatestHead<File extends StagedFileForCommit>(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  stagedFiles: File[];
}): Promise<File[]> {
  const inspection = await inspectStagedFilesAgainstLatestHead(args);
  if (inspection.conflicts.length > 0) {
    throw new Error(formatUpstreamConflictError(inspection.conflicts.map((file) => file.filePath)));
  }

  return inspection.rebasedFiles;
}

// Helper function to create a commit with multiple files
export async function createCommitWithMultipleFiles<File extends StagedFileForCommit>({
  octokit,
  owner,
  repo,
  stagedFiles,
  branch,
  loadStorageBlob,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: File[];
  branch: string;
  loadStorageBlob?: (storageId: string) => Promise<Blob | null>;
}) {
  // Helper to compute modified (added) line ranges in the new content
  const computeModifiedLineRanges = (
    oldContent: string,
    newContent: string,
  ): Array<{ from: number; to: number }> => {
    const parts = diffLines(oldContent, newContent);
    const ranges: Array<{ from: number; to: number }> = [];
    let newLine = 1;
    for (const part of parts) {
      const value = part.value;
      const lineCount =
        typeof part.count === "number" ? part.count : value === "" ? 0 : value.split("\n").length; // count lines even without trailing newline
      if (part.added) {
        if (lineCount > 0) {
          ranges.push({ from: newLine, to: newLine + lineCount - 1 });
        }
        newLine += lineCount;
      } else if (part.removed) {
        // Removed lines affect old content only; don't advance newLine
      } else {
        newLine += lineCount;
      }
    }
    return ranges;
  };

  const normalizedStagedFiles = stagedFiles.map((file) => ({
    ...file,
    initialContent: file.initialContent,
    branch,
  }));

  // 4. Retry loop for ref-dependent operations (getRef → getCommit → createTree → createCommit → updateRef)
  //    Retries handle transient GitHub 422 (GitRPC::BadObjectState) and 409 (conflict) errors.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = refData.object.sha;

      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });

      const currentTreeSha = currentCommit.tree.sha;
      const shaByPath = await getTreeMapForRef({
        octokit,
        owner,
        repo,
        ref: currentTreeSha,
      });
      const inspection = await inspectStagedFilesAgainstTree({
        octokit,
        owner,
        repo,
        stagedFiles: normalizedStagedFiles,
        shaByPath,
      });
      if (inspection.conflicts.length > 0) {
        throw new Error(
          formatUpstreamConflictError(inspection.conflicts.map((file) => file.filePath)),
        );
      }
      const resolvedStagedFiles = inspection.rebasedFiles;

      const changedResolvedStagedFiles = resolvedStagedFiles.filter(hasStagedFileChanges);

      // Summarize all changes to craft a commit message
      const changesInfo: Array<{
        deleted: boolean;
        isBinary: boolean;
        modifiedLines: Array<{ from: number; to: number }>;
        filePath: string;
        initialFilePath: string;
        wasModified: boolean;
      }> = changedResolvedStagedFiles.map((file) => ({
        deleted: file.fileDeleted,
        isBinary: isBinaryStagedFile(file),
        filePath: file.filePath,
        initialFilePath: file.initialFilePath,
        modifiedLines:
          file.fileDeleted || isBinaryStagedFile(file)
            ? []
            : computeModifiedLineRanges(file.initialContent, file.content),
        wasModified: !file.fileDeleted && hasStagedFileContentChange(file),
      }));

      // 1. Prepare file lists
      const pathsToDelete = new Set<string>();
      const filesToAdd: Array<
        | {
            kind: "text";
            filePath: string;
            content: string;
          }
        | {
            kind: "binary";
            filePath: string;
            parentCommitSha: string | null;
            storageId?: string;
            stagedBlobSha?: string;
          }
      > = [];

      for (const file of changedResolvedStagedFiles) {
        if (file.fileDeleted) {
          // Only delete paths that actually exist in the repo. A renamed row still
          // exists upstream at initialFilePath.
          if (file.parentCommitSha !== null) {
            pathsToDelete.add(file.initialFilePath);
          }
        } else {
          const isRenamed = file.filePath !== file.initialFilePath;
          if (isRenamed && file.parentCommitSha !== null) {
            pathsToDelete.add(file.initialFilePath);
          }
          if (isBinaryStagedFile(file)) {
            filesToAdd.push({
              kind: "binary",
              filePath: file.filePath,
              parentCommitSha: file.parentCommitSha,
              storageId: file.storageId,
              stagedBlobSha: file.stagedBlobSha,
            });
          } else {
            filesToAdd.push({
              kind: "text",
              filePath: file.filePath,
              content: file.content,
            });
          }
        }
      }

      // 2. Prepare tree deletions up front. File additions are rebuilt per retry so
      //    binary blob creation can stay deterministic across attempts.
      const baseTreeEntries: CreateTreeEntry[] = [];

      for (const path of pathsToDelete) {
        baseTreeEntries.push({
          path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }

      // 3. Build commit message
      const basename = (p: string) => {
        const parts = p.split("/");
        return parts[parts.length - 1] || p;
      };
      const shortRanges = (ranges: Array<{ from: number; to: number }>, max = 2) => {
        const items = ranges
          .slice(0, max)
          .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`));
        return ranges.length > max ? `${items.join(",")},…` : items.join(",");
      };
      const subjectTokens: string[] = [];
      for (const info of changesInfo) {
        const renamed = info.initialFilePath !== info.filePath;
        if (info.deleted) {
          subjectTokens.push(`D ${basename(info.initialFilePath)}`);
        } else if (info.isBinary && renamed) {
          subjectTokens.push(`${basename(info.initialFilePath)}->${basename(info.filePath)}`);
        } else if (info.isBinary) {
          subjectTokens.push(`${basename(info.filePath)}`);
        } else if (renamed && info.modifiedLines.length > 0) {
          subjectTokens.push(
            `${basename(info.initialFilePath)}->${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
          );
        } else if (renamed) {
          subjectTokens.push(`${basename(info.initialFilePath)}->${basename(info.filePath)}`);
        } else if (info.modifiedLines.length > 0) {
          subjectTokens.push(`${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`);
        } else if (info.wasModified) {
          subjectTokens.push(`${basename(info.filePath)}[]`);
        }
      }
      const maxTokens = 4;
      const commitMessage =
        subjectTokens.length === 0
          ? "Update files"
          : subjectTokens.length > maxTokens
            ? `${subjectTokens.slice(0, maxTokens).join(", ")} …`
            : subjectTokens.join(", ");

      if (baseTreeEntries.length === 0 && filesToAdd.length === 0) {
        return {
          sha: currentCommitSha,
          url: currentCommit.html_url,
          committedFiles: resolvedStagedFiles,
        };
      }

      const createdBlobShaBySourceSha = new Map<string, string>();
      const treeEntries: CreateTreeEntry[] = [...baseTreeEntries];

      for (const file of filesToAdd) {
        if (file.kind === "text") {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            content: file.content,
          });
          continue;
        }

        const existingBlobSha =
          file.parentCommitSha !== null && file.stagedBlobSha === file.parentCommitSha
            ? file.parentCommitSha
            : null;
        if (existingBlobSha) {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            sha: existingBlobSha,
          });
          continue;
        }

        if (!file.storageId) {
          throw new Error(`Binary file ${file.filePath} is missing staged storage data.`);
        }

        const cacheKey = file.stagedBlobSha ?? file.storageId;
        const cachedCreatedSha = createdBlobShaBySourceSha.get(cacheKey);
        if (cachedCreatedSha) {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            sha: cachedCreatedSha,
          });
          continue;
        }

        if (!loadStorageBlob) {
          throw new Error("Binary commit loading is not configured.");
        }

        const storedBlob = await loadStorageBlob(file.storageId);
        if (!storedBlob) {
          throw new Error(`Binary file ${file.filePath} is no longer available in staged storage.`);
        }

        const storedBuffer = Buffer.from(await storedBlob.arrayBuffer());
        const { data: createdBlob } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: storedBuffer.toString("base64"),
          encoding: "base64",
        });
        const expectedSha = file.stagedBlobSha ?? computeGitBlobShaFromBuffer(storedBuffer);
        if (createdBlob.sha !== expectedSha) {
          throw new Error(`Binary file ${file.filePath} blob SHA mismatch during commit.`);
        }

        createdBlobShaBySourceSha.set(cacheKey, createdBlob.sha);
        treeEntries.push({
          path: file.filePath,
          mode: "100644",
          type: "blob",
          sha: createdBlob.sha,
        });
      }

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree: treeEntries,
      });

      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [currentCommitSha],
      });

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: false,
      });

      return {
        sha: newCommit.sha,
        url: newCommit.html_url,
        committedFiles: resolvedStagedFiles,
      };
    } catch (error) {
      const status = getGitHubErrorStatus(error);
      const isRetryable = status === 422 || status === 409;
      if (!isRetryable || attempt === MAX_ATTEMPTS - 1) {
        console.error("Failed to create commit:", error);
        throw error;
      }
      console.warn(`Commit attempt ${attempt + 1} failed (status ${status}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  // Unreachable: the loop always returns or throws, but satisfies TypeScript.
  throw new Error("Exhausted commit retry attempts");
}
