import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  resolveGitHubAppAccess: vi.fn(),
}));

vi.mock("./githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccess: githubMocks.resolveGitHubAppAccess,
  };
});

import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

function gitBlobSha(content: string): string {
  const buffer = Buffer.from(content, "utf-8");
  return createHash("sha1").update(`blob ${buffer.byteLength}\0`).update(buffer).digest("hex");
}

function notFoundError() {
  return Object.assign(new Error("Not Found"), { status: 404 });
}

/**
Serves `files` (branch -> path -> text) through the Octokit calls that commit
and pull make. A branch missing from `files` answers 404 like a deleted branch.
*/
function createFakeGitHub(files: Map<string, Map<string, string>>) {
  const readBranchFiles = (branch: string) => {
    const branchFiles = files.get(branch);
    if (!branchFiles) {
      throw notFoundError();
    }
    return branchFiles;
  };
  const readTree = (branch: string) => ({
    sha: `tree-${branch}`,
    truncated: false,
    tree: Array.from(readBranchFiles(branch), ([path, content]) => ({
      path,
      mode: "100644",
      type: "blob",
      sha: gitBlobSha(content),
    })),
  });

  return {
    rest: {
      git: {
        getTree: vi.fn(async (args: { tree_sha: string }) => ({
          data: readTree(
            args.tree_sha === "head-tree" ? "main" : args.tree_sha.replace(/^(heads\/|tree-)/, ""),
          ),
        })),
        getBlob: vi.fn(async (args: { file_sha: string }) => {
          const content = Array.from(files.values())
            .flatMap((branchFiles) => Array.from(branchFiles.values()))
            .find((candidate) => gitBlobSha(candidate) === args.file_sha);
          if (content === undefined) {
            throw notFoundError();
          }
          return { data: { content: Buffer.from(content, "utf-8").toString("base64") } };
        }),
        getRef: vi.fn(async () => ({ data: { object: { sha: "head-commit" } } })),
        getCommit: vi.fn(async () => ({
          data: { tree: { sha: "head-tree" }, html_url: "https://github.com/commit" },
        })),
        createTree: vi.fn(async () => ({ data: { sha: "new-tree" } })),
        createCommit: vi.fn(async () => ({
          data: { sha: "new-commit", html_url: "https://github.com/commit" },
        })),
        updateRef: vi.fn(async () => ({ data: {} })),
      },
      repos: {
        get: vi.fn(async () => ({ data: {} })),
        getBranch: vi.fn(async (args: { branch: string }) => {
          readBranchFiles(args.branch);
          return {
            data: {
              commit: {
                sha: `commit-${args.branch}`,
                commit: { tree: { sha: `tree-${args.branch}` } },
              },
            },
          };
        }),
      },
    },
  };
}

async function seedConnectedRepository(t: ConvexTest) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      // File writes are staff access.
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId,
      githubOwnerId: "staging-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "staging",
      githubInstallationId: "installation-staging",
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, {
      convexTeam: { teamId: "convex-team-staging" },
      cloudflareAccount: { accountId: "cloudflare-account-staging", accountName: "staging" },
    });
  });
  const { repositoryId, runId } = await t.mutation(
    internal.repository.records.createInitializingExistingRepositoryForUser,
    {
      organizationId,
      userId,
      githubRepositoryDatabaseId: "9001",
      githubOwnerLogin: "staging",
      githubRepositoryName: "notes",
    },
  );
  await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
    repositoryId,
    runId,
    userId,
    githubRepositoryDatabaseId: "9001",
    githubOwnerLogin: "staging",
    githubRepositoryName: "notes",
    defaultBranch: "main",
    visibility: "private",
  });
  return { organizationId, repositoryId, userId };
}

async function insertStagedFile(
  t: ConvexTest,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    branch: string;
    filePath: string;
    initialContent: string;
    content: string;
  },
) {
  const file = await t.mutation(components.gitWorkspace.staging.saveToStaging, {
    repositoryId: args.repositoryId,
    branch: args.branch,
    initialFilePath: args.filePath,
    content: args.content,
    initialContent: args.initialContent,
    parentCommitSha: gitBlobSha(args.initialContent),
    userId: args.userId,
  });
  return file._id;
}

