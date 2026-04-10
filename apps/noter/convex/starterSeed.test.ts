import { describe, expect, it } from "vitest";
import {
  buildTreeEntriesForManifest,
  seedRepositoryWithStarter,
  type StarterSeedGitClient,
  type StarterTemplateManifest,
} from "./starterSeed";

function makeErrorWithStatus(status: number, message: string): Error {
  const error = new Error(message);
  Reflect.set(error, "status", status);
  return error;
}

function makeGitClient(options?: {
  failFirstCreateTreeStatus?: number;
  createRefAlreadyExistsOnce?: boolean;
  createTreeFailsWithEmptyRepoUntilBootstrap?: boolean;
}) {
  const createTreeCalls: Parameters<StarterSeedGitClient["createTree"]>[0][] =
    [];
  const createCommitCalls: Parameters<
    StarterSeedGitClient["createCommit"]
  >[0][] = [];
  const createRefCalls: Parameters<StarterSeedGitClient["createRef"]>[0][] = [];
  const updateRefCalls: Parameters<StarterSeedGitClient["updateRef"]>[0][] = [];
  const createBootstrapCommitCalls: Parameters<
    StarterSeedGitClient["createBootstrapCommit"]
  >[0][] = [];

  let treeCounter = 0;
  let commitCounter = 0;
  let bootstrapCounter = 0;
  let didFailCreateTree = false;
  let didThrowRefExists = false;
  let didBootstrap = false;

  const client: StarterSeedGitClient = {
    createTree: async (args) => {
      createTreeCalls.push(args);
      if (
        !didFailCreateTree &&
        typeof options?.failFirstCreateTreeStatus === "number"
      ) {
        didFailCreateTree = true;
        throw makeErrorWithStatus(
          options.failFirstCreateTreeStatus,
          "simulated createTree error",
        );
      }
      if (
        options?.createTreeFailsWithEmptyRepoUntilBootstrap === true &&
        !didBootstrap
      ) {
        throw makeErrorWithStatus(
          409,
          "Git Repository is empty. - https://docs.github.com/rest/git/trees#create-a-tree",
        );
      }

      treeCounter += 1;
      return { sha: `tree-${treeCounter}` };
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
    createCommitCalls,
    createRefCalls,
    updateRefCalls,
    createBootstrapCommitCalls,
  };
}

describe("buildTreeEntriesForManifest", () => {
  it("sorts entries by path for deterministic GitHub trees", () => {
    const entries = buildTreeEntriesForManifest({
      "src/main.tsx": "main",
      "README.md": "readme",
      "convex/schema.ts": "schema",
    });

    expect(entries.map((entry) => entry.path)).toEqual([
      "convex/schema.ts",
      "README.md",
      "src/main.tsx",
    ]);
  });
});

describe("seedRepositoryWithStarter", () => {
  const manifest: StarterTemplateManifest = {
    version: "starter-template-test",
    commitMessage: "chore: seed starter template",
    files: {
      "README.md": "starter",
      "src/App.tsx": "export default function App() { return null; }",
    },
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
    expect(mock.createCommitCalls).toHaveLength(1);
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
      path: ".noter-seed-bootstrap",
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
});
