import { describe, expect, it } from "vite-plus/test";
import {
  buildTreeEntriesForManifest,
  readSeedBranchState,
  seedRepositoryWithStarter,
  type StarterSeedBranchReader,
  type StarterSeedGitClient,
  type StarterTemplateManifest,
} from "./starterSeed";

function makeErrorWithStatus(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function makeGitClient(options?: {
  failFirstCreateTreeStatus?: number;
  createRefAlreadyExistsOnce?: boolean;
  createTreeFailsWithEmptyRepoUntilBootstrap?: boolean;
  emptyRepositoryCreateBlobFailuresAfterBootstrap?: number;
}) {
  const createTreeCalls: Parameters<StarterSeedGitClient["createTree"]>[0][] = [];
  const createBlobCalls: Parameters<StarterSeedGitClient["createBlob"]>[0][] = [];
  const createCommitCalls: Parameters<StarterSeedGitClient["createCommit"]>[0][] = [];
  const createRefCalls: Parameters<StarterSeedGitClient["createRef"]>[0][] = [];
  const updateRefCalls: Parameters<StarterSeedGitClient["updateRef"]>[0][] = [];
  const createBootstrapCommitCalls: Parameters<StarterSeedGitClient["createBootstrapCommit"]>[0][] =
    [];
  /** The ref writes and bootstrap commits in call order, for the push order of a branch-first seed. */
  const refEvents: string[] = [];

  let treeCounter = 0;
  let blobCounter = 0;
  let commitCounter = 0;
  let bootstrapCounter = 0;
  let didFailCreateTree = false;
  let didThrowRefExists = false;
  let didBootstrap = false;
  let emptyRepositoryCreateBlobFailuresAfterBootstrap =
    options?.emptyRepositoryCreateBlobFailuresAfterBootstrap ?? 0;

  const client: StarterSeedGitClient = {
    createTree: async (args) => {
      createTreeCalls.push(args);
      if (!didFailCreateTree && typeof options?.failFirstCreateTreeStatus === "number") {
        didFailCreateTree = true;
        throw makeErrorWithStatus(options.failFirstCreateTreeStatus, "simulated createTree error");
      }
      if (options?.createTreeFailsWithEmptyRepoUntilBootstrap === true && !didBootstrap) {
        throw makeErrorWithStatus(
          409,
          "Git Repository is empty. - https://docs.github.com/rest/git/trees#create-a-tree",
        );
      }

      treeCounter += 1;
      return { sha: `tree-${treeCounter}` };
    },
    createBlob: async (args) => {
      createBlobCalls.push(args);
      if (didBootstrap && emptyRepositoryCreateBlobFailuresAfterBootstrap > 0) {
        emptyRepositoryCreateBlobFailuresAfterBootstrap -= 1;
        throw makeErrorWithStatus(
          409,
          "Git Repository is empty. - https://docs.github.com/rest/git/blobs#create-a-blob",
        );
      }
      blobCounter += 1;
      return { sha: `blob-${blobCounter}` };
    },
    createCommit: async (args) => {
      createCommitCalls.push(args);
      commitCounter += 1;
      return { sha: `commit-${commitCounter}` };
    },
    createRef: async (args) => {
      createRefCalls.push(args);
      refEvents.push(`create ${args.ref} ${args.sha}`);
      if (options?.createRefAlreadyExistsOnce && !didThrowRefExists) {
        didThrowRefExists = true;
        throw makeErrorWithStatus(422, "Reference already exists");
      }
    },
    updateRef: async (args) => {
      updateRefCalls.push(args);
      refEvents.push(`update ${args.ref} ${args.sha}`);
    },
    createBootstrapCommit: async (args) => {
      createBootstrapCommitCalls.push(args);
      didBootstrap = true;
      bootstrapCounter += 1;
      refEvents.push(`bootstrap ${args.branch} bootstrap-${bootstrapCounter}`);
      return { sha: `bootstrap-${bootstrapCounter}` };
    },
  };

  return {
    client,
    createTreeCalls,
    createBlobCalls,
    createCommitCalls,
    createRefCalls,
    updateRefCalls,
    createBootstrapCommitCalls,
    refEvents,
  };
}

describe("buildTreeEntriesForManifest", () => {
  it("sorts entries by path for deterministic GitHub trees", () => {
    const entries = buildTreeEntriesForManifest(
      {
        "src/main.tsx": "main",
        "README.md": "readme",
        "convex/schema.ts": "schema",
      },
      {
        "docs/logo.jpg": "blob-logo",
      },
      {
        "docs/logo.jpg": "100755",
        "src/main.tsx": "100755",
      },
    );

    expect(entries.map((entry) => entry.path)).toEqual([
      "convex/schema.ts",
      "docs/logo.jpg",
      "README.md",
      "src/main.tsx",
    ]);
    expect(entries[1]).toEqual({
      path: "docs/logo.jpg",
      mode: "100755",
      type: "blob",
      sha: "blob-logo",
    });
    expect(entries[3]).toEqual({
      path: "src/main.tsx",
      mode: "100755",
      type: "blob",
      content: "main",
    });
  });
});

describe("seedRepositoryWithStarter", () => {
  const manifest: StarterTemplateManifest = {
    version: "starter-template-test",
    sourcePath: "templates/base",
    publishedRepo: "https://github.com/samebase/base.git",
    contentHash: "starter-template-test",
    commitMessage: "Initialize Samebase app",
    files: {
      "README.md": "starter",
      "src/App.tsx": "export default function App() { return null; }",
    },
    binaryFiles: {},
    fileModes: {},
  };

  it("creates one root commit and one branch ref", async () => {
    const mock = makeGitClient();

    const result = await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
    });

    expect(mock.createTreeCalls).toHaveLength(1);
    expect(mock.createBlobCalls).toHaveLength(0);
    expect(mock.createCommitCalls).toHaveLength(1);
    expect(mock.createCommitCalls[0].message).toBe(manifest.commitMessage);
    expect(mock.createCommitCalls[0].parents).toEqual([]);
    expect(mock.createRefCalls).toHaveLength(1);
    expect(mock.createRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "refs/heads/main",
      sha: "commit-1",
    });
    expect(mock.updateRefCalls).toHaveLength(0);

    expect(result).toEqual({
      defaultBranch: "main",
      headCommitSha: "commit-1",
    });
  });

  it("creates Git blobs for binary manifest files before creating the tree", async () => {
    const mock = makeGitClient();

    await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest: {
        ...manifest,
        binaryFiles: {
          "docs/logo.jpg": Buffer.from("binary", "utf8").toString("base64"),
        },
        fileModes: {
          "docs/logo.jpg": "100755",
        },
      },
    });

    expect(mock.createBlobCalls).toEqual([
      {
        owner: "owner",
        repo: "repo",
        contentBase64: Buffer.from("binary", "utf8").toString("base64"),
      },
    ]);
    expect(mock.createTreeCalls[0].tree).toContainEqual({
      path: "docs/logo.jpg",
      mode: "100755",
      type: "blob",
      sha: "blob-1",
    });
  });

  it("retries createTree for retryable errors", async () => {
    const mock = makeGitClient({ failFirstCreateTreeStatus: 422 });

    await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
    });

    expect(mock.createTreeCalls).toHaveLength(2);
  });

  it("falls back to updateRef when createRef already exists", async () => {
    const mock = makeGitClient({ createRefAlreadyExistsOnce: true });

    await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
    });

    expect(mock.createRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "commit-1",
      force: true,
    });
  });

  it("bootstraps empty repositories then force-updates the branch to the root starter commit", async () => {
    const mock = makeGitClient({
      createTreeFailsWithEmptyRepoUntilBootstrap: true,
    });

    const result = await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
    });

    expect(mock.createBootstrapCommitCalls).toHaveLength(1);
    expect(mock.createBootstrapCommitCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
      message: "chore: bootstrap branch for starter seeding",
      path: ".samebase-seed-bootstrap",
      contentBase64: Buffer.from("bootstrap\n", "utf8").toString("base64"),
    });

    expect(mock.createTreeCalls).toHaveLength(2);
    expect(mock.createCommitCalls).toHaveLength(1);
    expect(mock.createCommitCalls[0].parents).toEqual([]);
    expect(mock.createRefCalls).toHaveLength(0);
    expect(mock.updateRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "commit-1",
      force: true,
    });

    expect(result).toEqual({
      defaultBranch: "main",
      headCommitSha: "commit-1",
    });
  });

  describe("with a step before the starter push", () => {
    async function seedBranchFirst(mock: ReturnType<typeof makeGitClient>) {
      return await seedRepositoryWithStarter({
        client: mock.client,
        owner: "owner",
        repo: "repo",
        defaultBranch: "main",
        manifest,
        beforeStarterPush: async ({ treeSha }) => {
          mock.refEvents.push(`before starter push ${treeSha}`);
        },
      });
    }

    it("creates the branch at the bootstrap commit when it landed on another branch", async () => {
      const mock = makeGitClient({ createTreeFailsWithEmptyRepoUntilBootstrap: true });

      await expect(seedBranchFirst(mock)).resolves.toEqual({
        defaultBranch: "main",
        headCommitSha: "commit-1",
      });

      expect(mock.refEvents).toEqual([
        "bootstrap main bootstrap-1",
        "create refs/heads/main bootstrap-1",
        "before starter push tree-1",
        "update heads/main commit-1",
      ]);
    });

    it("keeps the branch that the bootstrap commit created", async () => {
      const mock = makeGitClient({
        createTreeFailsWithEmptyRepoUntilBootstrap: true,
        createRefAlreadyExistsOnce: true,
      });

      await seedBranchFirst(mock);

      expect(mock.refEvents).toEqual([
        "bootstrap main bootstrap-1",
        "create refs/heads/main bootstrap-1",
        "before starter push tree-1",
        "update heads/main commit-1",
      ]);
    });

    it("creates the branch at a placeholder commit in a repository that has commits", async () => {
      const mock = makeGitClient();

      await seedBranchFirst(mock);

      // The placeholder commit holds only the bootstrap file, so the branch runs no workflow.
      expect(mock.createTreeCalls.at(-1)?.tree).toEqual([
        { path: ".samebase-seed-bootstrap", mode: "100644", type: "blob", content: "bootstrap\n" },
      ]);
      expect(mock.createCommitCalls.at(-1)).toMatchObject({ tree: "tree-2", parents: [] });
      expect(mock.refEvents).toEqual([
        "create refs/heads/main commit-2",
        "before starter push tree-1",
        "update heads/main commit-1",
      ]);
    });
  });

  it("retries manifest writes after bootstrap while GitHub still reports an empty repository", async () => {
    const mock = makeGitClient({
      createTreeFailsWithEmptyRepoUntilBootstrap: true,
      emptyRepositoryCreateBlobFailuresAfterBootstrap: 2,
    });

    await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest: {
        ...manifest,
        binaryFiles: {
          "docs/logo.jpg": Buffer.from("binary", "utf8").toString("base64"),
        },
        fileModes: {
          "docs/logo.jpg": "100644",
        },
      },
    });

    expect(mock.createBootstrapCommitCalls).toHaveLength(1);
    expect(mock.createBlobCalls).toHaveLength(4);
    expect(mock.createTreeCalls).toHaveLength(2);
    expect(mock.createCommitCalls).toHaveLength(1);
    expect(mock.updateRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "commit-1",
      force: true,
    });
  });
});