async function readStagedFiles(t: ConvexTest, repositoryId: Id<"repositories">) {
  const rows = await t.query(components.gitWorkspace.staging.listAllStagedFiles, {
    repositoryId,
    includeUnchanged: true,
  });
  return rows
    .map((row) => ({
      branch: row.branch,
      filePath: row.filePath,
      initialFilePath: row.initialFilePath,
      content: row.content,
      initialContent: row.initialContent,
      parentCommitSha: row.parentCommitSha,
    }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

async function readCollaborativeUpdatePaths(
  t: ConvexTest,
  repositoryId: Id<"repositories">,
  paths: [string, string][],
) {
  const updates = await Promise.all(
    paths.map(async ([branch, filePath]) => {
      const result = await t.query(components.gitWorkspace.collaborative.pullUpdates, {
        repositoryId,
        branch,
        filePath,
        version: 0,
      });
      return result.map(() => branch + ":" + filePath);
    }),
  );
  return updates.flat().sort();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("saveToStaging", () => {
  it("preserves a concurrent edit when a delayed open finishes", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    const baseContent = "base\n";
    const editedContent = "base\nconcurrent edit\n";

    // Both open actions can read no staging before either GitHub fetch returns.
    expect(
      await t.query(internal.fileStaging.getByOriginalPath, {
        repositoryId,
        originalFilePath: "notes.md",
        branch: "main",
      }),
    ).toBeNull();

    await t.mutation(internal.fileStaging.saveToStaging, {
      repositoryId,
      initialFilePath: "notes.md",
      content: baseContent,
      initialContent: baseContent,
      parentCommitSha: gitBlobSha(baseContent),
      branch: "main",
      userId,
    });
    await t.mutation(internal.collaborative.pushContentUpdate, {
      repositoryId,
      filePath: "notes.md",
      branch: "main",
      expectedVersion: 0,
      newContent: editedContent,
      userId,
    });
    expect(
      await t.query(internal.fileStaging.getByOriginalPath, {
        repositoryId,
        originalFilePath: "notes.md",
        branch: "main",
      }),
    ).toMatchObject({ content: editedContent, version: 1 });

    // The slower open now returns its older GitHub content.
    const delayedResult = await t.mutation(internal.fileStaging.saveToStaging, {
      repositoryId,
      initialFilePath: "notes.md",
      content: baseContent,
      initialContent: baseContent,
      parentCommitSha: gitBlobSha(baseContent),
      branch: "main",
      userId,
    });
    const updates = await t.query(components.gitWorkspace.collaborative.pullUpdates, {
      repositoryId,
      branch: "main",
      filePath: "notes.md",
      version: 0,
    });

    expect({
      content: delayedResult.content,
      version: delayedResult.version,
      updateVersions: updates.map((update) => update.version),
    }).toEqual({ content: editedContent, version: 1, updateVersions: [1] });
  });
});

describe("commitAllStaged", () => {
  it("clears only the staged rows it committed and keeps edits made during the commit", async () => {
    const t = makeConvexTest();
    const { organizationId, repositoryId, userId } = await seedConnectedRepository(t);
    const github = createFakeGitHub(
      new Map([
        [
          "main",
          new Map([
            ["notes.md", "a\n"],
            ["plain.md", "p\n"],
            ["undo.md", "u\n"],
          ]),
        ],
      ]),
    );
    githubMocks.resolveGitHubAppAccess.mockResolvedValue({
      organizationId,
      githubInstallationId: "installation-staging",
      githubOwnerId: "staging-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "staging",
      octokit: github,
    });
    for (const [filePath, initialContent, content] of [
      ["notes.md", "a\n", "a\nb\n"],
      ["plain.md", "p\n", "p\nq\n"],
      ["undo.md", "u\n", "u\nv\n"],
    ]) {
      await insertStagedFile(t, {
        repositoryId,
        userId,
        branch: "main",
        filePath,
        initialContent,
        content,
      });
    }
    github.rest.git.createCommit.mockImplementationOnce(async () => {
      for (const [filePath, expectedVersion, newContent] of [
        ["notes.md", 0, "a\nb\nc\n"],
        ["undo.md", 0, "u\nv\nw\n"],
        ["undo.md", 1, "u\nv\n"],
      ] as const) {
        await t.mutation(internal.collaborative.pushContentUpdate, {
          repositoryId,
          filePath,
          branch: "main",
          expectedVersion,
          newContent,
          userId,
        });
      }
      return { data: { sha: "new-commit", html_url: "https://github.com/commit" } };
    });

    await t.action(internal.fileStagingActions.commitAllStaged, {
      userId,
      repositoryId,
      branch: "main",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(github.rest.git.updateRef).toHaveBeenCalledOnce();
    expect(
      await t.query(internal.gitOperations.getBlobBySha, { sha: gitBlobSha("a\nb\n") }),
    ).toMatchObject({ text: "a\nb\n" });
    expect(await readStagedFiles(t, repositoryId)).toEqual([
      {
        branch: "main",
        filePath: "notes.md",
        initialFilePath: "notes.md",
        content: "a\nb\nc\n",
        initialContent: "a\nb\n",
        parentCommitSha: gitBlobSha("a\nb\n"),
      },
    ]);
    expect(
      await readCollaborativeUpdatePaths(t, repositoryId, [
        ["main", "notes.md"],
        ["main", "plain.md"],
        ["main", "undo.md"],
      ]),
    ).toEqual(["main:notes.md"]);
  });
});

describe("pullFromGitHubInternal", () => {
  it("keeps edits staged on a branch deleted on GitHub and pulls the other branches", async () => {
    const t = makeConvexTest();
    const { organizationId, repositoryId, userId } = await seedConnectedRepository(t);
    const github = createFakeGitHub(
      new Map([
        [
          "main",
          new Map([
            ["kept.md", "k\n"],
            ["stale.md", "s\n"],
          ]),
        ],
      ]),
    );
    githubMocks.resolveGitHubAppAccess.mockResolvedValue({
      organizationId,
      githubInstallationId: "installation-staging",
      githubOwnerId: "staging-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "staging",
      octokit: github,
    });
    for (const [branch, filePath, initialContent, content] of [
      ["main", "kept.md", "k\n", "k\nl\n"],
      ["main", "stale.md", "old\n", "old\n"],
      ["merged", "draft.md", "d\n", "d\ne\n"],
      ["merged", "open.md", "o\n", "o\n"],
    ]) {
      await insertStagedFile(t, {
        repositoryId,
        userId,
        branch,
        filePath,
        initialContent,
        content,
      });
    }

    await t.action(internal.fileStagingActions.pullFromGitHubInternal, { userId, repositoryId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(
      (await readStagedFiles(t, repositoryId)).map((row) => `${row.branch}:${row.filePath}`),
    ).toEqual(["merged:draft.md", "main:kept.md"]);
  });

  it("keeps the base of a staged delete whose file changed upstream", async () => {
    const t = makeConvexTest();
    const { organizationId, repositoryId, userId } = await seedConnectedRepository(t);
    githubMocks.resolveGitHubAppAccess.mockResolvedValue({
      organizationId,
      githubInstallationId: "installation-staging",
      githubOwnerId: "staging-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "staging",
      octokit: createFakeGitHub(new Map([["main", new Map([["gone.md", "upstream edit\n"]])]])),
    });
    const stagingId = await insertStagedFile(t, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "gone.md",
      initialContent: "old\n",
      content: "old\n",
    });
    await t.mutation(components.gitWorkspace.staging.markFileForDeletion, {
      repositoryId,
      branch: "main",
      filePath: "gone.md",
      userId,
      parentCommitSha: gitBlobSha("old\n"),
      seed: { initialContent: "old\n", kind: "text" },
    });

    await t.action(internal.fileStagingActions.pullFromGitHubInternal, { userId, repositoryId });
    // A pull that read the row before the delete still sends the upstream base.
    await t.mutation(internal.fileStaging.reconcileStagingWithTree, {
      repositoryId,
      userId,
      instructions: [
        {
          action: "update",
          stagingId,
          branch: "main",
          parentCommitSha: gitBlobSha("upstream edit\n"),
          initialContent: "upstream edit\n",
        },
      ],
    });

    expect(
      await t.run(async (ctx) => {
        const row = await ctx.runQuery(components.gitWorkspace.staging.getById, {
          repositoryId,
          branch: "main",
          stagingId,
        });
        return row && [row.fileDeleted, row.initialContent, row.parentCommitSha];
      }),
    ).toEqual([true, "old\n", gitBlobSha("old\n")]);
  });
});

describe("reconcileStagingWithTree", () => {
  it("keeps rows edited after the pull read them and clears only deleted rows' updates", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    const editedId = await insertStagedFile(t, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "edited.md",
      initialContent: "e\n",
      content: "e\n",
    });
    const unchangedId = await insertStagedFile(t, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "unchanged.md",
      initialContent: "u\n",
      content: "u\n",
    });
    await insertStagedFile(t, {
      repositoryId,
      userId,
      branch: "feature",
      filePath: "other.md",
      initialContent: "o\n",
      content: "o\n",
    });
    for (const [branch, filePath, expectedVersion, newContent] of [
      ["main", "unchanged.md", 0, "u\nv\n"],
      ["main", "unchanged.md", 1, "u\n"],
      ["feature", "other.md", 0, "o\np\n"],
      ["main", "edited.md", 0, "e\nf\n"],
    ] as const) {
      await t.mutation(internal.collaborative.pushContentUpdate, {
        repositoryId,
        filePath,
        branch,
        expectedVersion,
        newContent,
        userId,
      });
    }

    await t.mutation(internal.fileStaging.reconcileStagingWithTree, {
      repositoryId,
      userId,
      instructions: [
        { action: "delete", stagingId: editedId, branch: "main" },
        { action: "delete", stagingId: unchangedId, branch: "main" },
      ],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(
      (await readStagedFiles(t, repositoryId)).map((row) => `${row.branch}:${row.filePath}`),
    ).toEqual(["main:edited.md", "feature:other.md"]);
    expect(
      await readCollaborativeUpdatePaths(t, repositoryId, [
        ["main", "edited.md"],
        ["main", "unchanged.md"],
        ["feature", "other.md"],
      ]),
    ).toEqual(["feature:other.md", "main:edited.md"]);
  });
});

describe("deletePendingUploadBlob", () => {
  it("deletes only blobs that no repository references", async () => {
    const t = makeConvexTest();
    const { organizationId, repositoryId, userId } = await seedConnectedRepository(t);
    const { repositoryId: otherRepositoryId } = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "9002",
        githubOwnerLogin: "staging",
        githubRepositoryName: "other",
      },
    );
    const [pendingStorageId, otherStorageId] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.storage.store(new Blob(["pending"])),
        ctx.storage.store(new Blob(["other"])),
      ]);
    });
    await t.mutation(components.gitWorkspace.staging.saveBinaryUploadToStaging, {
      repositoryId: otherRepositoryId,
      branch: "main",
      filePath: "image.png",
      storageId: otherStorageId,
      mime: "image/png",
      size: 5,
      stagedBlobSha: "other-blob-sha",
      parentCommitSha: null,
      userId,
      replaceExisting: false,
    });
    const asUser = t.withIdentity({
      subject: userId,
      tokenIdentifier: `test:${userId}`,
    });

    await asUser.mutation(api.fileStaging.deletePendingUploadBlob, {
      repositoryId,
      storageId: pendingStorageId,
    });
    await expect(
      asUser.mutation(api.fileStaging.deletePendingUploadBlob, {
        repositoryId,
        storageId: otherStorageId,
      }),
    ).rejects.toThrow("Cannot delete a blob that is already attached to staging.");

    expect(
      await t.run(async (ctx) => ({
        pending: (await ctx.db.system.get(pendingStorageId)) !== null,
        other: (await ctx.db.system.get(otherStorageId)) !== null,
      })),
    ).toEqual({ pending: false, other: true });
  });
});

