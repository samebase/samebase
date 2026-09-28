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

import { internal } from "./_generated/api";
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
          data: readTree(args.tree_sha.replace(/^(heads\/|tree-)/, "")),
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
      email: "staging@example.com",
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
  return await t.run(async (ctx) => {
    return await ctx.db.insert("repositoryStagedFiles", {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      fileDeleted: false,
      kind: "text",
      content: args.content,
      initialContent: args.initialContent,
      parentCommitSha: gitBlobSha(args.initialContent),
      lastEditTime: 1,
      lastEditUserId: args.userId,
      version: 0,
    });
  });
}

async function readStagedFiles(t: ConvexTest) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("repositoryStagedFiles").collect();
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
  });
}

async function readCollaborativeUpdatePaths(t: ConvexTest) {
  return await t.run(async (ctx) => {
    const updates = await ctx.db.query("repositoryStagedFileUpdates").collect();
    return updates.map((update) => `${update.branch}:${update.filePath}`).sort();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
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
    expect(await readStagedFiles(t)).toEqual([
      {
        branch: "main",
        filePath: "notes.md",
        initialFilePath: "notes.md",
        content: "a\nb\nc\n",
        initialContent: "a\nb\n",
        parentCommitSha: gitBlobSha("a\nb\n"),
      },
    ]);
    expect(await readCollaborativeUpdatePaths(t)).toEqual(["main:notes.md"]);
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
        { action: "delete", stagingId: editedId },
        { action: "delete", stagingId: unchangedId },
      ],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await readStagedFiles(t)).map((row) => `${row.branch}:${row.filePath}`)).toEqual([
      "main:edited.md",
      "feature:other.md",
    ]);
    expect(await readCollaborativeUpdatePaths(t)).toEqual(["feature:other.md", "main:edited.md"]);
  });
});
