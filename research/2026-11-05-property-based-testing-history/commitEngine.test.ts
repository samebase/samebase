// Model-based test of the vault commit engine (createCommitWithMultipleFiles), run against the real
// engine at nine commits from Feb to Nov 2026, with an in-memory GitHub.
//
// A random story: the user edits, renames and deletes files from the snapshot they loaded, while
// teammates push to GitHub directly, sometimes in the middle of a commit. Then the user commits.
// Lines are unique tokens (a.B1, L3, U7), so "nobody's work was lost" is set logic.
import fc from "fast-check";
import { FakeGitHub, gitBlobSha } from "./fakeGitHub.ts";
import { run } from "./run.ts";

// The engine waits 500 ms between retries; skip the wait.
globalThis.setTimeout = ((fn: () => void) => { queueMicrotask(fn); return 0; }) as any;
console.log = console.warn = console.error = console.info = () => {};

const VERSIONS: Array<[label: string, entry: string]> = [
  ["v1-before-d6e75127a", "apps/noter/convex/fileStagingActions.ts"],
  ["v2-d6e75127a", "apps/noter/convex/fileStagingActions.ts"],
  ["v3-d18b1c286", "apps/noter/convex/fileStagingActions.ts"],
  ["v4-51432b848", "apps/noter/convex/fileStagingActions.ts"],
  ["v5-before-c7a9fd65e", "apps/samebase/convex/fileStagingActions.ts"],
  ["v6-c7a9fd65e", "apps/samebase/convex/fileStagingActions.ts"],
  ["v7-before-7ceb8f30c", "apps/samebase/convex/fileStagingActions.ts"],
  ["v8-7ceb8f30c", "apps/samebase/convex/fileStagingActions.ts"],
  ["v7m-before-3e3b443ae", "apps/samebase/convex/fileStagingActions.ts"],
  ["v8m-3e3b443ae", "packages/git-editor/src/github.ts"],
  ["v9-main", "packages/git-editor/src/github.ts"],
];
const ROOT = (await import("node:fs")).realpathSync(new URL(".", import.meta.url).pathname).replace(/\/$/, "");
const only = process.env.ONLY;
const RACE = process.env.RACE !== "0";
const stats = { commits: 0, ok: 0, conflict: 0, okWithRace: 0, okWithStaleBase: 0 };

type Id = "a.md" | "b.md";
const IDS: Id[] = ["a.md", "b.md"];
type Op =
  | { k: "edit"; id: Id; pos: number }
  | { k: "upstream"; id: Id; pos: number }
  | { k: "rename"; id: Id }
  | { k: "delete"; id: Id }
  | { k: "commit"; raceAtCall: number | undefined; raceId: Id; racePos: number };

const id = fc.constantFrom<Id>(...IDS);
const pos = fc.nat({ max: 6 });
const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ k: fc.constant("edit" as const), id, pos }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant("upstream" as const), id, pos }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("rename" as const), id }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("delete" as const), id }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("commit" as const), raceAtCall: RACE ? fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined }) : fc.constant(undefined), raceId: id, racePos: pos }) },
);
// Every story ends with a commit with no race, so there is always something to check.
const story = fc.array(op, { minLength: 1, maxLength: 8 })
  .map((ops) => [...ops, { k: "commit", raceAtCall: undefined, raceId: "a.md", racePos: 0 } as Op]);

const text = (lines: string[]) => lines.map((l) => `${l}\n`).join("");
const lines = (content: string) => content.split("\n").filter((l) => l.length > 0);
const insertAt = (ls: string[], p: number, token: string) => { const i = p % (ls.length + 1); return [...ls.slice(0, i), token, ...ls.slice(i)]; };

class LostWork extends Error {}

