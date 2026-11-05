// An in-memory GitHub git database with the parts of the REST API the commit engine calls.
// Blob SHAs are real git blob SHAs (the engine compares them). updateRef without force
// refuses a non-fast-forward with 422, as GitHub does.
import { createHash } from "node:crypto";

type Tree = Map<string, string>; // path -> blob sha
type Commit = { tree: string; parents: string[] };

export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

export class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Tree>();
  commits = new Map<string, Commit>();
  refs = new Map<string, string>();
  private ids = 0;
  /** Called before each API call the engine makes; lets a test push upstream mid-commit. */
  beforeCall: ((n: number, name: string) => void) | null = null;
  calls = 0;

  constructor(files: Record<string, string>, branch = "main") {
    const tree = this.putTree(new Map(Object.entries(files).map(([p, c]) => [p, this.putBlob(c)])));
    this.refs.set(branch, this.putCommit({ tree, parents: [] }));
  }

  private id(prefix: string) { return `${prefix}${(++this.ids).toString(16).padStart(8, "0")}`; }
  putBlob(content: string) { const sha = gitBlobSha(content); this.blobs.set(sha, content); return sha; }
  putTree(tree: Tree) { const id = this.id("t"); this.trees.set(id, tree); return id; }
  putCommit(c: Commit) { const id = this.id("c"); this.commits.set(id, c); return id; }

  head(branch = "main") { return this.refs.get(branch)!; }
  files(branch = "main"): Map<string, string> {
    const tree = this.trees.get(this.commits.get(this.head(branch))!.tree)!;
    return new Map([...tree].map(([p, sha]) => [p, this.blobs.get(sha)!]));
  }
  /** A direct push by someone else: a new commit on top of the branch. */
  push(change: (files: Map<string, string>) => void, branch = "main") {
    const files = this.files(branch);
    change(files);
    const tree = this.putTree(new Map([...files].map(([p, c]) => [p, this.putBlob(c)])));
    this.refs.set(branch, this.putCommit({ tree, parents: [this.head(branch)] }));
  }

  private isAncestor(ancestor: string, of: string): boolean {
    const seen = new Set<string>(); const stack = [of];
    while (stack.length) { const c = stack.pop()!; if (c === ancestor) return true; if (seen.has(c)) continue; seen.add(c); stack.push(...(this.commits.get(c)?.parents ?? [])); }
    return false;
  }
  private resolveTree(ref: string): string {
    if (this.trees.has(ref)) return ref;
    if (this.commits.has(ref)) return this.commits.get(ref)!.tree;
    const branch = ref.replace(/^refs\//, "").replace(/^heads\//, "");
    if (this.refs.has(branch)) return this.commits.get(this.refs.get(branch)!)!.tree;
    throw httpError(404, `Not Found: tree ${ref}`);
  }
  private branchOf(ref: string) { return ref.replace(/^refs\//, "").replace(/^heads\//, ""); }

  private wrap<A, R>(name: string, fn: (a: A) => R) {
    return async (a: A) => { this.calls++; this.beforeCall?.(this.calls, name); return { status: 200, data: fn(a) }; };
  }

  octokit = {
    rest: {
      git: {
        getRef: this.wrap("getRef", ({ ref }: { ref: string }) => {
          const sha = this.refs.get(this.branchOf(ref)); if (!sha) throw httpError(404, "Not Found");
          return { ref: `refs/heads/${this.branchOf(ref)}`, object: { type: "commit", sha } };
        }),
        getCommit: this.wrap("getCommit", ({ commit_sha }: { commit_sha: string }) => {
          const c = this.commits.get(commit_sha); if (!c) throw httpError(404, "Not Found");
          return { sha: commit_sha, tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), html_url: `https://github.com/o/r/commit/${commit_sha}` };
        }),
        getTree: this.wrap("getTree", ({ tree_sha }: { tree_sha: string }) => {
          const id = this.resolveTree(tree_sha);
          return { sha: id, truncated: false, tree: [...this.trees.get(id)!].map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })) };
        }),
        getBlob: this.wrap("getBlob", ({ file_sha }: { file_sha: string }) => {
          const c = this.blobs.get(file_sha); if (c === undefined) throw httpError(404, "Not Found");
          return { sha: file_sha, encoding: "base64", content: Buffer.from(c, "utf8").toString("base64") };
        }),
        createBlob: this.wrap("createBlob", ({ content, encoding }: { content: string; encoding?: string }) => {
          const text = encoding === "base64" ? Buffer.from(content, "base64").toString("utf8") : content;
          return { sha: this.putBlob(text) };
        }),
        createTree: this.wrap("createTree", ({ base_tree, tree }: { base_tree?: string; tree: any[] }) => {
          const next: Tree = new Map(base_tree ? this.trees.get(this.resolveTree(base_tree))! : []);
          for (const e of tree) {
            if (e.sha === null) next.delete(e.path);
            else if (typeof e.content === "string") next.set(e.path, this.putBlob(e.content));
            else if (typeof e.sha === "string") next.set(e.path, e.sha);
          }
          return { sha: this.putTree(next), tree: [] };
        }),
        createCommit: this.wrap("createCommit", ({ tree, parents }: { tree: string; parents: string[] }) => {
          const sha = this.putCommit({ tree, parents });
          return { sha, tree: { sha: tree }, html_url: `https://github.com/o/r/commit/${sha}` };
        }),
        updateRef: this.wrap("updateRef", ({ ref, sha, force }: { ref: string; sha: string; force?: boolean }) => {
          const branch = this.branchOf(ref); const current = this.refs.get(branch)!;
          if (!force && !this.isAncestor(current, sha)) throw httpError(422, "Update is not a fast forward");
          this.refs.set(branch, sha);
          return { ref: `refs/heads/${branch}`, object: { type: "commit", sha } };
        }),
      },
      repos: new Proxy({}, { get: (_t, name) => () => { throw new Error(`fake GitHub: repos.${String(name)} not implemented`); } }),
    },
  };
}
