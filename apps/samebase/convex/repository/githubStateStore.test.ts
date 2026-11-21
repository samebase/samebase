import { Octokit } from "@octokit/rest";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import ciLabel from "./fixtures/githubStateStore/branch/github-state-spike/ci/Label.json";
import ciNote from "./fixtures/githubStateStore/branch/github-state-spike/ci/Note.json";
import ciSecret from "./fixtures/githubStateStore/branch/github-state-spike/ci/Secret.json";
import ciOutput from "./fixtures/githubStateStore/branch/github-state-spike/ci/__stack_output__.json";
import demoLabel from "./fixtures/githubStateStore/branch/github-state-spike/demo/Label.json";
import demoNote from "./fixtures/githubStateStore/branch/github-state-spike/demo/Note.json";
import demoSecret from "./fixtures/githubStateStore/branch/github-state-spike/demo/Secret.json";
import demoOutput from "./fixtures/githubStateStore/branch/github-state-spike/demo/__stack_output__.json";
import matchingRefs from "./fixtures/githubStateStore/matchingRefs.json";
import recordedTree from "./fixtures/githubStateStore/tree.json";
import { readGitHubStateStore } from "./githubStateStore";

const myApp = { githubRepositoryDatabaseId: "1001", githubRepositoryFullName: "my-org/my-app" };
const api = "https://api.github.com/repos/my-org/my-app";
/** The recorded refs: the state branch, then the lock branch, whose name starts the same. */
const [stateRef, lockRef] = matchingRefs;
const refsUrl = `${api}/git/matching-refs/heads%2Falchemy-state-store?per_page=100`;
const treeUrl = `${api}/git/trees/${stateRef.object.sha}?recursive=1`;
/** The recorded files of the branch by path. Alchemy writes each with two spaces of indent. */
const files: Record<string, unknown> = {
  "github-state-spike/ci/Label.json": ciLabel,
  "github-state-spike/ci/Note.json": ciNote,
  "github-state-spike/ci/Secret.json": ciSecret,
  "github-state-spike/ci/__stack_output__.json": ciOutput,
  "github-state-spike/demo/Label.json": demoLabel,
  "github-state-spike/demo/Note.json": demoNote,
  "github-state-spike/demo/Secret.json": demoSecret,
  "github-state-spike/demo/__stack_output__.json": demoOutput,
};
const blobUrl = (path: string) =>
  `${api}/git/blobs/${recordedTree.tree.find((entry) => entry.path === path)?.sha}`;

/**
GitHub with the recorded branch. `tree` replaces the reply of the tree, and `urls` the answer to
whole URLs. Each recorded file stays at its blob SHA. A blob is answered only to the raw media type,
as GitHub answers it.
*/
function fakeGitHub(
  args: { tree?: typeof recordedTree; urls?: Record<string, () => Response> } = {},
) {
  const requests: string[] = [];
  const tree = args.tree ?? recordedTree;
  const blobs = new Map<string, string>(
    recordedTree.tree.flatMap((entry) => {
      const file = files[entry.path];
      return file === undefined
        ? []
        : [[`${api}/git/blobs/${entry.sha}`, JSON.stringify(file, null, 2)]];
    }),
  );
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url);
    const blob = blobs.get(url);
    return (
      args.urls?.[url]?.() ??
      (url === refsUrl
        ? Response.json(matchingRefs)
        : url === treeUrl
          ? Response.json(tree)
          : blob !== undefined &&
              new Headers(init?.headers).get("accept") === "application/vnd.github.raw+json"
            ? new Response(blob, { headers: { "content-type": "text/plain; charset=utf-8" } })
            : Response.json({ message: "Not Found" }, { status: 404 }))
    );
  });
  return { octokit: new Octokit({ request: { fetch } }), requests };
}