describe("readSeedBranchState", () => {
  /** A branch whose commits are listed newest first, each with its tree's paths. */
  function readBranch(
    commits: Array<{ treeSha: string; paths: string[] }>,
    starterTreeSha: string | null,
  ) {
    const reader: StarterSeedBranchReader = {
      readBranchHead: async () => {
        const head = commits.at(0);
        return head
          ? { treeSha: head.treeSha, parentCount: Math.min(commits.length - 1, 1) }
          : null;
      },
      listBranchTreeShas: async ({ limit }) =>
        commits.slice(0, limit).map((commit) => commit.treeSha),
      readTreePaths: async ({ treeSha }) =>
        commits.find((commit) => commit.treeSha === treeSha)?.paths ?? [],
    };
    return readSeedBranchState({
      reader,
      owner: "owner",
      repo: "repo",
      branch: "main",
      starterTreeSha,
    });
  }
  const bootstrap = { treeSha: "bootstrap-tree", paths: [".samebase-seed-bootstrap"] };
  const starter = { treeSha: "starter-tree", paths: ["package.json"] };
  const userChange = { treeSha: "user-tree", paths: ["package.json", "notes.md"] };

  it("lets the starter replace a missing branch or the bootstrap commit", async () => {
    await expect(readBranch([], null)).resolves.toBe("missing");
    await expect(readBranch([bootstrap], null)).resolves.toBe("bootstrap");
    await expect(readBranch([bootstrap], "starter-tree")).resolves.toBe("bootstrap");
  });

  it("finds a recorded starter at the head or under later commits", async () => {
    await expect(readBranch([starter], "starter-tree")).resolves.toBe("seeded");
    await expect(readBranch([userChange, starter], "starter-tree")).resolves.toBe("seeded");
  });

  it("treats any other commit as foreign", async () => {
    await expect(readBranch([userChange, bootstrap], "starter-tree")).resolves.toBe("foreign");
    await expect(readBranch([userChange, starter], null)).resolves.toBe("foreign");
    await expect(readBranch([{ treeSha: "other-root", paths: ["README.md"] }], null)).resolves.toBe(
      "foreign",
    );
  });
});
