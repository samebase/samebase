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
import type {
  ActionCtx as ComponentActionCtx,
  MutationCtx as ComponentMutationCtx,
} from "../../../packages/git-editor/src/component/_generated/server";
import { makeConvexTest } from "./test.setup";
import type { StagedFile } from "@samebase/git-editor/model";

type ConvexTest = ReturnType<typeof makeConvexTest>;

function runInGitEditor<Output>(
  t: ConvexTest,
  handler: (
    ctx: Pick<ComponentMutationCtx, "db"> & Pick<ComponentActionCtx, "storage">,
  ) => Promise<Output>,
): Promise<Output> {
  // @ts-expect-error convex-test 0.0.61 exposes runInComponent at runtime but omits it from its public type.
  return t.runInComponent("gitEditor", handler);
}

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
        getContent: vi.fn(async (args: { ref: string; path: string }) => {
          const content = readBranchFiles(args.ref).get(args.path);
          if (content === undefined) throw notFoundError();
          return {
            data: {
              type: "file",
              path: args.path,
              sha: gitBlobSha(content),
              size: Buffer.byteLength(content),
            },
          };
        }),
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
  const file = await t.mutation(components.gitEditor.staging.saveToStaging, {
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
  const rows = await t.query(components.gitEditor.staging.listAllStagedFiles, {
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
      const result = await t.query(components.gitEditor.collaborative.pullUpdates, {
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
      await t.query(components.gitEditor.staging.getByOriginalPath, {
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
      await t.query(components.gitEditor.staging.getByOriginalPath, {
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
    const updates = await t.query(components.gitEditor.collaborative.pullUpdates, {
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

describe("binary file opening", () => {
  it.each(["replacement", "deletion", "rename", "stale tree"] as const)(
    "keeps the current file state after a delayed open with %s",
    async (change) => {
      const t = makeConvexTest();
      const { organizationId, repositoryId, userId } = await seedConnectedRepository(t);
      const baseContent = "\0".repeat(12);
      const baseSha = gitBlobSha(baseContent);
      const replacementContent = "replacement image";
      const [baseStorageId, replacementStorageId] = await runInGitEditor(t, async (ctx) =>
        Promise.all([
          ctx.storage.store(new Blob([baseContent], { type: "image/png" })),
          ctx.storage.store(new Blob([replacementContent], { type: "image/png" })),
        ]),
      );
      await t.mutation(components.gitEditor.branches.upsert, {
        repositoryId,
        branch: "main",
        commitSHA: "cached-head",
        treeData: {
          sha: "cached-tree",
          truncated: false,
          tree: [{ path: "image.png", type: "blob", mode: "100644", sha: "stale-blob" }],
        },
      });
      await t.mutation(internal.gitOperations.saveFileBlob, {
        repositoryId,
        sha: baseSha,
        storageId: baseStorageId,
        size: baseContent.length,
        mime: "image/png",
        ext: "png",
      });
      const github = createFakeGitHub(new Map([["main", new Map([["image.png", baseContent]])]]));
      githubMocks.resolveGitHubAppAccess.mockResolvedValue({
        organizationId,
        githubOwnerLogin: "staging",
        octokit: github,
      });
      let expected: StagedFile | null = null;
      github.rest.repos.getContent.mockImplementationOnce(async () => {
        if (change !== "stale tree") {
          await t.mutation(internal.fileStaging.saveBinaryUploadToStaging, {
            repositoryId,
            branch: "main",
            filePath: "image.png",
            storageId: replacementStorageId,
            mime: "image/png",
            size: replacementContent.length,
            stagedBlobSha: gitBlobSha(replacementContent),
            replaceExisting: true,
            userId,
          });
          if (change === "deletion") {
            await t.mutation(components.gitEditor.staging.markFileForDeletion, {
              repositoryId,
              branch: "main",
              filePath: "image.png",
              parentCommitSha: "stale-blob",
              userId,
            });
          } else if (change === "rename") {
            await t.mutation(internal.fileStaging.rename, {
              repositoryId,
              branch: "main",
              initialFilePath: "image.png",
              newPath: "renamed.png",
              userId,
            });
          }
          expected = await t.query(components.gitEditor.staging.getByOriginalPath, {
            repositoryId,
            branch: "main",
            originalFilePath: "image.png",
          });
        }
        return {
          data: { type: "file", path: "image.png", sha: baseSha, size: baseContent.length },
        };
      });

      await t.action(internal.fileStagingActions.getFileForEditingInternal, {
        githubRepositoryFullName: "staging/notes",
        originalFilePath: "image.png",
        branch: "main",
        userId,
      });

      const current = await t.query(components.gitEditor.staging.getByOriginalPath, {
        repositoryId,
        branch: "main",
        originalFilePath: "image.png",
      });
      if (change === "stale tree") {
        expect(current).toMatchObject({ parentCommitSha: baseSha, stagedBlobSha: baseSha });
        expect(
          await t.query(components.gitEditor.staging.listAllStagedFiles, {
            repositoryId,
            branch: "main",
          }),
        ).toEqual([]);
      } else {
        expect(expected).not.toBeNull();
        expect(current).toEqual(expected);
        expect(
          await runInGitEditor(
            t,
            async (ctx) => (await ctx.storage.get(replacementStorageId))?.text() ?? null,
          ),
        ).toBe(replacementContent);
      }
      expect(
        await runInGitEditor(
          t,
          async (ctx) => (await ctx.storage.get(baseStorageId))?.text() ?? null,
        ),
      ).toBe(baseContent);
    },
  );
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
      await t.query(components.gitEditor.blobs.getBySha, { sha: gitBlobSha("a\nb\n") }),
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
    await t.mutation(components.gitEditor.staging.markFileForDeletion, {
      repositoryId,
      branch: "main",
      filePath: "gone.md",
      userId,
      parentCommitSha: gitBlobSha("old\n"),
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
        const row = await ctx.runQuery(components.gitEditor.staging.getByNewPath, {
          repositoryId,
          branch: "main",
          newPath: "gone.md",
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
    const [pendingStorageId, otherStorageId] = await runInGitEditor(t, async (ctx) => {
      return await Promise.all([
        ctx.storage.store(new Blob(["pending"])),
        ctx.storage.store(new Blob(["other"])),
      ]);
    });
    await t.mutation(components.gitEditor.branches.upsert, {
      repositoryId: otherRepositoryId,
      branch: "main",
      commitSHA: "head",
      treeData: { sha: "tree", truncated: false, tree: [] },
    });
    await t.mutation(components.gitEditor.staging.saveBinaryUploadToStaging, {
      repositoryId: otherRepositoryId,
      branch: "main",
      filePath: "image.png",
      storageId: otherStorageId,
      mime: "image/png",
      size: 5,
      stagedBlobSha: "other-blob-sha",
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
      await runInGitEditor(t, async (ctx) => ({
        pending: (await ctx.db.system.get(pendingStorageId)) !== null,
        other: (await ctx.db.system.get(otherStorageId)) !== null,
      })),
    ).toEqual({ pending: false, other: true });
    const rootStorageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["root"])));
    await expect(
      asUser.mutation(api.fileStaging.deletePendingUploadBlob, {
        repositoryId,
        storageId: rootStorageId,
      }),
    ).rejects.toThrow();
    expect(await t.run(async (ctx) => (await ctx.storage.get(rootStorageId))?.text() ?? null)).toBe(
      "root",
    );
  });
});

describe("deletion snapshots", () => {
  it.each([
    {
      kind: "text",
      text: "hello\n",
      mime: "text/plain",
      ext: "md",
      size: 6,
    },
    {
      kind: "binary",
      text: undefined,
      mime: "image/png",
      ext: "png",
      size: 42,
    },
  ] as const)("keeps the cached $kind base when deleting an unopened file", async (blob) => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    await t.mutation(components.gitEditor.branches.upsert, {
      repositoryId,
      branch: "main",
      commitSHA: "head",
      treeData: {
        sha: "tree",
        truncated: false,
        tree: [{ path: `unopened.${blob.ext}`, mode: "100644", type: "blob", sha: "blob-sha" }],
      },
    });
    const storageId =
      blob.kind === "binary"
        ? await runInGitEditor(t, async (ctx) => await ctx.storage.store(new Blob(["binary base"])))
        : undefined;
    await t.mutation(internal.gitOperations.saveFileBlob, {
      repositoryId,
      sha: "blob-sha",
      text: blob.text,
      storageId,
      mime: blob.mime,
      size: blob.size,
      ext: blob.ext,
    });
    const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
    await asUser.mutation(api.fileStaging.markFileForDeletion, {
      repositoryId,
      branch: "main",
      filePath: `unopened.${blob.ext}`,
      parentCommitSha: "blob-sha",
    });
    expect(
      await t.query(components.gitEditor.staging.getByNewPath, {
        repositoryId,
        branch: "main",
        newPath: `unopened.${blob.ext}`,
      }),
    ).toMatchObject({
      fileDeleted: true,
      kind: blob.kind,
      content: blob.text ?? "",
      initialContent: blob.text ?? "",
      parentCommitSha: "blob-sha",
      ...(blob.kind === "binary"
        ? { mime: blob.mime, size: blob.size, stagedBlobSha: "blob-sha" }
        : {}),
    });
  });

  it("does not seed a deletion from another repository or branch tree", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    await t.mutation(components.gitEditor.blobs.save, {
      repositoryId: "another-repository",
      sha: "foreign-sha",
      text: "foreign cached content",
      size: 22,
      mime: "text/plain",
      ext: "md",
    });
    for (const scope of [
      { repositoryId: "another-repository", branch: "main", sha: "foreign-sha" },
      { repositoryId, branch: "feature", sha: "foreign-sha" },
      { repositoryId, branch: "main", sha: "current-sha" },
    ]) {
      await t.mutation(components.gitEditor.branches.upsert, {
        repositoryId: scope.repositoryId,
        branch: scope.branch,
        commitSHA: "head",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [{ path: "notes.md", mode: "100644", type: "blob", sha: scope.sha }],
        },
      });
    }
    const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
    await expect(
      asUser.mutation(api.fileStaging.markFileForDeletion, {
        repositoryId,
        branch: "main",
        filePath: "notes.md",
        parentCommitSha: "foreign-sha",
      }),
    ).rejects.toThrow("File changed since deletion was requested.");
    expect(
      await t.query(components.gitEditor.staging.getByNewPath, {
        repositoryId,
        branch: "main",
        newPath: "notes.md",
      }),
    ).toBeNull();
  });

  it("rejects a stale deletion base after the scoped tree changes", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    await t.mutation(internal.gitOperations.saveFileBlob, {
      repositoryId,
      sha: "old-sha",
      text: "old content",
      size: 11,
      mime: "text/plain",
      ext: "md",
    });
    await t.mutation(components.gitEditor.branches.upsert, {
      repositoryId,
      branch: "main",
      commitSHA: "new-head",
      treeData: {
        sha: "new-tree",
        truncated: false,
        tree: [{ path: "notes.md", mode: "100644", type: "blob", sha: "new-sha" }],
      },
    });
    const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
    await expect(
      asUser.mutation(api.fileStaging.markFileForDeletion, {
        repositoryId,
        branch: "main",
        filePath: "notes.md",
        parentCommitSha: "old-sha",
      }),
    ).rejects.toThrow("File changed since deletion was requested.");
    expect(
      await t.query(components.gitEditor.staging.getByNewPath, {
        repositoryId,
        branch: "main",
        newPath: "notes.md",
      }),
    ).toBeNull();
  });

  it("keeps an existing staged base when the branch tree is absent", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    await insertStagedFile(t, {
      repositoryId,
      userId,
      branch: "deleted-branch",
      filePath: "notes.md",
      initialContent: "saved base",
      content: "pending edit",
    });
    const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
    await asUser.mutation(api.fileStaging.markFileForDeletion, {
      repositoryId,
      branch: "deleted-branch",
      filePath: "notes.md",
      parentCommitSha: null,
    });
    expect(
      await t.query(components.gitEditor.staging.getByNewPath, {
        repositoryId,
        branch: "deleted-branch",
        newPath: "notes.md",
      }),
    ).toMatchObject({
      fileDeleted: true,
      content: "pending edit",
      initialContent: "saved base",
      parentCommitSha: gitBlobSha("saved base"),
      version: 0,
    });
  });
});

describe("component scope", () => {
  it.each(["repository", "branch"] as const)(
    "rejects a document ID from another %s",
    async (scope) => {
      const t = makeConvexTest();
      const { repositoryId, userId } = await seedConnectedRepository(t);
      const file = await t.mutation(components.gitEditor.staging.saveToStaging, {
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
        await t.query(components.gitEditor.staging.getByNewPath, {
          repositoryId: file.repositoryId,
          branch: file.branch,
          newPath: file.filePath,
        }),
      ).toMatchObject({ content: "original", version: 0 });
    },
  );
});

describe("clearMatchingStagingSnapshot", () => {
  it("keeps later edits while removing the captured snapshot and its update stream", async () => {
    const t = makeConvexTest();
    const { repositoryId, userId } = await seedConnectedRepository(t);
    await t.mutation(components.gitEditor.branches.upsert, {
      repositoryId,
      branch: "main",
      commitSHA: "head",
      treeData: { sha: "tree", truncated: false, tree: [] },
    });
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
    await t.mutation(components.gitEditor.staging.rename, {
      repositoryId,
      userId,
      branch: "main",
      initialFilePath: "remove.md",
      newPath: "renamed.md",
    });
    await t.mutation(internal.collaborative.pushContentUpdate, {
      repositoryId,
      userId,
      branch: "main",
      filePath: "renamed.md",
      expectedVersion: 1,
      newContent: "renamed edit",
    });
    const files = await t.query(components.gitEditor.staging.listAllStagedFiles, {
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
    const { repositoryId: otherRepositoryId, runId: otherRunId } = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "9002",
        githubOwnerLogin: "staging",
        githubRepositoryName: "other",
      },
    );
    await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
      repositoryId: otherRepositoryId,
      runId: otherRunId,
      userId,
      githubRepositoryDatabaseId: "9002",
      githubOwnerLogin: "staging",
      githubRepositoryName: "other",
      defaultBranch: "main",
      visibility: "private",
    });
    const storageId = await runInGitEditor(
      t,
      async (ctx) => await ctx.storage.store(new Blob(["shared image"])),
    );
    await t.mutation(internal.gitOperations.saveFileBlob, {
      repositoryId: otherRepositoryId,
      storageId,
      sha: "shared-sha",
      size: 12,
      mime: "image/png",
      ext: "png",
    });
    const duplicateStorageId = await runInGitEditor(
      t,
      async (ctx) => await ctx.storage.store(new Blob(["shared image"])),
    );
    const chosenBlob = await t.mutation(internal.gitOperations.saveFileBlob, {
      repositoryId,
      storageId: duplicateStorageId,
      sha: "shared-sha",
      size: 12,
      mime: "image/png",
      ext: "png",
    });
    expect(chosenBlob?.storageId).toBe(storageId);
    expect(
      await runInGitEditor(t, async (ctx) => await ctx.storage.get(duplicateStorageId)),
    ).toBeNull();
    for (const targetRepositoryId of [repositoryId, otherRepositoryId]) {
      await t.mutation(components.gitEditor.branches.upsert, {
        repositoryId: targetRepositoryId,
        branch: "main",
        commitSHA: "head",
        treeData: { sha: "tree", truncated: false, tree: [] },
      });
      await t.mutation(components.gitEditor.staging.saveBinaryUploadToStaging, {
        repositoryId: targetRepositoryId,
        branch: "main",
        filePath: "image.png",
        storageId,
        mime: "image/png",
        size: 12,
        stagedBlobSha: "shared-sha",
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
    expect(
      await runInGitEditor(t, async (ctx) => (await ctx.storage.get(storageId)) !== null),
    ).toBe(true);
    await asUser.mutation(api.fileStaging.clearAllStaging, {
      repositoryId: otherRepositoryId,
      branch: "main",
      skipTreeUpdate: true,
    });
    expect(
      await runInGitEditor(t, async (ctx) => (await ctx.storage.get(storageId)) !== null),
    ).toBe(true);
    await t.mutation(components.gitEditor.staging.saveBinaryUploadToStaging, {
      repositoryId,
      branch: "main",
      filePath: "image.png",
      storageId,
      mime: "image/png",
      size: 12,
      stagedBlobSha: "shared-sha",
      userId,
      replaceExisting: false,
    });
    await t.mutation(components.gitEditor.blobs.deleteRepositoryBatch, {
      repositoryId: otherRepositoryId,
    });
    await asUser.mutation(api.fileStaging.clearAllStaging, {
      repositoryId,
      branch: "main",
      skipTreeUpdate: true,
    });
    expect(
      await runInGitEditor(t, async (ctx) => (await ctx.storage.get(storageId)) !== null),
    ).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it("rejects a late cache write and releases its bytes after repository deletion starts", async () => {
    const t = makeConvexTest();
    const { repositoryId, organizationId, userId } = await seedConnectedRepository(t);
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
        state: "running",
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "staging/notes",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "late-cache-write" },
        currentStep: "cleanup_editor_state",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              githubRepositoryDatabaseId: "9001",
              githubOwnerLogin: "staging",
              githubRepositoryName: "notes",
              githubRepositoryFullName: "staging/notes",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.patch(repositoryId, {
        deletion: { state: "deleting", runId, requestedAt: 1 },
      });
    });
    const storageId = await runInGitEditor(
      t,
      async (ctx) => await ctx.storage.store(new Blob(["late image"])),
    );
    expect(
      await t.mutation(internal.gitOperations.saveFileBlob, {
        repositoryId,
        storageId,
        sha: "late-sha",
        size: 10,
        mime: "image/png",
        ext: "png",
      }),
    ).toBeNull();
    expect(await t.query(components.gitEditor.blobs.getBySha, { sha: "late-sha" })).toBeNull();
    expect(await runInGitEditor(t, async (ctx) => await ctx.storage.get(storageId))).toBeNull();
  });
});