/** The recorded tree with each path that starts with `from` moved to start with `to`. */
function movedTree(from: string, to: string): typeof recordedTree {
  return {
    ...recordedTree,
    tree: recordedTree.tree.map((entry) => ({
      ...entry,
      path: entry.path.startsWith(from) ? `${to}${entry.path.slice(from.length)}` : entry.path,
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readGitHubStateStore", () => {
  it("gives the stages whose run record names the repository, without secret or sealed values", async () => {
    const { octokit, requests } = fakeGitHub();
    const found = await readGitHubStateStore({
      octokit,
      repository: myApp,
      treeOnly: false,
    });

    expect(found).toEqual({
      state: "found",
      stageFiles: true,
      stacks: [
        {
          name: "github-state-spike",
          store: "github",
          stages: [
            {
              name: "demo",
              run: demoOutput["samebase.run"],
              resources: [
                { fqn: "Label", value: JSON.stringify(demoLabel) },
                {
                  fqn: "Note",
                  value: JSON.stringify({
                    ...demoNote,
                    props: { ...demoNote.props, secret: { __redacted__: null } },
                  }),
                },
                {
                  fqn: "Secret",
                  value: JSON.stringify({
                    ...demoSecret,
                    attr: { text: { __redacted__: null } },
                  }),
                },
              ],
              output: JSON.stringify({ label: demoOutput.label, length: demoOutput.length }),
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(found)).not.toMatch(/__sealed__|v1\.fixture/);
    // The output of `ci` has no run record, so its resources are not read.
    expect(requests.filter((url) => url.includes("/git/blobs/")).sort()).toEqual(
      [
        "github-state-spike/ci/__stack_output__.json",
        "github-state-spike/demo/__stack_output__.json",
        "github-state-spike/demo/Label.json",
        "github-state-spike/demo/Note.json",
        "github-state-spike/demo/Secret.json",
      ]
        .map(blobUrl)
        .sort(),
    );
  });

  it("shows no stage whose run record names another repository", async () => {
    const { octokit, requests } = fakeGitHub({
      urls: {
        [blobUrl("github-state-spike/demo/__stack_output__.json")]: () =>
          new Response(
            JSON.stringify({
              ...demoOutput,
              "samebase.run": { ...demoOutput["samebase.run"], repository: "my-org/other" },
            }),
          ),
      },
    });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: false })).toEqual({
      state: "found",
      stageFiles: true,
      stacks: [],
    });
    expect(requests.filter((url) => url.includes("/git/blobs/"))).toHaveLength(2);
  });

  it("takes the stack name from the path before the stage and ignores paths that are not state", async () => {
    const tree = movedTree("github-state-spike/demo/", "my-org/my-app/web/demo/");
    tree.tree.push(
      { ...tree.tree[0], path: "my-org/my-app/web/demo/__lease__.json" },
      { ...tree.tree[0], path: "notes/readme.json" },
      { ...tree.tree[0], path: "my-org/my-app/web/demo/notes.txt" },
    );
    const { octokit, requests } = fakeGitHub({ tree });
    const found = await readGitHubStateStore({
      octokit,
      repository: myApp,
      treeOnly: false,
    });

    expect(found).toMatchObject({
      state: "found",
      stacks: [{ name: "my-org/my-app/web", stages: [{ name: "demo" }] }],
    });
    // The README.md, the lease, a file outside a stage folder, and a file that is not JSON.
    expect(requests).toHaveLength(2 + 5);

    // The same paths alone are no stage file for the deletion check.
    const notState = fakeGitHub({
      tree: {
        ...tree,
        tree: tree.tree.filter(
          (entry) =>
            !entry.path.endsWith(".json") ||
            entry.path.endsWith("/__lease__.json") ||
            entry.path.split("/").length < 3,
        ),
      },
    });
    expect(
      await readGitHubStateStore({
        octokit: notState.octokit,
        repository: myApp,
        treeOnly: true,
      }),
    ).toEqual({ state: "found", stageFiles: false, stacks: [] });
  });

  it("reads only the tree for the deletion check", async () => {
    const { octokit, requests } = fakeGitHub();

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: true })).toEqual({
      state: "found",
      stageFiles: true,
      stacks: [],
    });
    expect(requests).toEqual([refsUrl, treeUrl]);
  });

  it("finds no stage file on a branch that holds only its README.md", async () => {
    const { octokit } = fakeGitHub({
      tree: { ...recordedTree, tree: recordedTree.tree.slice(0, 1) },
    });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: true })).toEqual({
      state: "found",
      stageFiles: false,
      stacks: [],
    });
  });

  it.each([
    ["no ref", () => Response.json([])],
    ["only the lock branch", () => Response.json([lockRef])],
    // GitHub answers 409 for a repository without a commit.
    ["409", () => Response.json({ message: "Git Repository is empty." }, { status: 409 })],
  ])("finds no store when GitHub answers the refs with %s", async (_name, reply) => {
    const { octokit, requests } = fakeGitHub({ urls: { [refsUrl]: reply } });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: false })).toEqual({
      state: "no_store",
    });
    expect(requests).toEqual([refsUrl]);
  });

  it.each([
    // A repository that the access cannot read: not proof that it has no branch.
    ["404", () => Response.json({ message: "Not Found" }, { status: 404 })],
    [
      "a branch that is not a commit",
      () => Response.json([{ ...stateRef, object: { ...stateRef.object, type: "tag" } }]),
    ],
    [
      "a full page without the branch",
      () => Response.json(Array.from({ length: 100 }, () => lockRef)),
    ],
  ])("fails when GitHub answers the refs with %s", async (_name, reply) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { octokit, requests } = fakeGitHub({ urls: { [refsUrl]: reply } });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: true })).toEqual({
      state: "failed",
    });
    expect(requests).toEqual([refsUrl]);
  });

  it("fails on a truncated tree, since a partial read could hide a stack", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { octokit } = fakeGitHub({ tree: { ...recordedTree, truncated: true } });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: true })).toEqual({
      state: "failed",
    });
  });

  it("fails on a blob that GitHub refuses, and logs no body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { octokit } = fakeGitHub({
      urls: {
        [blobUrl("github-state-spike/demo/Note.json")]: () =>
          Response.json({ message: "body-with-a-secret" }, { status: 500 }),
      },
    });

    expect(await readGitHubStateStore({ octokit, repository: myApp, treeOnly: false })).toEqual({
      state: "failed",
    });
    expect(warn).toHaveBeenCalledWith("github_state_store:read_failed", {
      message: "git blob: 500",
      name: "Error",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("body-with-a-secret");
  });
});
