// Oracle: git itself. For a clean three-way merge, Samebase's rebaseStagedContent should agree with
// `git merge-file`. Run against today's main (packages/git-editor/src/stagingRebase.ts).
import fc from "fast-check";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./run.ts";
const { rebaseStagedContent } = await import(
  new URL("./versions/v9-main/", import.meta.url).href + "packages/git-editor/src/stagingRebase.ts"
);

const dir = mkdtempSync(join(tmpdir(), "merge-oracle-"));
function gitMerge(base: string, ours: string, theirs: string): { clean: boolean; content: string } {
  const [o, b, t] = ["ours", "base", "theirs"].map((n) => join(dir, n));
  writeFileSync(o, ours);
  writeFileSync(b, base);
  writeFileSync(t, theirs);
  try {
    return {
      clean: true,
      content: execFileSync("git", ["merge-file", "-p", o, b, t], { encoding: "utf8" }),
    };
  } catch (error) {
    // git merge-file exits non-zero on conflicts and still prints the merged text.
    const stdout = error instanceof Error && "stdout" in error ? error.stdout : "";
    return { clean: false, content: String(stdout) };
  }
}

// Files are lines; `pool` controls how often lines repeat (blank lines, identical bullets).
const file = (pool: string[]) =>
  fc
    .array(fc.constantFrom(...pool), { maxLength: 6 })
    .map((ls) => ls.map((l) => `${l}\n`).join(""));
const edit = (base: string, pool: string[]) =>
  fc
    .array(fc.tuple(fc.nat(6), fc.boolean(), fc.constantFrom(...pool)), { maxLength: 3 })
    .map((ops) => {
      const ls = base.split("\n").slice(0, -1);
      for (const [i, del, l] of ops) {
        const at = i % (ls.length + 1);
        if (del && ls.length) ls.splice(at % ls.length, 1);
        else ls.splice(at, 0, l);
      }
      return ls.map((l) => `${l}\n`).join("");
    });
const scenario = (pool: string[]) =>
  file(pool).chain((base) =>
    fc.record({ base: fc.constant(base), user: edit(base, pool), upstream: edit(base, pool) }),
  );

for (const [label, pool] of [
  ["unique-ish lines", ["a", "b", "c", "d", "e", "f", "g", "h"]],
  ["repeated lines (blank lines, same bullet)", ["", "- x", "- x", "a"]],
] as const) {
  await run(
    `[main] when git merges cleanly, rebaseStagedContent keeps the same lines as git, in any order (${label})`,
    fc.property(scenario([...pool]), ({ base, user, upstream }) => {
      const git = gitMerge(base, user, upstream);
      if (!git.clean) return true; // git calls it a conflict; either answer is defensible
      const ours = rebaseStagedContent({
        baseContent: base,
        stagedContent: user,
        upstreamContent: upstream,
      });
      const sorted = (s: string) => s.split("\n").sort().join("\n");
      return ours.hasConflict || sorted(ours.content) === sorted(git.content);
    }),
    { numRuns: 3000 },
  );
}
