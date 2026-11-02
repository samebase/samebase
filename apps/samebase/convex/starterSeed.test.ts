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

  const bootstrapHead = { sha: "bootstrap-head", treeSha: "bootstrap-tree", parentCount: 0 };

  /** A seed target whose branch holds only the bootstrap commit, or nothing for `missingReads`. */
  function branchFirstOverBootstrap(missingReads = 0) {
    let remainingMissingReads = missingReads;
    const reader: StarterSeedBranchReader = {
      readBranchHead: async () => {
        if (remainingMissingReads > 0) {
          remainingMissingReads -= 1;
          return null;
        }
        return bootstrapHead;
      },
      listBranchTreeShas: async () => [],
      readTreePaths: async () => [".samebase-seed-bootstrap"],
    };
    return { reader, beforeStarterPush: async () => {} };
  }

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
      branchFirst: branchFirstOverBootstrap(),
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
      branchFirst: branchFirstOverBootstrap(),
    });

    expect(mock.createTreeCalls).toHaveLength(2);
  });

  it("fast-forwards the branch when createRef finds that it already exists", async () => {
    const mock = makeGitClient({ createRefAlreadyExistsOnce: true });

    await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
      branchFirst: branchFirstOverBootstrap(1),
    });

    expect(mock.createRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "commit-2",
      force: false,
    });
  });

  it("bootstraps empty repositories then fast-forwards the branch to the starter commit", async () => {
    const mock = makeGitClient({
      createTreeFailsWithEmptyRepoUntilBootstrap: true,
    });

    const result = await seedRepositoryWithStarter({
      client: mock.client,
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      manifest,
      branchFirst: branchFirstOverBootstrap(),
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
    expect(mock.createCommitCalls[0].parents).toEqual([bootstrapHead.sha]);
    expect(mock.createRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls).toHaveLength(1);
    expect(mock.updateRefCalls[0]).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "commit-1",
      force: false,
    });

    expect(result).toEqual({
      defaultBranch: "main",
      headCommitSha: "commit-1",
    });
  });

  describe("branch first", () => {
    /**
    An in-memory Git repository behind both the seed client and the branch reader. A non-force ref
    update must be a fast-forward, as on GitHub. `empty` starts without commits, and the bootstrap
    commit then lands on `bootstrapBranch`. `beforeRefUpdate` runs once, before the first ref update,
    as a push from outside Samebase between the seed's read of the branch and its update.
    */
    function makeGitRepository(options: {
      empty: boolean;
      bootstrapBranch: string;
      beforeRefUpdate?: () => void;
    }) {
      let beforeRefUpdate = options.beforeRefUpdate;
      const commits = new Map<string, { treeSha: string; parents: string[] }>();
      const trees = new Map<string, string[]>();
      const branches = new Map<string, string>();
      const events: string[] = [];
      let counter = 0;
      const nextSha = (prefix: string) => {
        counter += 1;
        return `${prefix}-${counter}`;
      };
      const addCommit = (prefix: string, treeSha: string, parents: string[]) => {
        const sha = nextSha(prefix);
        commits.set(sha, { treeSha, parents });
        return sha;
      };
      const readCommit = (sha: string) => {
        const commit = commits.get(sha);
        if (!commit) {
          throw new Error(`Unknown commit ${sha}.`);
        }
        return commit;
      };
      const failWhileEmpty = () => {
        if (options.empty && branches.size === 0) {
          throw makeErrorWithStatus(409, "Git Repository is empty.");
        }
      };
      if (!options.empty) {
        trees.set("readme-tree", ["README.md"]);
        branches.set("master", addCommit("existing", "readme-tree", []));
      }

      const client: StarterSeedGitClient = {
        createTree: async (args) => {
          failWhileEmpty();
          const sha = nextSha("tree");
          trees.set(
            sha,
            args.tree.map((entry) => entry.path),
          );
          return { sha };
        },
        createBlob: async () => {
          failWhileEmpty();
          return { sha: nextSha("blob") };
        },
        createCommit: async (args) => ({ sha: addCommit("commit", args.tree, args.parents) }),
        createRef: async (args) => {
          const branch = args.ref.replace("refs/heads/", "");
          if (branches.has(branch)) {
            throw makeErrorWithStatus(422, "Reference already exists");
          }
          branches.set(branch, args.sha);
          events.push(`create ${branch} ${args.sha}`);
        },
        updateRef: async (args) => {
          beforeRefUpdate?.();
          beforeRefUpdate = undefined;
          const branch = args.ref.replace("heads/", "");
          const current = branches.get(branch);
          if (
            !args.force &&
            (current === undefined || !readCommit(args.sha).parents.includes(current))
          ) {
            events.push(`refused ${branch} ${args.sha}`);
            throw makeErrorWithStatus(422, "Update is not a fast forward");
          }
          branches.set(branch, args.sha);
          events.push(`update ${branch} ${args.sha}${args.force ? " force" : ""}`);
        },
        createBootstrapCommit: async (args) => {
          trees.set("bootstrap-tree", [args.path]);
          const sha = addCommit("bootstrap", "bootstrap-tree", []);
          branches.set(options.bootstrapBranch, sha);
          events.push(`bootstrap ${options.bootstrapBranch} ${sha}`);
          return { sha };
        },
      };
      const reader: StarterSeedBranchReader = {
        readBranchHead: async (args) => {
          const sha = branches.get(args.branch);
          if (sha === undefined) {
            return null;
          }
          const commit = readCommit(sha);
          return { sha, treeSha: commit.treeSha, parentCount: commit.parents.length };
        },
        listBranchTreeShas: async (args) => {
          const treeShas: string[] = [];
          let sha = branches.get(args.branch);
          while (sha !== undefined && treeShas.length < args.limit) {
            const commit = readCommit(sha);
            treeShas.push(commit.treeSha);
            sha = commit.parents.at(0);
          }
          return treeShas;
        },
        readTreePaths: async (args) => trees.get(args.treeSha) ?? [],
      };
      /** Someone else's commit on top of the branch, as a push from outside Samebase. */
      const pushCommit = (branch: string, treeSha: string, paths: string[]) => {
        const parent = branches.get(branch);
        trees.set(treeSha, paths);
        const sha = addCommit("pushed", treeSha, parent === undefined ? [] : [parent]);
        branches.set(branch, sha);
        events.push(`pushed ${branch} ${sha}`);
      };
      const readHistory = (branch: string) => {
        const shas: string[] = [];
        let sha = branches.get(branch);
        while (sha !== undefined) {
          shas.push(sha);
          sha = readCommit(sha).parents.at(0);
        }
        return shas;
      };
      return { client, events, pushCommit, reader, readHistory };
    }

    async function seedBranchFirst(
      repository: ReturnType<typeof makeGitRepository>,
      beforeStarterPush: (starter: { treeSha: string }) => Promise<void> = async ({ treeSha }) => {
        repository.events.push(`before starter push ${treeSha}`);
      },
    ) {
      return await seedRepositoryWithStarter({
        client: repository.client,
        owner: "owner",
        repo: "repo",
        defaultBranch: "main",
        manifest,
        branchFirst: { reader: repository.reader, beforeStarterPush },
      });
    }

    it("creates main at the bootstrap commit that landed on another branch, then fast-forwards", async () => {
      const repository = makeGitRepository({ empty: true, bootstrapBranch: "master" });

      await expect(seedBranchFirst(repository)).resolves.toEqual({
        defaultBranch: "main",
        headCommitSha: "commit-3",
      });

      expect(repository.events).toEqual([
        "bootstrap master bootstrap-1",
        "create main bootstrap-1",
        "before starter push tree-2",
        "update main commit-3",
      ]);
      // Two commits, the bootstrap and the starter on top of it, and no force push.
      expect(repository.readHistory("main")).toEqual(["commit-3", "bootstrap-1"]);
    });

    it("fast-forwards the main that the bootstrap commit created", async () => {
      const repository = makeGitRepository({ empty: true, bootstrapBranch: "main" });

      await seedBranchFirst(repository);

      expect(repository.events).toEqual([
        "bootstrap main bootstrap-1",
        "before starter push tree-2",
        "update main commit-3",
      ]);
      expect(repository.readHistory("main")).toEqual(["commit-3", "bootstrap-1"]);
    });

    it("creates main at a placeholder commit in a repository that has commits", async () => {
      const repository = makeGitRepository({ empty: false, bootstrapBranch: "main" });

      await seedBranchFirst(repository);

      // The placeholder commit holds only the bootstrap file, so the branch runs no workflow, and
      // the starter goes on top of it.
      expect(repository.events).toEqual([
        "create main commit-4",
        "before starter push tree-2",
        "update main commit-5",
      ]);
      expect(repository.readHistory("main")).toEqual(["commit-5", "commit-4"]);
    });

    it("stops when a foreign commit moved main before the starter push", async () => {
      const repository = makeGitRepository({ empty: true, bootstrapBranch: "main" });

      await expect(
        seedBranchFirst(repository, async () => {
          repository.pushCommit("main", "foreign-tree", [".samebase-seed-bootstrap", "notes.md"]);
        }),
      ).rejects.toThrow(
        "main of owner/repo has commits that Samebase did not make, so Samebase cannot seed the starter without dropping them.",
      );
      expect(repository.readHistory("main")).toEqual(["pushed-3", "bootstrap-1"]);
    });

    it("reads main again after GitHub refused a moved head, and keeps a foreign commit", async () => {
      // Someone pushes between the seed's read of main and its ref update.
      const repository = makeGitRepository({
        empty: true,
        bootstrapBranch: "main",
        beforeRefUpdate: () => {
          repository.pushCommit("main", "foreign-tree", [".samebase-seed-bootstrap", "notes.md"]);
        },
      });

      await expect(seedBranchFirst(repository)).rejects.toThrow(
        "main of owner/repo has commits that Samebase did not make",
      );
      expect(repository.events).toEqual([
        "bootstrap main bootstrap-1",
        "before starter push tree-2",
        "pushed main pushed-4",
        "refused main commit-3",
      ]);
      expect(repository.readHistory("main")).toEqual(["pushed-4", "bootstrap-1"]);
    });

    it("reads main again after GitHub refused a moved head that already holds the starter", async () => {
      let starterTreeSha = "";
      // An earlier attempt's starter lands between the read of main and this ref update.
      const repository = makeGitRepository({
        empty: true,
        bootstrapBranch: "main",
        beforeRefUpdate: () => {
          repository.pushCommit("main", starterTreeSha, ["README.md", "src/App.tsx"]);
        },
      });

      await expect(
        seedBranchFirst(repository, async ({ treeSha }) => {
          starterTreeSha = treeSha;
        }),
      ).resolves.toEqual({ defaultBranch: "main", headCommitSha: "pushed-4" });
      expect(repository.events).toContain("refused main commit-3");
      expect(repository.readHistory("main")).toEqual(["pushed-4", "bootstrap-1"]);
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
      branchFirst: branchFirstOverBootstrap(),
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
      force: false,
    });
  });
});

describe("readSeedBranchState", () => {
  /** A branch whose commits are listed newest first, each with its tree's paths. */
  async function readBranch(
    commits: Array<{ treeSha: string; paths: string[] }>,
    starterTreeSha: string | null,
  ) {
    const reader: StarterSeedBranchReader = {
      readBranchHead: async () => {
        const head = commits.at(0);
        return head
          ? {
              sha: `${head.treeSha}-commit`,
              treeSha: head.treeSha,
              parentCount: Math.min(commits.length - 1, 1),
            }
          : null;
      },
      listBranchTreeShas: async ({ limit }) =>
        commits.slice(0, limit).map((commit) => commit.treeSha),
      readTreePaths: async ({ treeSha }) =>
        commits.find((commit) => commit.treeSha === treeSha)?.paths ?? [],
    };
    const branchState = await readSeedBranchState({
      reader,
      owner: "owner",
      repo: "repo",
      branch: "main",
      starterTreeSha,
    });
    return branchState.state;
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
