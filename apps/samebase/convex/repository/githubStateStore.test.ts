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
import ref from "./fixtures/githubStateStore/ref.json";
import recordedTree from "./fixtures/githubStateStore/tree.json";
import { readGitHubStateStore } from "./githubStateStore";

const api = "https://api.github.com/repos/my-org/my-app";
const refUrl = `${api}/git/ref/heads%2Falchemy-state-store`;
const treeUrl = `${api}/git/trees/${ref.object.sha}?recursive=1`;
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
      (url === refUrl
        ? Response.json(ref)
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
      repository: "my-org/my-app",
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

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: false }),
    ).toEqual({ state: "found", stageFiles: true, stacks: [] });
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
      repository: "my-org/my-app",
      treeOnly: false,
    });

    expect(found).toMatchObject({
      state: "found",
      stacks: [{ name: "my-org/my-app/web", stages: [{ name: "demo" }] }],
    });
    // The README.md, the lease, a file outside a stage folder, and a file that is not JSON.
    expect(requests).toHaveLength(2 + 5);
  });

  it("reads only the tree for the deletion check", async () => {
    const { octokit, requests } = fakeGitHub();

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: true }),
    ).toEqual({ state: "found", stageFiles: true, stacks: [] });
    expect(requests).toEqual([refUrl, treeUrl]);
  });

  it("finds no stage file on a branch that holds only its README.md", async () => {
    const { octokit } = fakeGitHub({
      tree: { ...recordedTree, tree: recordedTree.tree.slice(0, 1) },
    });

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: true }),
    ).toEqual({ state: "found", stageFiles: false, stacks: [] });
  });

  // GitHub answers 409 for a repository without a commit.
  it.each([404, 409])("finds no store when GitHub answers %i for the branch", async (status) => {
    const { octokit, requests } = fakeGitHub({
      urls: { [refUrl]: () => Response.json({ message: "No ref" }, { status }) },
    });

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: false }),
    ).toEqual({ state: "no_store" });
    expect(requests).toEqual([refUrl]);
  });

  it("fails on a truncated tree, since a partial read could hide a stack", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { octokit } = fakeGitHub({ tree: { ...recordedTree, truncated: true } });

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: true }),
    ).toEqual({ state: "failed" });
  });

  it("fails on a blob that GitHub refuses, and logs no body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { octokit } = fakeGitHub({
      urls: {
        [blobUrl("github-state-spike/demo/Note.json")]: () =>
          Response.json({ message: "body-with-a-secret" }, { status: 500 }),
      },
    });

    expect(
      await readGitHubStateStore({ octokit, repository: "my-org/my-app", treeOnly: false }),
    ).toEqual({ state: "failed" });
    expect(warn).toHaveBeenCalledWith("github_state_store:read_failed", {
      message: "git blob: 500",
      name: "Error",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("body-with-a-secret");
  });
});
