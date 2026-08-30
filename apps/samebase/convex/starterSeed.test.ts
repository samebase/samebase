import { describe, expect, it } from "vite-plus/test";
import {
  buildTreeEntriesForManifest,
  seedRepositoryWithStarter,
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
      if (options?.createRefAlreadyExistsOnce && !didThrowRefExists) {
        didThrowRefExists = true;
        throw makeErrorWithStatus(422, "Reference already exists");
      }
    },
    updateRef: async (args) => {
      updateRefCalls.push(args);
    },
    createBootstrapCommit: async (args) => {
      createBootstrapCommitCalls.push(args);
      didBootstrap = true;
      bootstrapCounter += 1;
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