describe("component scope", () => {
  it.each(["repository", "branch"] as const)(
    "rejects a document ID from another %s",
    async (scope) => {
      const t = makeConvexTest();
      const { repositoryId, userId } = await seedConnectedRepository(t);
      const file = await t.mutation(components.gitWorkspace.staging.saveToStaging, {
        repositoryId: scope === "repository" ? "another-repository" : repositoryId,
        branch: scope === "branch" ? "feature" : "main",
        initialFilePath: "notes.md",
        content: "original",
        initialContent: "original",
        parentCommitSha: "original-sha",
        userId,
      });
      const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
      await expect(
        asUser.mutation(api.fileStaging.updateStagedFileContent, {
          repositoryId,
          branch: "main",
          stagingId: file._id,
          expectedVersion: 0,
          content: "wrong edit",
        }),
      ).rejects.toThrow("Staged file belongs to a different repository or branch.");
      expect(
        await t.query(components.gitWorkspace.staging.getById, {
          repositoryId: file.repositoryId,
          branch: file.branch,
          stagingId: file._id,
        }),
      ).toMatchObject({ content: "original", version: 0 });
    },
  );
});

describe("clearMatchingStagingSnapshot", () => {
  it("keeps later edits while removing the captured snapshot and its update stream", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    for (const filePath of ["remove.md", "keep.md"]) {
      await insertStagedFile(t, {
        repositoryId,
        userId,
        branch: "main",
        filePath,
        initialContent: "base",
        content: "base",
      });
      await t.mutation(internal.collaborative.pushContentUpdate, {
        repositoryId,
        userId,
        branch: "main",
        filePath,
        expectedVersion: 0,
        newContent: "first edit",
      });
    }
    await t.mutation(components.gitWorkspace.staging.rename, {
      repositoryId,
      userId,
      branch: "main",
      initialFilePath: "remove.md",
      newPath: "renamed.md",
      existsInRepository: false,
    });
    await t.mutation(internal.collaborative.pushContentUpdate, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "renamed.md",
      expectedVersion: 1,
      newContent: "renamed edit",
    });
    const files = await t.query(internal.fileStaging.listAllStagedFiles, {
      repositoryId,
      branch: "main",
      includeUnchanged: true,
    });
    const snapshots = files.map(({ _creationTime: _ignored, ...snapshot }) => snapshot);
    await t.mutation(internal.collaborative.pushContentUpdate, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "keep.md",
      expectedVersion: 1,
      newContent: "later edit",
    });
    await t.mutation(internal.fileStaging.clearMatchingStagingSnapshot, {
      repositoryId,
      branch: "main",
      stagedFiles: snapshots,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await readStagedFiles(t, repositoryId)).toMatchObject([
      { filePath: "keep.md", content: "later edit" },
    ]);
    expect(
      await readCollaborativeUpdatePaths(t, repositoryId, [
        ["main", "remove.md"],
        ["main", "renamed.md"],
        ["main", "keep.md"],
      ]),
    ).toEqual(["main:keep.md", "main:keep.md"]);
  });
});

