import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, it, expect } from "vite-plus/test";
import { rebaseStagedContent } from "./stagingRebase";

describe("rebaseStagedContent", () => {
  it("applies a non-conflicting patch on top of upstream", () => {
    const baseContent = "A\nB\nC\n";
    const stagedContent = "A\nB\nC\nD\n";
    const upstreamContent = "A\nB\nX\nC\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toBe("A\nB\nX\nC\nD\n");
  });

  it("returns conflict markers when patch cannot be applied", () => {
    const baseContent = "A\nB\nC\n";
    const stagedContent = "A\nB\nours\n";
    const upstreamContent = "A\nB\ntheirs\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.content).toContain("<<<<<<< samebase");
    expect(result.content).toContain("=======");
    expect(result.content).toContain(">>>>>>> main");
    expect(result.content).toContain("ours");
    expect(result.content).toContain("theirs");
  });

  it("returns upstream content when staged matches upstream", () => {
    const baseContent = "A\n";
    const stagedContent = "A\nB\n";
    const upstreamContent = "A\nB\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toBe(upstreamContent);
  });

  it("merges insertion-only edits when upstream inserted nearby lines", () => {
    const baseContent = [
      "# TODO",
      "",
      "- light panda",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- We need less",
      "",
    ].join("\n");
    const stagedContent = [
      "# TODO",
      "",
      "- light panda",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "- void.cloud",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- We need less",
      "",
    ].join("\n");
    const upstreamContent = [
      "# TODO",
      "",
      "- light panda",
      "- review Observable notebooks docs",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "- Tuple",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- bootstrap pnpm dev:worktree non-interactive",
      "- We need less",
      "",
    ].join("\n");

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toContain("- void.cloud\n- Tuple");
    expect(result.content).toContain("- review Observable notebooks docs");
    expect(result.content).toContain("- bootstrap pnpm dev:worktree non-interactive");
  });

  it("returns a conflict when repeated context makes insertion placement ambiguous", () => {
    const result = rebaseStagedContent({
      baseContent: "A\nA\nA\nA\n",
      stagedContent: "A\nA\nA\nA\nB\n",
      upstreamContent: "A\nA\nA\nB\n",
    });

    expect(result.hasConflict).toBe(true);
    expect(result.content).toContain("<<<<<<< samebase");
  });

  it("writes a line once when upstream already has the staged insertion", () => {
    const result = rebaseStagedContent({
      baseContent: "a\nb\n",
      stagedContent: "a\nb\nmine\n",
      upstreamContent: "top\na\nb\nmine\n",
    });

    expect(result).toEqual({ content: "top\na\nb\nmine\n", hasConflict: false });
  });

  it("merges the same replacement on both sides", () => {
    const result = rebaseStagedContent({
      baseContent: "a\nb\nc\n",
      stagedContent: "a\nB\nc\n",
      upstreamContent: "top\na\nB\nc\n",
    });

    expect(result).toEqual({ content: "top\na\nB\nc\n", hasConflict: false });
  });

  it("returns a conflict when upstream made only some of the staged changes", () => {
    // Both sides deleted "b", and their other changes touch, as git merge-file also finds. A patch
    // of only the staged-only change once applied here and dropped the final newline.
    const result = rebaseStagedContent({
      baseContent: "\nb\n\n\n",
      stagedContent: "\n\nX\n",
      upstreamContent: "Y\n\n\n",
    });

    expect(result.hasConflict).toBe(true);
  });

  it.each([
    {
      // With a repeated line, the user's "a" could match a different "a" upstream and vanish.
      name: "a repeated line that may already be upstream",
      baseContent: "a\n",
      stagedContent: "a\na\n",
      upstreamContent: "b\na\nb\na\n",
    },
    {
      // Kept side by side, "mine" without a line ending would join "theirs" into one line.
      name: "an insertion without a final newline next to another insertion",
      baseContent: "anchor\n",
      stagedContent: "anchor\nmine",
      upstreamContent: "anchor\ntheirs\n",
    },
    {
      name: "the same inserted lines in a different order",
      baseContent: "anchor\n",
      stagedContent: "anchor\nL1\nL2\n",
      upstreamContent: "anchor\nL2\nL1\n",
    },
  ])("returns a conflict for $name", ({ baseContent, stagedContent, upstreamContent }) => {
    expect(rebaseStagedContent({ baseContent, stagedContent, upstreamContent }).hasConflict).toBe(
      true,
    );
  });

  it("merges a large file", () => {
    const baseContent = "a\n".repeat(150_000);
    const result = rebaseStagedContent({
      baseContent,
      stagedContent: `X\n${baseContent}`,
      upstreamContent: `${baseContent}Y\n`,
    });

    expect(result).toEqual({ content: `X\n${baseContent}Y\n`, hasConflict: false });
  });
});

// Every line is a unique token, so "a line is lost or written twice" is a count.
const text = (lines: string[]) => lines.map((line) => `${line}\n`).join("");
const insertAll = (lines: string[], inserts: Array<{ at: number; line: string }>) =>
  inserts.reduce((result, { at, line }) => {
    const index = at % (result.length + 1);
    return [...result.slice(0, index), line, ...result.slice(index)];
  }, lines);
