/**
A model test of the commit engine, `createCommitWithMultipleFiles`, against an in-memory GitHub.

fast-check makes up stories: the user edits, renames, and deletes files from the snapshot they
loaded, teammates push to GitHub directly, sometimes in the middle of a commit, and the user commits.
Every line is a unique token (`a.B1`, `L3`, `U7`), so "nobody's work was lost" is set logic. After
each commit that reports no conflict, GitHub must hold every line a teammate pushed and every line
the user typed, each once, deleted files must be gone, and renamed files must exist only at their
new path. Refusing with a conflict is always allowed.

Each data-loss bug the engine shipped between March and November 2026 (a force push, a stale base
after a cleanup, a rename then delete, a push during the commit, a line written twice) fails this
test within a few dozen stories, with a counterexample of 2 to 4 steps.
*/
import { Octokit } from "@octokit/rest";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computeGitBlobShaFromText, createCommitWithMultipleFiles } from "./github";

type Tree = Map<string, string>;
type Commit = { tree: string; parents: string[] };

function read(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

function readString(value: unknown, key: string): string {
  const field = read(value, key);
  if (typeof field !== "string") {
    throw new Error(`fake GitHub: ${key} is not a string`);
  }
  return field;
}

/**
The git database part of the GitHub REST API that the engine calls, served through Octokit's
`fetch` option, so the real Octokit client runs. Blob SHAs are real git blob SHAs, because the
engine compares them. Like GitHub, a ref update that is not a fast forward gets 422.
*/
class FakeGitHub {
  private readonly blobs = new Map<string, string>();
  private readonly trees = new Map<string, Tree>();
  private readonly commits = new Map<string, Commit>();
  private head: string;
  private ids = 0;
  requests = 0;
  /** Runs before each request the engine makes, so a story can push during a commit. */
  beforeRequest: ((request: number) => void) | null = null;
  readonly octokit = new Octokit({
    request: { fetch: (input: string, init: RequestInit) => this.fetch(input, init) },
  });

  constructor(files: Record<string, string>) {
    this.head = this.putCommit({
      tree: this.putFiles(new Map(Object.entries(files))),
      parents: [],
    });
  }

  files(): Map<string, string> {
    const tree = this.treeOfCommit(this.head);
    return new Map([...tree].map(([path, sha]) => [path, this.blobs.get(sha) ?? ""]));
  }

  /** Someone else pushes a commit on top of the branch. */
  push(change: (files: Map<string, string>) => void) {
    const files = this.files();
    change(files);
    this.head = this.putCommit({ tree: this.putFiles(files), parents: [this.head] });
  }

  private nextId(prefix: string) {
    this.ids++;
    return `${prefix}${this.ids.toString(16).padStart(8, "0")}`;
  }

  private putBlob(content: string) {
    const sha = computeGitBlobShaFromText(content);
    this.blobs.set(sha, content);
    return sha;
  }

  private putFiles(files: Map<string, string>) {
    const id = this.nextId("t");
    this.trees.set(id, new Map([...files].map(([path, content]) => [path, this.putBlob(content)])));
    return id;
  }

  private putCommit(commit: Commit) {
    const id = this.nextId("c");
    this.commits.set(id, commit);
    return id;
  }

  private treeOfCommit(commit: string): Tree {
    const tree = this.trees.get(this.commits.get(commit)?.tree ?? "");
    if (tree === undefined) {
      throw new Error(`fake GitHub: no commit ${commit}`);
    }
    return tree;
  }

  private isAncestor(ancestor: string, of: string): boolean {
    const stack = [of];
    while (stack.length > 0) {
      const commit = stack.pop() ?? "";
      if (commit === ancestor) {
        return true;
      }
      stack.push(...(this.commits.get(commit)?.parents ?? []));
    }
    return false;
  }

  private respond(request: string, body: unknown): Response {
    const [, method, path] = request.match(/^(\w+) \/repos\/o\/r\/git\/(.+)$/) ?? [];
    const [kind, id = ""] = (path ?? "").split(/\/(.*)/s);
    if (method === "GET" && kind === "ref") {
      return Response.json({ ref: `refs/${id}`, object: { type: "commit", sha: this.head } });
    }
    if (method === "GET" && kind === "commits") {
      const commit = this.commits.get(id);
      if (commit === undefined) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({
        sha: id,
        tree: { sha: commit.tree },
        parents: commit.parents.map((sha) => ({ sha })),
        html_url: `https://github.com/o/r/commit/${id}`,
      });
    }
    if (method === "GET" && kind === "trees") {
      const tree = this.trees.get(id) ?? this.treeOfCommit(id);
      return Response.json({
        sha: id,
        truncated: false,
        tree: [...tree].map(([treePath, sha]) => ({
          path: treePath,
          sha,
          type: "blob",
          mode: "100644",
        })),
      });
    }
    if (method === "GET" && kind === "blobs") {
      const content = this.blobs.get(id);
      if (content === undefined) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({
        sha: id,
        encoding: "base64",
        content: Buffer.from(content, "utf8").toString("base64"),
      });
    }
    if (method === "POST" && kind === "blobs") {
      const content = readString(body, "content");
      const text =
        read(body, "encoding") === "base64"
          ? Buffer.from(content, "base64").toString("utf8")
          : content;
      return Response.json({ sha: this.putBlob(text) }, { status: 201 });
    }
    if (method === "POST" && kind === "trees") {
      const baseTree = read(body, "base_tree");
      const next: Tree = new Map(
        typeof baseTree === "string"
          ? (this.trees.get(baseTree) ?? this.treeOfCommit(baseTree))
          : [],
      );
      const entries = read(body, "tree");
      for (const entry of Array.isArray(entries) ? entries : []) {
        const entryPath = readString(entry, "path");
        const sha = read(entry, "sha");
        const content = read(entry, "content");
        if (sha === null) {
          next.delete(entryPath);
        } else if (typeof content === "string") {
          next.set(entryPath, this.putBlob(content));
        } else {
          next.set(entryPath, readString(entry, "sha"));
        }
      }
      const id = this.nextId("t");
      this.trees.set(id, next);
      return Response.json({ sha: id, tree: [] }, { status: 201 });
    }
    if (method === "POST" && kind === "commits") {
      const parents = read(body, "parents");
      const sha = this.putCommit({
        tree: readString(body, "tree"),
        parents: Array.isArray(parents) ? parents.map(String) : [],
      });
      return Response.json(
        {
          sha,
          tree: { sha: readString(body, "tree") },
          html_url: `https://github.com/o/r/commit/${sha}`,
        },
        { status: 201 },
      );
    }
    if (method === "PATCH" && kind === "refs") {
      const sha = readString(body, "sha");
      if (read(body, "force") !== true && !this.isAncestor(this.head, sha)) {
        return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
      }
      this.head = sha;
      return Response.json({ ref: `refs/${id}`, object: { type: "commit", sha } });
    }
    throw new Error(`fake GitHub: ${request} is not implemented`);
  }

  private async fetch(input: string, init: RequestInit): Promise<Response> {
    this.requests++;
    this.beforeRequest?.(this.requests);
    const url = new URL(input);
    const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : null;
    return this.respond(`${init.method ?? "GET"} ${decodeURIComponent(url.pathname)}`, body);
  }
}

type Id = "a.md" | "b.md";
const IDS: Id[] = ["a.md", "b.md"];
type Op =
  | { k: "edit"; id: Id; pos: number }
  | { k: "upstream"; id: Id; pos: number }
  | { k: "pushSameEdit"; id: Id; pos: number }
  | { k: "rename"; id: Id }
  | { k: "delete"; id: Id }
  | { k: "commit"; raceAtRequest: number | undefined; raceId: Id; racePos: number };

const id = fc.constantFrom<Id>(...IDS);
const pos = fc.nat({ max: 6 });
const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ k: fc.constant("edit" as const), id, pos }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant("upstream" as const), id, pos }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("pushSameEdit" as const), id, pos }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("rename" as const), id }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("delete" as const), id }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant("commit" as const),
      // A teammate pushes before this request of the commit, or not at all.
      raceAtRequest: fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined }),
      raceId: id,
      racePos: pos,
    }),
  },
);
// Every story ends with a commit, so there is always something to check.
const story = fc
  .array(op, { minLength: 1, maxLength: 8 })
  .map((ops): Op[] => [
    ...ops,
    { k: "commit", raceAtRequest: undefined, raceId: "a.md", racePos: 0 },
  ]);