async function playStory(engine: any, ops: Op[], strictDeletes: boolean) {
  const gh = new FakeGitHub({ "a.md": text(["a.B1", "a.B2", "a.B3"]), "b.md": text(["b.B1", "b.B2", "b.B3"]) });
  let n = 0;
  const ghPath = new Map<Id, string | null>(IDS.map((i) => [i, i]));
  const mustSurvive = new Map<string, Id>(IDS.flatMap((i) => [1, 2, 3].map((k) => [`${i[0]}.B${k}`, i] as [string, Id])));
  // The user's view: the snapshot they loaded and their staged changes on top of it.
  type Local = { snapPath: string; snapContent: string; path: string; lines: string[]; deleted: boolean; touched: boolean };
  let local = new Map<Id, Local>();
  let pendingUser = new Map<string, Id>();
  let upstreamSinceSnapshot = new Set<Id>();
  const sync = () => {
    const files = gh.files();
    local = new Map();
    for (const i of IDS) {
      const p = ghPath.get(i);
      if (p != null && files.has(p)) local.set(i, { snapPath: p, snapContent: files.get(p)!, path: p, lines: lines(files.get(p)!), deleted: false, touched: false });
    }
    pendingUser = new Map();
    upstreamSinceSnapshot = new Set();
  };
  sync();
  const pushUpstream = (i: Id, p: number) => {
    const path = ghPath.get(i);
    if (path == null) return;
    const token = `U${++n}`;
    gh.push((files) => { files.set(path, text(insertAt(lines(files.get(path) ?? ""), p, token))); });
    mustSurvive.set(token, i);
    upstreamSinceSnapshot.add(i);
  };

  for (const o of ops) {
    const l = "id" in o ? local.get(o.id) : undefined;
    if (o.k === "edit" && l && !l.deleted) { const t = `L${++n}`; l.lines = insertAt(l.lines, o.pos, t); l.touched = true; pendingUser.set(t, o.id); }
    if (o.k === "upstream") pushUpstream(o.id, o.pos);
    if (o.k === "rename" && l && !l.deleted && l.path === l.snapPath) { l.path = o.id.replace(".md", "-renamed.md"); l.touched = true; }
    if (o.k === "delete" && l && !l.deleted) { l.deleted = true; l.touched = true; }
    if (o.k !== "commit") continue;

    const staged = [...local].filter(([, f]) => f.touched).map(([, f]) => ({
      kind: "text" as const, branch: "main", filePath: f.path, initialFilePath: f.snapPath,
      content: f.deleted ? f.snapContent : text(f.lines), initialContent: f.snapContent,
      fileDeleted: f.deleted, parentCommitSha: gitBlobSha(f.snapContent),
    }));
    if (staged.length === 0) continue;
    let raced = false;
    gh.beforeCall = (call) => { if (!raced && o.raceAtCall !== undefined && call >= o.raceAtCall) { raced = true; pushUpstream(o.raceId, o.racePos); } };
    gh.calls = 0;
    const staleBase = upstreamSinceSnapshot.size > 0;
    stats.commits++;
    try {
      await engine({ octokit: gh.octokit, owner: "o", repo: "r", branch: "main", stagedFiles: staged });
    } catch (error) {
      gh.beforeCall = null;
      if (/conflict/i.test(String((error as Error)?.message))) { stats.conflict++; sync(); continue; } // refusing is fine
      throw new Error(`commit crashed: ${(error as Error)?.message}`);
    }
    gh.beforeCall = null;
    stats.ok++; if (raced) stats.okWithRace++; if (staleBase) stats.okWithStaleBase++;

    // Check GitHub against the model.
    const files = gh.files();
    const expectedPaths = new Map<string, Id>();
    for (const i of IDS) {
      const f = local.get(i);
      const deletedNow = f?.touched && f.deleted;
      if (deletedNow) {
        for (const p of new Set([f!.snapPath, f!.path])) if (files.has(p)) throw new LostWork(`${i} was deleted, but GitHub still has ${p}`);
        if (strictDeletes && upstreamSinceSnapshot.has(i)) throw new LostWork(`deleting ${i} silently deleted a teammate's newer edit (no conflict reported)`);
        ghPath.set(i, null);
        for (const [t, owner] of mustSurvive) if (owner === i) mustSurvive.delete(t);
        continue;
      }
      const path = f?.touched ? f.path : ghPath.get(i);
      if (path == null) continue;
      expectedPaths.set(path, i);
      ghPath.set(i, path);
    }
    for (const [t, i] of pendingUser) if (!(local.get(i)?.deleted)) mustSurvive.set(t, i);
    for (const p of files.keys()) if (!expectedPaths.has(p)) throw new LostWork(`GitHub has an unexpected file ${p}`);
    for (const [t, i] of mustSurvive) {
      const path = ghPath.get(i)!;
      if (!files.has(path)) throw new LostWork(`${path} is missing on GitHub`);
      if (!lines(files.get(path)!).includes(t)) {
        const who = t.startsWith("U") ? "a teammate's line" : t.startsWith("L") ? "the user's line" : "an untouched line";
        throw new LostWork(`${who} ${t} is gone from ${path}`);
      }
    }
    sync();
  }
}

for (const strict of [false, true]) {
  process.stdout.write(strict
    ? "\nStrict: also require a conflict when the user deletes a file that a teammate changed after the user's snapshot\n"
    : "Core: after a commit with no conflict reported, nobody's lines are lost and the file list is right\n");
  for (const [label, entry] of VERSIONS) {
    if (only && !label.includes(only)) continue;
    const { createCommitWithMultipleFiles } = await import(`${ROOT}/versions/${label}/${entry}`);
    Object.assign(stats, { commits: 0, ok: 0, conflict: 0, okWithRace: 0, okWithStaleBase: 0 });
    await run(label, fc.asyncProperty(story, (ops) => playStory(createCommitWithMultipleFiles, ops, strict)), { numRuns: Number(process.env.RUNS ?? 2000) });
    if (process.env.STATS) process.stdout.write(`      commits ${stats.commits}, went through ${stats.ok} (on a stale base ${stats.okWithStaleBase}, with a push mid-commit ${stats.okWithRace}), refused as conflict ${stats.conflict}\n`);
  }
}