describe("released binary storage", () => {
  it("retains shared bytes until staging and blob caches in all repositories release them", async () => {
    const t = makeConvexTest();
    const { repositoryId, organizationId, userId } = await seedConnectedRepository(t);
    const { repositoryId: otherRepositoryId } = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "9002",
        githubOwnerLogin: "staging",
        githubRepositoryName: "other",
      },
    );
    const storageId = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(["shared image"])),
    );
    const cachedBlobId = await t.mutation(internal.gitOperations.saveFileBlob, {
      repositoryId: otherRepositoryId,
      storageId,
      sha: "shared-sha",
      size: 12,
      mime: "image/png",
      ext: "png",
    });
    for (const targetRepositoryId of [repositoryId, otherRepositoryId]) {
      await t.mutation(components.gitWorkspace.staging.saveBinaryUploadToStaging, {
        repositoryId: targetRepositoryId,
        branch: "main",
        filePath: "image.png",
        storageId,
        mime: "image/png",
        size: 12,
        stagedBlobSha: "shared-sha",
        parentCommitSha: null,
        userId,
        replaceExisting: false,
      });
    }
    const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
    await asUser.mutation(api.fileStaging.clearAllStaging, {
      repositoryId,
      branch: "main",
      skipTreeUpdate: true,
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(true);
    await asUser.mutation(api.fileStaging.clearAllStaging, {
      repositoryId: otherRepositoryId,
      branch: "main",
      skipTreeUpdate: true,
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(true);
    await t.mutation(components.gitWorkspace.staging.saveBinaryUploadToStaging, {
      repositoryId,
      branch: "main",
      filePath: "image.png",
      storageId,
      mime: "image/png",
      size: 12,
      stagedBlobSha: "shared-sha",
      parentCommitSha: null,
      userId,
      replaceExisting: false,
    });
    await t.run(async (ctx) => await ctx.db.delete(cachedBlobId));
    await asUser.mutation(api.fileStaging.clearAllStaging, {
      repositoryId,
      branch: "main",
      skipTreeUpdate: true,
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