const text = (lines: string[]) => lines.map((line) => `${line}\n`).join("");
const lines = (content: string) => content.split("\n").filter((line) => line.length > 0);
const insertAt = (current: string[], at: number, token: string) => {
  const index = at % (current.length + 1);
  return [...current.slice(0, index), token, ...current.slice(index)];
};

/** Resolves when the engine is done, running its retry waits at once. */
async function settle(promise: Promise<unknown>): Promise<{ error: unknown } | null> {
  const state = { done: false };
  const outcome = promise.then(
    () => null,
    (error: unknown) => ({ error }),
  );
  void outcome.finally(() => {
    state.done = true;
  });
  while (!state.done) {
    await vi.advanceTimersToNextTimerAsync();
  }
  return await outcome;
}

/** The user's view of a file: the snapshot they loaded and their staged change on top of it. */
type Local = {
  snapPath: string;
  snapContent: string;
  path: string;
  lines: string[];
  deleted: boolean;
  touched: boolean;
};

async function playStory(ops: Op[]) {
  const gh = new FakeGitHub({
    "a.md": text(["a.B1", "a.B2", "a.B3"]),
    "b.md": text(["b.B1", "b.B2", "b.B3"]),
  });
  let tokens = 0;
  const pathOnGitHub = new Map<Id, string | null>(IDS.map((file) => [file, file]));
  const mustSurvive = new Map<string, Id>(
    IDS.flatMap((file) => [1, 2, 3].map((k): [string, Id] => [`${file[0]}.B${k}`, file])),
  );
  let local = new Map<Id, Local>();
  let typedByUser = new Map<string, Id>();
  let pushedSinceSnapshot = new Set<Id>();
  const loadSnapshot = () => {
    const files = gh.files();
    local = new Map();
    for (const file of IDS) {
      const path = pathOnGitHub.get(file);
      const content = path == null ? undefined : files.get(path);
      if (path != null && content !== undefined) {
        local.set(file, {
          snapPath: path,
          snapContent: content,
          path,
          lines: lines(content),
          deleted: false,
          touched: false,
        });
      }
    }
    typedByUser = new Map();
    pushedSinceSnapshot = new Set();
  };
  const teammatePush = (file: Id, at: number) => {
    const path = pathOnGitHub.get(file);
    if (path == null) {
      return;
    }
    tokens++;
    const token = `U${tokens}`;
    gh.push((files) => {
      files.set(path, text(insertAt(lines(files.get(path) ?? ""), at, token)));
    });
    mustSurvive.set(token, file);
    pushedSinceSnapshot.add(file);
  };
  loadSnapshot();

  for (const o of ops) {
    if (o.k === "upstream") {
      teammatePush(o.id, o.pos);
      continue;
    }
    if (o.k === "pushSameEdit") {
      // A teammate or an agent pushes the user's staged lines plus one of their own, as when an
      // earlier commit of these staged files landed. Only from the user's snapshot, so the push
      // drops no other line.
      const file = local.get(o.id);
      const path = pathOnGitHub.get(o.id);
      if (
        file === undefined ||
        file.deleted ||
        file.path !== file.snapPath ||
        path == null ||
        pushedSinceSnapshot.has(o.id)
      ) {
        continue;
      }
      tokens++;
      const token = `U${tokens}`;
      const pushed = insertAt(file.lines, o.pos, token);
      gh.push((files) => {
        files.set(path, text(pushed));
      });
      mustSurvive.set(token, o.id);
      pushedSinceSnapshot.add(o.id);
      continue;
    }
    if (o.k !== "commit") {
      const file = local.get(o.id);
      if (file === undefined || file.deleted) {
        continue;
      }
      if (o.k === "edit") {
        tokens++;
        file.lines = insertAt(file.lines, o.pos, `L${tokens}`);
        typedByUser.set(`L${tokens}`, o.id);
      } else if (o.k === "rename" && file.path === file.snapPath) {
        file.path = o.id.replace(".md", "-renamed.md");
      } else if (o.k === "delete") {
        file.deleted = true;
      }
      file.touched = true;
      continue;
    }

    const stagedFiles = [...local.values()]
      .filter((file) => file.touched)
      .map((file) => ({
        kind: "text" as const,
        branch: "main",
        filePath: file.path,
        initialFilePath: file.snapPath,
        content: file.deleted ? file.snapContent : text(file.lines),
        initialContent: file.snapContent,
        fileDeleted: file.deleted,
        parentCommitSha: computeGitBlobShaFromText(file.snapContent),
      }));
    if (stagedFiles.length === 0) {
      continue;
    }
    let raced = false;
    gh.beforeRequest = (request) => {
      if (!raced && o.raceAtRequest !== undefined && request >= o.raceAtRequest) {
        raced = true;
        teammatePush(o.raceId, o.racePos);
      }
    };
    gh.requests = 0;
    const failure = await settle(
      createCommitWithMultipleFiles({
        octokit: gh.octokit,
        owner: "o",
        repo: "r",
        branch: "main",
        stagedFiles,
      }),
    );
    gh.beforeRequest = null;
    if (failure !== null) {
      // Refusing with a conflict is fine; any other failure is a bug.
      expect(String(failure.error)).toMatch(/conflict/i);
      loadSnapshot();
      continue;
    }

    // Check GitHub against the model.
    const files = gh.files();
    const expectedPaths = new Set<string>();
    for (const file of IDS) {
      const staged = local.get(file);
      if (staged?.touched && staged.deleted) {
        expect(files.has(staged.snapPath), `${file} was deleted`).toBe(false);
        expect(files.has(staged.path), `${file} was deleted`).toBe(false);
        // Deleting a file a teammate changed after the snapshot must be refused as a conflict.
        expect(pushedSinceSnapshot.has(file), `deleting ${file} dropped a teammate's push`).toBe(
          false,
        );
        pathOnGitHub.set(file, null);
        for (const [token, owner] of mustSurvive) {
          if (owner === file) {
            mustSurvive.delete(token);
          }
        }
        continue;
      }
      const path = staged?.touched ? staged.path : pathOnGitHub.get(file);
      if (path != null) {
        expectedPaths.add(path);
        pathOnGitHub.set(file, path);
      }
    }
    for (const [token, file] of typedByUser) {
      if (local.get(file)?.deleted !== true) {
        mustSurvive.set(token, file);
      }
    }
    expect([...files.keys()].sort()).toEqual([...expectedPaths].sort());
    for (const [path, content] of files) {
      const fileLines = lines(content);
      expect(fileLines, `no line is written twice in ${path}`).toEqual([...new Set(fileLines)]);
    }
    for (const [token, file] of mustSurvive) {
      const path = pathOnGitHub.get(file) ?? "";
      expect(lines(files.get(path) ?? ""), `${token} is on GitHub in ${path}`).toContain(token);
    }
    loadSnapshot();
  }
}

describe("createCommitWithMultipleFiles model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loses no line and no file change when a commit goes through", async () => {
    await fc.assert(fc.asyncProperty(story, playStory), { numRuns: 500 });
  });
});