const baseLines = fc
  .integer({ min: 0, max: 6 })
  .map((count) => Array.from({ length: count }, (_, i) => `base${i}`));
const inserts = (prefix: string) =>
  fc
    .array(fc.nat(), { maxLength: 4 })
    .map((positions) => positions.map((at, i) => ({ at, line: `${prefix}${i}` })));
/** Inserts, deletes, and replaces lines; new lines are unique tokens. */
const edits = (prefix: string) =>
  fc
    .array(fc.record({ kind: fc.constantFrom("insert", "delete", "replace"), at: fc.nat() }), {
      maxLength: 4,
    })
    .map((list) => list.map((edit, i) => ({ ...edit, line: `${prefix}${i}` })));
const applyEdits = (
  lines: string[],
  list: Array<{ kind: "insert" | "delete" | "replace"; at: number; line: string }>,
) =>
  list.reduce((result, { kind, at, line }) => {
    if (kind === "insert") {
      const index = at % (result.length + 1);
      return [...result.slice(0, index), line, ...result.slice(index)];
    }
    if (result.length === 0) {
      return result;
    }
    const index = at % result.length;
    return [
      ...result.slice(0, index),
      ...(kind === "replace" ? [line] : []),
      ...result.slice(index + 1),
    ];
  }, lines);

describe("rebaseStagedContent properties", () => {
  it("adds nothing when upstream already has the staged edit", () => {
    fc.assert(
      fc.property(baseLines, inserts("user"), inserts("teammate"), (base, user, teammate) => {
        const staged = insertAll(base, user);
        const result = rebaseStagedContent({
          baseContent: text(base),
          stagedContent: text(staged),
          upstreamContent: text(insertAll(staged, teammate)),
        });

        expect(result).toEqual({ content: text(insertAll(staged, teammate)), hasConflict: false });
      }),
      { numRuns: 2_000 },
    );
  });

  it("keeps every line once when the user and a teammate insert lines", () => {
    fc.assert(
      fc.property(baseLines, inserts("user"), inserts("teammate"), (base, user, teammate) => {
        const result = rebaseStagedContent({
          baseContent: text(base),
          stagedContent: text(insertAll(base, user)),
          upstreamContent: text(insertAll(base, teammate)),
        });
        fc.pre(!result.hasConflict);

        const expected = [
          ...base,
          ...user.map(({ line }) => line),
          ...teammate.map(({ line }) => line),
        ];
        expect(result.content.split("\n").filter(Boolean).sort()).toEqual(expected.sort());
      }),
      { numRuns: 2_000 },
    );
  });

  it("gives git's result whenever git merge-file merges cleanly", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "staging-rebase-"));
    const gitMerge = (base: string, ours: string, theirs: string): string | null => {
      writeFileSync(path.join(dir, "base"), base);
      writeFileSync(path.join(dir, "ours"), ours);
      writeFileSync(path.join(dir, "theirs"), theirs);
      const merged = spawnSync("git", ["merge-file", "-p", "ours", "base", "theirs"], {
        cwd: dir,
        encoding: "utf8",
      });
      // Exit status 0 is a clean merge; a positive status is the number of conflicts.
      return merged.status === 0 ? merged.stdout : null;
    };
    try {
      fc.assert(
        fc.property(
          baseLines,
          edits("user"),
          edits("teammate"),
          fc.boolean(),
          (base, user, teammate, teammateStartsFromUser) => {
            const staged = applyEdits(base, user);
            const upstream = applyEdits(teammateStartsFromUser ? staged : base, teammate);
            const git = gitMerge(text(base), text(staged), text(upstream));
            fc.pre(git !== null);

            expect(
              rebaseStagedContent({
                baseContent: text(base),
                stagedContent: text(staged),
                upstreamContent: text(upstream),
              }),
            ).toEqual({ content: git, hasConflict: false });
          },
        ),
        { numRuns: 300 },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never makes up or joins lines, with repeated lines and any line endings", () => {
    // Repeated lines make "which copy changed" ambiguous, so the exact result can differ from git.
    // Whatever the merge picks, a clean result holds only lines of the two sides, and a side that
    // did not change the file gets the other side's content exactly.
    const line = fc.constantFrom("a\n", "b\n", "\n", "a\r\n", "a", "");
    const content = fc.array(line, { maxLength: 6 }).map((lines) => lines.join(""));
    const lineSet = (text: string) => new Set(text === "" ? [] : text.split(/(?<=\n)/));
    fc.assert(
      fc.property(content, content, content, (baseContent, stagedContent, upstreamContent) => {
        const result = rebaseStagedContent({ baseContent, stagedContent, upstreamContent });
        if (stagedContent === baseContent) {
          expect(result).toEqual({ content: upstreamContent, hasConflict: false });
        }
        if (upstreamContent === baseContent) {
          expect(result).toEqual({ content: stagedContent, hasConflict: false });
        }
        fc.pre(!result.hasConflict);

        const sides = new Set([...lineSet(stagedContent), ...lineSet(upstreamContent)]);
        for (const merged of lineSet(result.content)) {
          expect(sides, JSON.stringify(merged)).toContain(merged);
        }
      }),
      { numRuns: 5_000 },
    );
  });
});
