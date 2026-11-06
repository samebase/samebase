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
});
